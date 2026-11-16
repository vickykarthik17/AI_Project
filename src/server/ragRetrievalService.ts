import {
  EMBEDDING_DIMENSION,
  GEMINI_EMBEDDING_MODEL,
  generateGeminiEmbedding,
} from './ingestionService';
import { repo } from './repository';
import {
  getSupabaseAdmin,
  getUserScopedSupabaseClient,
  isSupabaseConfigured,
  toUuid,
} from './supabase';
import { cosineSimilarity, sanitizeDashes } from '../domain/engine';
import { RetrievalChunkResult } from '../types';

export interface RetrieveChunksParams {
  query: string;
  studentId: string;
  subject?: string;
  topics?: string[];
  documentId?: string;
  topK?: number;
  minScore?: number;
  token?: string;
}

export interface RetrievalResult {
  query: string;
  queryEmbedding: number[];
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingPreview: number[];
  chunks: RetrievalChunkResult[];
  totalAvailable: number;
  executionTimeMs: number;
  filtersApplied: {
    studentId: string;
    subject?: string;
    topics?: string[];
    documentId?: string;
  };
}

/**
 * RAG Retrieval Pipeline:
 * 1. Receives student query.
 * 2. Generates embedding using Gemini Embedding 2 (text-embedding-004, 64 dims).
 * 3. Searches pgvector database or local repository.
 * 4. Filters strictly by authenticated studentId.
 * 5. Applies subject, topic, and document filters.
 * 6. Retrieves most relevant document chunks.
 * 7. Returns source metadata and similarity scores.
 */
export const ragRetrievalService = {
  /**
   * Generates a 64-dimensional query embedding using Gemini Embedding 2.
   */
  async generateQueryVector(query: string): Promise<number[]> {
    const cleaned = sanitizeDashes(query).trim().slice(0, 2048);
    return generateGeminiEmbedding(cleaned);
  },

  /**
   * Executes the full retrieval pipeline with multi-tenant student isolation.
   */
  async retrieveChunks(params: RetrieveChunksParams): Promise<RetrievalResult> {
    const startTime = Date.now();
    const {
      query,
      studentId,
      subject,
      topics,
      documentId,
      topK = 5,
      minScore = 0.12,
      token,
    } = params;

    // Security Invariant: Authenticated Student ID is strictly mandatory
    if (!studentId || typeof studentId !== 'string' || !studentId.trim()) {
      throw new Error('Security Error: Authenticated studentId is required for RAG retrieval.');
    }

    if (!query || typeof query !== 'string' || !query.trim()) {
      throw new Error('Retrieval Error: Query string cannot be empty.');
    }

    // Step 2: Generate Query Embedding using Gemini Embedding 2
    const queryEmbedding = await this.generateQueryVector(query);
    const embeddingPreview = queryEmbedding.slice(0, 8);

    let retrievedChunks: RetrievalChunkResult[] = [];
    let totalAvailable = 0;

    // Step 3 & 4: Search pgvector in Supabase (with strict student isolation)
    if (isSupabaseConfigured()) {
      try {
        const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
        if (client) {
          const studentUuid = toUuid(studentId);
          const docUuid = documentId ? toUuid(documentId) : null;

          const { data, error } = await client.rpc('match_document_chunks', {
            query_embedding: queryEmbedding,
            match_threshold: minScore,
            match_count: topK * 2,
            filter_student_id: studentUuid,
            filter_subject: subject && subject !== 'all' ? subject : null,
            filter_document_id: docUuid,
          });

          if (!error && Array.isArray(data) && data.length > 0) {
            totalAvailable = data.length;
            retrievedChunks = data.map((row: any) => ({
              chunkId: row.id,
              documentId: row.document_id,
              studentId: row.student_id,
              subject: row.subject_name || 'Biology',
              documentName: row.document_name,
              pageNumber: Number(row.page_number) || 1,
              chapter: row.chapter,
              section: row.section,
              topic: row.topic,
              content: sanitizeDashes(row.content),
              similarityScore: Number(row.similarity || 0),
            }));
          }
        }
      } catch (err: any) {
        console.warn('Notice: pgvector RPC match fallback to repository:', err.message);
      }
    }

    // Step 5: If pgvector returned no chunks or when using offline/local storage
    if (retrievedChunks.length === 0) {
      const studentChunks = await repo.getChunks(studentId, subject, documentId, token);
      totalAvailable = studentChunks.length;

      const queryTokens = new Set(
        query
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 2)
      );

      const scored = studentChunks
        .filter((chunk) => {
          // Multi-tenant check: never allow another student's chunk
          if (chunk.userId !== studentId && chunk.studentId !== studentId) {
            return false;
          }
          if (subject && subject !== 'all' && chunk.subject.toLowerCase() !== subject.toLowerCase()) {
            return false;
          }
          if (documentId && chunk.materialId !== documentId && chunk.documentId !== documentId) {
            return false;
          }
          return true;
        })
        .map((chunk) => {
          // Vector similarity with Gemini embedding vector
          const vectorSim = cosineSimilarity(queryEmbedding, chunk.embedding || []);

          // Lexical match component
          const textLower = `${chunk.topic} ${chunk.chapter} ${chunk.section} ${chunk.content}`.toLowerCase();
          let matchedTokens = 0;
          queryTokens.forEach((tok) => {
            if (textLower.includes(tok)) matchedTokens += 1;
          });
          const lexicalSim = queryTokens.size > 0 ? matchedTokens / queryTokens.size : 0;

          // Topic filter bonus
          let topicBonus = 0;
          if (topics && topics.length > 0) {
            const matchesTopic = topics.some(
              (t) =>
                chunk.topic.toLowerCase().includes(t.toLowerCase()) ||
                t.toLowerCase().includes(chunk.topic.toLowerCase()) ||
                chunk.chapter.toLowerCase().includes(t.toLowerCase())
            );
            if (matchesTopic) topicBonus = 0.22;
          }

          const combined = Number((vectorSim * 0.60 + lexicalSim * 0.40 + topicBonus).toFixed(4));
          return {
            chunkId: chunk.id,
            documentId: chunk.materialId || chunk.documentId || '',
            studentId,
            subject: chunk.subject,
            documentName: chunk.documentName,
            pageNumber: chunk.pageNumber,
            chapter: chunk.chapter,
            section: chunk.section,
            topic: chunk.topic,
            content: sanitizeDashes(chunk.content),
            similarityScore: combined,
          };
        });

      retrievedChunks = scored
        .filter((s) => s.similarityScore >= minScore)
        .sort((a, b) => b.similarityScore - a.similarityScore);
    }

    // Step 6: Filter and slice to topK
    const topChunks = retrievedChunks.slice(0, topK);

    return {
      query,
      queryEmbedding,
      embeddingModel: GEMINI_EMBEDDING_MODEL,
      embeddingDimensions: EMBEDDING_DIMENSION,
      embeddingPreview,
      chunks: topChunks,
      totalAvailable,
      executionTimeMs: Date.now() - startTime,
      filtersApplied: {
        studentId,
        subject,
        topics,
        documentId,
      },
    };
  },
};

