import crypto from 'node:crypto';
import path from 'node:path';
import { childProcessExists, runPythonScriptIfAvailable } from './pythonPdfHelper';
import { GoogleGenAI } from '@google/genai';
import {
  DocumentChunk,
  DocumentType,
  ProcessingStatus,
  StudyMaterial,
} from '../types';
import { computeDeterministicEmbedding, sanitizeDashes } from '../domain/engine';
import { repo } from './repository';
import { isSupabaseConfigured, supabaseStorageService } from './supabase';

// Global polyfills for serverless Node environments when pdfjs-dist is loaded
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(_init?: any) {}
  };
}
if (typeof (globalThis as any).ImageData === 'undefined') {
  (globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(w = 0, h = 0) {
      this.width = w;
      this.height = h;
      this.data = new Uint8ClampedArray(w * h * 4);
    }
  };
}
if (typeof (globalThis as any).Path2D === 'undefined') {
  (globalThis as any).Path2D = class Path2D {
    constructor() {}
  };
}

// ============================================================================
// Configuration: Gemini Embedding & Consistent Dimensionality
// ============================================================================
export const GEMINI_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004';

// Consistent dimension used for BOTH document chunk vectors and RAG query vectors
export const EMBEDDING_DIMENSION = Number(process.env.EMBEDDING_DIMENSIONS) || 64;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
  if (!apiKey || apiKey.includes('placeholder') || apiKey.includes('your-gemini-')) {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Generates an embedding vector using official Google Gemini API (text-embedding-004)
 * with consistent output dimensionality. Falls back deterministically if API key is not yet set.
 */
export async function generateGeminiEmbedding(text: string): Promise<number[]> {
  const client = getGeminiClient();
  if (client) {
    try {
      const response = await client.models.embedContent({
        model: GEMINI_EMBEDDING_MODEL,
        contents: text,
        config: {
          outputDimensionality: EMBEDDING_DIMENSION,
        },
      });

      const values =
        (response as any).embedding?.values ||
        (response as any).embeddings?.[0]?.values;
      if (values && values.length > 0) {
        return values;
      }
    } catch (err: any) {
      console.warn('Notice: Gemini embedContent API call notice:', err.message);
    }
  }

  // Consistent deterministic fallback with identical dimensionality
  return computeDeterministicEmbedding(text, EMBEDDING_DIMENSION);
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface IngestionResult {
  material: StudyMaterial;
  chunksIndexed: number;
  extractedPages: number;
  duplicateDetected: boolean;
  status: ProcessingStatus;
}

// ============================================================================
// Document Ingestion Pipeline
// ============================================================================
export const ingestionService = {
  /**
   * 1. Validate the file: checks extension, MIME type, size, and computes SHA-256 hash.
   */
  validateFile(params: {
    fileName: string;
    buffer: Buffer;
    fileSize?: number;
    mimeType?: string;
  }): {
    isValid: boolean;
    error?: string;
    contentHash: string;
    docType: DocumentType;
  } {
    const { fileName, buffer } = params;
    const size = params.fileSize || buffer.length;

    if (!buffer || buffer.length === 0) {
      return {
        isValid: false,
        error: 'File is empty (0 bytes).',
        contentHash: '',
        docType: 'Plain Text',
      };
    }

    if (size > 25 * 1024 * 1024) {
      return {
        isValid: false,
        error: 'File size exceeds maximum allowed limit of 25 MB.',
        contentHash: '',
        docType: 'Plain Text',
      };
    }

    const ext = path.extname(fileName).toLowerCase();
    if (!['.pdf', '.txt', '.md'].includes(ext)) {
      return {
        isValid: false,
        error: `Unsupported file type "${ext}". Supported formats: PDF (.pdf), Plain Text (.txt), Markdown (.md).`,
        contentHash: '',
        docType: 'Plain Text',
      };
    }

    // Verify PDF header for PDF files
    if (ext === '.pdf') {
      const header = buffer.subarray(0, 5).toString('latin1');
      if (!header.startsWith('%PDF-')) {
        return {
          isValid: false,
          error: 'Invalid PDF format: missing %PDF- header signature.',
          contentHash: '',
          docType: 'Textbook',
        };
      }
    }

    // Compute SHA-256 hash for duplicate detection
    const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Infer Document Type from file name if not provided
    let inferredType: DocumentType = 'Textbook';
    const lowerName = fileName.toLowerCase();
    if (lowerName.includes('syllabus')) inferredType = 'Syllabus';
    else if (lowerName.includes('past') || lowerName.includes('question') || lowerName.includes('paper')) {
      inferredType = 'Past Paper';
    } else if (lowerName.includes('note')) inferredType = 'Study Notes';
    else if (ext === '.txt' || ext === '.md') inferredType = 'Plain Text';

    return {
      isValid: true,
      contentHash,
      docType: inferredType,
    };
  },

  /**
   * 2. Extract text and preserve page numbers using PyMuPDF/pdfplumber (if Python available)
   * or high-performance native PDFParse.
   */
  async extractText(params: {
    buffer: Buffer;
    fileName: string;
  }): Promise<ExtractedPage[]> {
    const { buffer, fileName } = params;
    const ext = path.extname(fileName).toLowerCase();

    if (ext === '.txt' || ext === '.md') {
      const fullText = buffer.toString('utf8');
      return this.splitPlainTextIntoPages(fullText);
    }

    // 1. Try PyMuPDF / pdfplumber if Python is supported on the backend
    try {
      const pythonPages = await runPythonScriptIfAvailable(buffer);
      if (pythonPages && pythonPages.length > 0) {
        return pythonPages.map((p) => ({
          pageNumber: p.pageNumber,
          text: this.cleanText(p.text),
        }));
      }
    } catch {
      // Python unavailable or PyMuPDF error -> fall through to native PDFParse
    }

    // 2. High-performance native PDFParse with page preservation
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();

      if (result.pages && Array.isArray(result.pages) && result.pages.length > 0) {
        return result.pages.map((p: any, idx: number) => ({
          pageNumber: idx + 1,
          text: this.cleanText(p.text || ''),
        }));
      }

      // Fallback: split on form feeds or default page
      if (result.text && result.text.trim().length > 0) {
        return this.splitPlainTextIntoPages(result.text);
      }
    } catch (err: any) {
      console.warn('PDFParse primary parse notice:', err.message);
    }

    // 3. Fallback extraction from raw stream if needed
    const rawText = buffer.toString('latin1').replace(/[^\x20-\x7E\n\r]/g, ' ');
    return [
      {
        pageNumber: 1,
        text: this.cleanText(rawText.slice(0, 5000)),
      },
    ];
  },

  /**
   * 3. Cleaning text: normalizes dashes, fixes excess whitespace, strips non-printable control characters.
   */
  cleanText(input: string): string {
    if (!input) return '';
    return sanitizeDashes(
      input
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    );
  },

  splitPlainTextIntoPages(rawText: string): ExtractedPage[] {
    const cleaned = this.cleanText(rawText);
    // Split by form feeds (\f) or page markers if present
    const pageSplits = cleaned.split(/(?:\f|---+ Page \d+ ---+|\[Page \d+\])/i);
    if (pageSplits.length > 1) {
      return pageSplits
        .map((text, idx) => ({ pageNumber: idx + 1, text: text.trim() }))
        .filter((p) => p.text.length > 0);
    }

    // Approximate pages by ~350 words
    const words = cleaned.split(/\s+/);
    const pages: ExtractedPage[] = [];
    const wordsPerPage = 350;
    for (let i = 0; i < words.length; i += wordsPerPage) {
      const slice = words.slice(i, i + wordsPerPage).join(' ');
      pages.push({
        pageNumber: Math.floor(i / wordsPerPage) + 1,
        text: slice,
      });
    }

    return pages.length > 0 ? pages : [{ pageNumber: 1, text: cleaned }];
  },

  /**
   * 4 & 5. Identify Headings & Sections and Split into Meaningful Chunks.
   * Every chunk contains:
   * - student_id
   * - document_id
   * - chunk_id
   * - document_name
   * - page_number
   * - chapter
   * - section
   * - extracted_text
   * - embedding
   */
  async createChunksWithEmbeddings(params: {
    studentId: string;
    documentId: string;
    documentName: string;
    subject: string;
    pages: ExtractedPage[];
    onProgress?: (stage: ProcessingStatus, current: number, total: number) => void;
  }): Promise<DocumentChunk[]> {
    const { studentId, documentId, documentName, subject, pages, onProgress } = params;

    let currentChapter = `Chapter 1: ${subject}`;
    let currentSection = 'Overview and Core Mechanisms';
    let currentTopic = subject;

    const rawChunkList: Array<{
      pageNumber: number;
      chapter: string;
      section: string;
      topic: string;
      content: string;
    }> = [];

    // Chunking: target 120-220 words per chunk with overlap
    for (const page of pages) {
      const lines = page.text.split('\n').map((l) => l.trim()).filter(Boolean);
      let buffer: string[] = [];
      let bufferWords = 0;

      const flushBuffer = () => {
        if (buffer.length === 0) return;
        const text = buffer.join(' ').trim();
        if (text.length >= 25) {
          rawChunkList.push({
            pageNumber: page.pageNumber,
            chapter: currentChapter,
            section: currentSection,
            topic: currentTopic,
            content: text,
          });
        }
        // Keep 20-word overlap for contextual continuity
        const words = text.split(/\s+/);
        const overlap = words.slice(Math.max(0, words.length - 20)).join(' ');
        buffer = overlap ? [overlap] : [];
        bufferWords = overlap.split(/\s+/).length;
      };

      for (const line of lines) {
        // Heading identification
        const chapterMatch = line.match(/^(?:Chapter|Unit)\s*(\d+)?[:.-]?\s*(.+)$/i);
        if (chapterMatch && line.length < 80) {
          flushBuffer();
          currentChapter = sanitizeDashes(line);
          if (chapterMatch[2]) currentTopic = sanitizeDashes(chapterMatch[2].trim());
          continue;
        }

        const sectionMatch = line.match(/^(?:Section\s*[:.-]?|#+\s*)(.+)$/i);
        if (sectionMatch && line.length < 90) {
          flushBuffer();
          currentSection = sanitizeDashes(sectionMatch[1].trim());
          continue;
        }

        const words = line.split(/\s+/).length;
        buffer.push(line);
        bufferWords += words;

        if (bufferWords >= 150) {
          flushBuffer();
        }
      }

      flushBuffer();
    }

    if (rawChunkList.length === 0 && pages.length > 0) {
      rawChunkList.push({
        pageNumber: 1,
        chapter: currentChapter,
        section: currentSection,
        topic: currentTopic,
        content: pages[0].text.slice(0, 1000),
      });
    }

    if (onProgress) {
      onProgress('Chunking', rawChunkList.length, rawChunkList.length);
    }

    // 6. Generate Gemini Embeddings for every chunk
    const chunks: DocumentChunk[] = [];
    const total = rawChunkList.length;

    for (let i = 0; i < total; i++) {
      const item = rawChunkList[i];
      const chunkId = `chunk_${crypto.randomUUID().slice(0, 12)}`;

      if (onProgress) {
        onProgress('Embedding', i + 1, total);
      }

      // Generate embedding vector using Gemini Embedding 2
      const embeddingText = `${subject} ${item.topic} ${item.chapter} ${item.section} ${item.content}`;
      const embedding = await generateGeminiEmbedding(embeddingText);

      chunks.push({
        id: chunkId,
        chunkId,
        materialId: documentId,
        documentId,
        userId: studentId,
        studentId,
        subject,
        documentName,
        pageNumber: item.pageNumber,
        chapter: item.chapter,
        section: item.section,
        topic: item.topic,
        content: item.content,
        extractedText: item.content,
        embedding,
        chunkIndex: i,
      });
    }

    return chunks;
  },

  /**
   * Complete End-to-End Pipeline Execution:
   * Validates → Prevents Duplicates → Uploads to Storage → Extracts → Chunks → Embeds with Gemini → Indexes in DB
   */
  async ingestDocument(params: {
    studentId: string;
    fileName: string;
    buffer: Buffer;
    title?: string;
    subject?: string;
    docType?: DocumentType;
    token?: string;
    onProgress?: (stage: ProcessingStatus, current?: number, total?: number) => void;
  }): Promise<IngestionResult> {
    const { studentId, fileName, buffer, token, onProgress } = params;
    const subject = sanitizeDashes((params.subject || 'Biology').trim());

    // Step 1: Validate file & compute SHA-256
    const validation = this.validateFile({ fileName, buffer });
    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid file format.');
    }

    const docType = params.docType || validation.docType;
    const title = sanitizeDashes(
      (params.title || fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ')).trim()
    );

    // Prevent duplicate processing: check if student has already indexed this exact document
    const existingMaterials = await repo.getMaterials(studentId, undefined, token);
    const existingDoc = existingMaterials.find(
      (m) =>
        (m.contentHash && m.contentHash === validation.contentHash) ||
        (m.fileName.toLowerCase() === fileName.toLowerCase() &&
          m.fileSize === buffer.length &&
          (m.status === 'Indexed' || m.status === 'Ready'))
    );

    if (existingDoc && (existingDoc.status === 'Indexed' || existingDoc.status === 'Ready')) {
      if (onProgress) onProgress('Indexed', 1, 1);
      return {
        material: existingDoc,
        chunksIndexed: existingDoc.chunkCount,
        extractedPages: existingDoc.pageCount,
        duplicateDetected: true,
        status: existingDoc.status,
      };
    }

    const documentId = `mat_${crypto.randomUUID().slice(0, 8)}`;

    // Initial status: Uploaded
    if (onProgress) onProgress('Uploaded', 1, 1);

    // Store in Supabase Storage bucket 'study-materials'
    let storagePath: string | undefined;
    if (isSupabaseConfigured()) {
      try {
        const uploadResult = await supabaseStorageService.uploadMaterial(
          studentId,
          fileName,
          buffer,
          fileName.endsWith('.pdf') ? 'application/pdf' : 'text/plain',
          token
        );
        storagePath = uploadResult.path;
      } catch (storageErr: any) {
        console.warn('Notice: Supabase storage upload warning:', storageErr.message);
      }
    }

    // Record initial document state
    const initialDoc: StudyMaterial = {
      id: documentId,
      userId: studentId,
      title,
      fileName,
      subject,
      docType,
      fileSize: buffer.length,
      pageCount: 1,
      chunkCount: 0,
      status: 'Uploaded',
      contentHash: validation.contentHash,
      storagePath,
      uploadedAt: new Date().toISOString(),
    };
    await repo.saveMaterial(initialDoc, token);

    try {
      // Step 2: Extract text and preserve page numbers
      if (onProgress) onProgress('Extracting', 1, 1);
      await repo.updateMaterial(documentId, studentId, { status: 'Extracting' }, token);

      const pages = await this.extractText({ buffer, fileName });
      const maxPages = Math.max(1, ...pages.map((p) => p.pageNumber));

      // Step 3 & 4: Chunking and Gemini Embedding 2 Generation
      await repo.updateMaterial(documentId, studentId, { status: 'Chunking', pageCount: maxPages }, token);

      const chunks = await this.createChunksWithEmbeddings({
        studentId,
        documentId,
        documentName: fileName,
        subject,
        pages,
        onProgress,
      });

      // Step 5: Store in Supabase PostgreSQL + pgvector
      if (onProgress) onProgress('Embedding', chunks.length, chunks.length);
      await repo.updateMaterial(documentId, studentId, { status: 'Embedding' }, token);

      await repo.saveChunks(chunks, studentId, token);

      // Final status: Indexed
      const completedDoc: StudyMaterial = {
        ...initialDoc,
        pageCount: maxPages,
        chunkCount: chunks.length,
        status: 'Indexed',
      };
      await repo.saveMaterial(completedDoc, token);

      if (onProgress) onProgress('Indexed', chunks.length, chunks.length);

      return {
        material: completedDoc,
        chunksIndexed: chunks.length,
        extractedPages: maxPages,
        duplicateDetected: false,
        status: 'Indexed',
      };
    } catch (pipelineErr: any) {
      const failedDoc: StudyMaterial = {
        ...initialDoc,
        status: 'Failed',
        errorMessage: pipelineErr.message || 'Ingestion pipeline error.',
      };
      await repo.saveMaterial(failedDoc, token);
      if (onProgress) onProgress('Failed');
      throw pipelineErr;
    }
  },
};
