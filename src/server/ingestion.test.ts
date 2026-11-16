import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  EMBEDDING_DIMENSION,
  generateGeminiEmbedding,
  ingestionService,
} from './ingestionService';
import { generateEmbeddingVector } from './groqService';
import { repo } from './repository';
import { cosineSimilarity, retrieveTopChunks } from '../domain/engine';

/**
 * Helper to build an actual binary PDF file in memory with multiple pages and real text.
 */
async function createRealBiologyPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  // Page 1: Chapter 1 - Cell Biology
  const p1 = doc.addPage([600, 500]);
  p1.drawText('Chapter 1: Cellular Biology', { x: 50, y: 450, font, size: 16 });
  p1.drawText('Section: Fluid Mosaic Model and Membrane Transport', { x: 50, y: 420, font, size: 13 });
  p1.drawText(
    'The plasma membrane is a dynamic phospholipid bilayer with embedded integral proteins.\n' +
    'Cholesterol acts as a fluidity buffer across temperature variations.\n' +
    'Passive diffusion moves solutes down concentration gradients without ATP,\n' +
    'whereas active transport uses the Na+/K+ ATPase pump to move ions against gradients.',
    { x: 50, y: 380, font, size: 11, lineHeight: 18 }
  );

  // Page 2: Chapter 2 - Genetics
  const p2 = doc.addPage([600, 500]);
  p2.drawText('Chapter 2: Molecular Genetics', { x: 50, y: 450, font, size: 16 });
  p2.drawText('Section: Semiconservative DNA Replication', { x: 50, y: 420, font, size: 13 });
  p2.drawText(
    'DNA replication is semiconservative and requires helicase to unwind the double helix.\n' +
    'Primase synthesizes an RNA primer to provide a 3-prime hydroxyl group.\n' +
    'DNA polymerase III extends nucleotides exclusively in the 5-prime to 3-prime direction.\n' +
    'The lagging strand produces Okazaki fragments sealed by DNA ligase.',
    { x: 50, y: 380, font, size: 11, lineHeight: 18 }
  );

  // Page 3: Chapter 3 - Photosynthesis
  const p3 = doc.addPage([600, 500]);
  p3.drawText('Chapter 3: Cellular Energetics', { x: 50, y: 450, font, size: 16 });
  p3.drawText('Section: Light-Dependent Thylakoid Reactions', { x: 50, y: 420, font, size: 13 });
  p3.drawText(
    'Light-dependent reactions occur strictly within the thylakoid membrane.\n' +
    'Photolysis of water at Photosystem II (P680) releases protons into the thylakoid lumen.\n' +
    'Chemiosmosis drives ATP synthase to generate ATP, while PSI produces NADPH for the Calvin cycle.',
    { x: 50, y: 380, font, size: 11, lineHeight: 18 }
  );

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

test('File validation verifies extensions, signatures, and computes SHA-256 hash', async () => {
  const validPdfBuffer = await createRealBiologyPdf();

  // 1. Valid PDF file
  const validRes = ingestionService.validateFile({
    fileName: 'AP_Biology_Textbook.pdf',
    buffer: validPdfBuffer,
  });
  assert.equal(validRes.isValid, true);
  assert.equal(validRes.docType, 'Textbook');
  assert.ok(validRes.contentHash.length === 64, 'SHA-256 hash must be 64 hex characters');

  // 2. Reject empty buffer
  const emptyRes = ingestionService.validateFile({
    fileName: 'Empty.pdf',
    buffer: Buffer.alloc(0),
  });
  assert.equal(emptyRes.isValid, false);
  assert.ok(emptyRes.error?.includes('empty'));

  // 3. Reject corrupt PDF (invalid header)
  const corruptRes = ingestionService.validateFile({
    fileName: 'Corrupt.pdf',
    buffer: Buffer.from('NOT_A_PDF_DOCUMENT_CONTENT'),
  });
  assert.equal(corruptRes.isValid, false);
  assert.ok(corruptRes.error?.includes('%PDF-'));

  // 4. Reject unsupported file extension
  const unsupportedRes = ingestionService.validateFile({
    fileName: 'document.docx',
    buffer: Buffer.from('dummy docx data'),
  });
  assert.equal(unsupportedRes.isValid, false);
  assert.ok(unsupportedRes.error?.includes('Unsupported file type'));
});

test('Text extraction from actual PDF preserves page numbers and cleans content', async () => {
  const pdfBuffer = await createRealBiologyPdf();

  const pages = await ingestionService.extractText({
    buffer: pdfBuffer,
    fileName: 'AP_Biology_Textbook.pdf',
  });

  assert.equal(pages.length, 3, 'Actual PDF must extract exactly 3 distinct pages');
  assert.equal(pages[0].pageNumber, 1);
  assert.equal(pages[1].pageNumber, 2);
  assert.equal(pages[2].pageNumber, 3);

  // Page 1 verification
  assert.ok(pages[0].text.includes('Cellular Biology'));
  assert.ok(pages[0].text.includes('Na+/K+ ATPase pump'));

  // Page 2 verification
  assert.ok(pages[1].text.includes('Molecular Genetics'));
  assert.ok(pages[1].text.includes('Okazaki fragments'));

  // Page 3 verification
  assert.ok(pages[2].text.includes('Cellular Energetics'));
  assert.ok(pages[2].text.includes('Photosystem II'));
});

test('Chunking extracts headings, sections, and attaches all required metadata', async () => {
  const pdfBuffer = await createRealBiologyPdf();
  const pages = await ingestionService.extractText({
    buffer: pdfBuffer,
    fileName: 'AP_Biology_Textbook.pdf',
  });

  const studentId = 'test_student_ingestion_01';
  const documentId = 'mat_test_doc_01';

  const chunks = await ingestionService.createChunksWithEmbeddings({
    studentId,
    documentId,
    documentName: 'AP_Biology_Textbook.pdf',
    subject: 'Biology',
    pages,
  });

  assert.ok(chunks.length >= 3, 'Must generate chunks across the pages');

  // Verify EVERY chunk satisfies required fields
  for (const chunk of chunks) {
    assert.equal(chunk.studentId, studentId, 'Every chunk must contain student_id');
    assert.equal(chunk.userId, studentId);
    assert.equal(chunk.documentId, documentId, 'Every chunk must contain document_id');
    assert.equal(chunk.materialId, documentId);
    assert.ok(chunk.id.startsWith('chunk_'), 'Every chunk must contain chunk_id');
    assert.equal(chunk.documentName, 'AP_Biology_Textbook.pdf', 'Every chunk must contain document_name');
    assert.ok(chunk.pageNumber >= 1 && chunk.pageNumber <= 3, 'Every chunk must preserve page_number');
    assert.ok(chunk.chapter.length > 0, 'Every chunk must contain chapter');
    assert.ok(chunk.section.length > 0, 'Every chunk must contain section');
    assert.ok(
      (chunk.extractedText || chunk.content).length > 20,
      'Every chunk must contain extracted_text'
    );
    assert.equal(
      chunk.embedding.length,
      EMBEDDING_DIMENSION,
      `Embedding must match configured dimensionality (${EMBEDDING_DIMENSION})`
    );
  }

  // Verify chapter and section recognition
  const p1Chunk = chunks.find((c) => c.pageNumber === 1);
  assert.ok(p1Chunk?.chapter.includes('Cellular Biology') || p1Chunk?.topic.includes('Cellular Biology'));

  const p2Chunk = chunks.find((c) => c.pageNumber === 2);
  assert.ok(p2Chunk?.chapter.includes('Molecular Genetics') || p2Chunk?.topic.includes('Molecular Genetics'));
});

test('Embedding dimensionality is strictly consistent between document chunks and query vectors', async () => {
  const text = 'Photosystem II water photolysis and thylakoid proton accumulation.';

  // 1. Document chunk embedding
  const docVector = await generateGeminiEmbedding(text);

  // 2. Query vector
  const queryVector = await generateEmbeddingVector('What is the role of Photosystem II?');

  assert.equal(docVector.length, EMBEDDING_DIMENSION, 'Document vector must equal EMBEDDING_DIMENSION');
  assert.equal(queryVector.length, EMBEDDING_DIMENSION, 'Query vector must equal EMBEDDING_DIMENSION');
  assert.equal(
    docVector.length,
    queryVector.length,
    'Document vector and query vector dimensions must be identical'
  );

  // Verify cosine similarity works across document and query vectors
  const similarity = cosineSimilarity(docVector, queryVector);
  assert.ok(typeof similarity === 'number' && !isNaN(similarity));
  assert.ok(similarity >= -1 && similarity <= 1);
});

test('End-to-end ingestion pipeline indexes real PDF, prevents duplicates, and enables RAG retrieval', async () => {
  const pdfBuffer = await createRealBiologyPdf();
  const studentId = `student_e2e_${Date.now()}`;
  const fileName = 'Actual_Biology_Curriculum.pdf';

  const trackedStages: string[] = [];
  const onProgress = (stage: string) => {
    trackedStages.push(stage);
  };

  // 1. First Ingestion Run
  const result1 = await ingestionService.ingestDocument({
    studentId,
    fileName,
    buffer: pdfBuffer,
    title: 'Actual Biology Curriculum',
    subject: 'Biology',
    docType: 'Textbook',
    onProgress,
  });

  assert.equal(result1.status, 'Indexed', 'Document status must be Indexed upon completion');
  assert.equal(result1.extractedPages, 3, 'Must report 3 extracted pages');
  assert.ok(result1.chunksIndexed >= 3, 'Must report indexed chunks');
  assert.equal(result1.duplicateDetected, false, 'First upload must not be flagged as duplicate');

  // Verify tracked status stages
  assert.ok(trackedStages.includes('Uploaded'), 'Must transition through Uploaded');
  assert.ok(trackedStages.includes('Extracting'), 'Must transition through Extracting');
  assert.ok(trackedStages.includes('Chunking'), 'Must transition through Chunking');
  assert.ok(trackedStages.includes('Embedding'), 'Must transition through Embedding');
  assert.ok(trackedStages.includes('Indexed'), 'Must transition through Indexed');

  // 2. Verify persistence in repository
  const storedMaterials = await repo.getMaterials(studentId);
  const foundMat = storedMaterials.find((m) => m.id === result1.material.id);
  assert.ok(foundMat, 'Material must be retrievable from repository');
  assert.equal(foundMat.status, 'Indexed');
  assert.equal(foundMat.pageCount, 3);

  const storedChunks = await repo.getChunks(studentId, undefined, result1.material.id);
  assert.ok(storedChunks.length >= 3, 'Chunks must be retrievable from repository');

  // 3. Test RAG Semantic Retrieval against actual ingested PDF chunks
  const queryVec = await generateEmbeddingVector('How does the Na+/K+ ATPase pump transport ions?');
  const ragMatches = retrieveTopChunks({
    query: 'How does the Na+/K+ ATPase pump transport ions?',
    queryEmbedding: queryVec,
    chunks: storedChunks,
    subject: 'Biology',
    topK: 2,
  });

  assert.ok(ragMatches.length > 0, 'RAG must retrieve matching chunks');
  // Top match should be the Cell Biology page discussing the Na+/K+ pump
  assert.equal(ragMatches[0].chunk.pageNumber, 1, 'Top retrieved chunk must be from Page 1 (Cell Biology)');
  assert.ok(
    ragMatches[0].chunk.content.includes('Na+/K+ ATPase pump') ||
    ragMatches[0].chunk.content.includes('active transport'),
    'Top chunk must discuss active transport'
  );

  // 4. Duplicate Prevention Verification
  // Ingest the EXACT same PDF again for the same student
  const result2 = await ingestionService.ingestDocument({
    studentId,
    fileName,
    buffer: pdfBuffer,
    title: 'Actual Biology Curriculum',
    subject: 'Biology',
    docType: 'Textbook',
  });

  assert.equal(result2.duplicateDetected, true, 'Subsequent upload of identical document must detect duplicate');
  assert.equal(result2.material.id, result1.material.id, 'Must reuse existing indexed document ID');

  // Clean up
  await repo.deleteMaterial(result1.material.id, studentId);
});

