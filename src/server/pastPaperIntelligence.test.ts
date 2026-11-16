import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { syllabusService } from './syllabusService';
import { pastPaperService } from './pastPaperService';
import { ingestionService, generateGeminiEmbedding } from './ingestionService';
import { dbRepo, initDatabase } from './db';
import { repo } from './repository';
import { TopicNode } from '../types';

initDatabase();

test('1. Syllabus processing: extracts units, chapters, topics, subtopics, concepts & prerequisites and builds hierarchy', async () => {
  const studentId = '00000000-0000-4000-8000-000000000021';

  // 1. Generate real Syllabus PDF with pdf-lib
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([600, 800]);
  page.drawText('Official Advanced Biology Examination Syllabus', {
    x: 50,
    y: 750,
    size: 16,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText('Unit 1: Cellular Energetics and Biochemical Pathways', {
    x: 50,
    y: 710,
    size: 13,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.6),
  });
  page.drawText('Chapter 3: Photosynthesis and Photophosphorylation', {
    x: 50,
    y: 685,
    size: 11,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText(
    'Topic: Photosynthesis\n' +
    'Subtopics: Light-Dependent Reactions in Thylakoids, Photolysis of Water, Calvin Cycle Carbon Fixation in Stroma.\n' +
    'Important Concepts: Photosystem II P680 reaction center, ATP Synthase chemiosmosis, RuBisCO carboxylation.\n' +
    'Prerequisites: Cell Ultrastructure and Chloroplast Anatomy.',
    {
      x: 50,
      y: 660,
      size: 9.5,
      font,
      color: rgb(0.15, 0.15, 0.15),
      lineHeight: 14,
    }
  );

  page.drawText('Chapter 4: Cellular Respiration and Catabolism', {
    x: 50,
    y: 580,
    size: 11,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText(
    'Topic: Cellular Respiration\n' +
    'Subtopics: Cytosolic Glycolysis, Mitochondrial Matrix Krebs Cycle, Electron Transport Chain.\n' +
    'Important Concepts: Substrate-level phosphorylation, Oxidative phosphorylation, Proton electrochemical gradient.\n' +
    'Prerequisites: Thermodynamics and Free Energy in Biochemical Reactions.',
    {
      x: 50,
      y: 555,
      size: 9.5,
      font,
      color: rgb(0.15, 0.15, 0.15),
      lineHeight: 14,
    }
  );

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  // Ingest syllabus document
  const ingestion = await ingestionService.ingestDocument({
    studentId,
    fileName: 'Advanced_Biology_Syllabus.pdf',
    buffer: pdfBuffer,
    subject: 'Biology',
    docType: 'Syllabus',
  });

  assert.equal(ingestion.status, 'Indexed');
  const chunks = await repo.getChunks(studentId, 'Biology', ingestion.material.id);
  assert.ok(chunks.length >= 2, 'Must have indexed syllabus chunks');

  // Extract syllabus topics
  const extractedTopics = await syllabusService.extractSyllabusTopics({
    userId: studentId,
    subject: 'Biology',
    chunks,
  });

  assert.ok(extractedTopics.length >= 2, 'Must extract at least 2 topics');
  for (const t of extractedTopics) {
    assert.ok(t.unitName, 'Must extract unit name');
    assert.ok(t.chapterName, 'Must extract chapter name');
    assert.ok(t.topicName, 'Must extract topic name');
    assert.ok(Array.isArray(t.subtopics) && t.subtopics.length > 0, 'Must extract subtopics');
    assert.ok(Array.isArray(t.importantConcepts), 'Must extract important concepts');
    assert.ok(Array.isArray(t.prerequisites), 'Must extract prerequisites');
    assert.ok(t.syllabusWeight >= 1 && t.syllabusWeight <= 10, 'Syllabus weight must be 1-10');
  }

  // Build hierarchical topic map
  const hierarchy = syllabusService.buildHierarchicalTopicMap(extractedTopics);
  assert.equal(hierarchy.subject, 'Biology');
  assert.ok(hierarchy.units.length >= 1, 'Hierarchy must contain units');
  assert.ok(hierarchy.units[0].chapters.length >= 1, 'Hierarchy must contain chapters under units');
  assert.ok(hierarchy.units[0].chapters[0].topics.length >= 1, 'Hierarchy must contain topics under chapters');
});

test('2. Students can add, edit, and delete syllabus topics', async () => {
  const studentId = '00000000-0000-4000-8000-000000000022';

  // 1. Add topic
  const added = await syllabusService.addTopic(studentId, {
    subject: 'Biology',
    unitName: 'Unit 3: Genetics & Information Transfer',
    chapterName: 'Chapter 7: Nucleic Acid Replication',
    topicName: 'DNA Replication',
    subtopics: ['Leading Strand Synthesis', 'Okazaki Fragments on Lagging Strand'],
    importantConcepts: ['DNA Polymerase III proofreading', 'Helicase unwinding'],
    prerequisites: ['Nucleotide Structure'],
    syllabusWeight: 9,
  });

  assert.ok(added.id, 'Must generate topic ID');
  assert.equal(added.topicName, 'DNA Replication');
  assert.equal(added.syllabusWeight, 9);

  // Verify in repository
  let userTopics = await repo.getTopics(studentId, 'Biology');
  assert.ok(userTopics.some((t) => t.id === added.id), 'Added topic must exist in repository');

  // 2. Edit topic
  const updated = await syllabusService.updateTopic(studentId, added.id, {
    topicName: 'Advanced DNA Replication & Repair',
    syllabusWeight: 10,
    subtopics: ['Leading Strand', 'Lagging Strand', 'Mismatch Repair Mechanisms'],
  });

  assert.equal(updated.topicName, 'Advanced DNA Replication & Repair');
  assert.equal(updated.syllabusWeight, 10);
  assert.equal(updated.subtopics.length, 3);

  // 3. Delete topic
  const deleted = await syllabusService.deleteTopic(studentId, added.id);
  assert.equal(deleted, true, 'Topic must be successfully deleted');

  userTopics = await repo.getTopics(studentId, 'Biology');
  assert.equal(userTopics.some((t) => t.id === added.id), false, 'Deleted topic must not exist');
});

test('3. Past paper analysis: extracts questions with year, marks, type and source reference without inventing facts', async () => {
  const studentId = '00000000-0000-4000-8000-000000000023';

  // Seed syllabus topics for this student
  const topic1: TopicNode = {
    id: 't_photo',
    userId: studentId,
    subject: 'Biology',
    unitName: 'Unit 1: Energetics',
    chapterName: 'Chapter 3: Photosynthesis',
    topicName: 'Photosynthesis',
    subtopics: ['Light-Dependent Reactions', 'Calvin Cycle'],
    importantConcepts: ['Photolysis of water', 'RuBisCO'],
    prerequisites: ['Chloroplast Anatomy'],
    syllabusWeight: 9,
    pastPaperFrequency: 0,
  };

  const topic2: TopicNode = {
    id: 't_resp',
    userId: studentId,
    subject: 'Biology',
    unitName: 'Unit 1: Energetics',
    chapterName: 'Chapter 4: Respiration',
    topicName: 'Cellular Respiration',
    subtopics: ['Glycolysis', 'Krebs Cycle'],
    importantConcepts: ['ATP Synthase', 'NADH'],
    prerequisites: ['Enzyme Kinetics'],
    syllabusWeight: 8,
    pastPaperFrequency: 0,
  };

  await repo.saveTopic(topic1);
  await repo.saveTopic(topic2);

  // Seed textbook chunks for Gemini retrieval validation
  dbRepo.saveChunks([
    {
      id: 'chunk_textbook_photo',
      materialId: 'doc_tb_01',
      userId: studentId,
      studentId,
      subject: 'Biology',
      documentName: 'Biology_Textbook.pdf',
      pageNumber: 42,
      chapter: 'Chapter 3: Photosynthesis',
      section: 'Thylakoid Light Reactions',
      topic: 'Photosynthesis',
      content: 'Light-dependent reactions in the thylakoid membrane produce ATP and NADPH via photolysis of water in photosystem II.',
      embedding: await generateGeminiEmbedding('Photosynthesis thylakoid light reactions photolysis ATP NADPH'),
      chunkIndex: 0,
    },
    {
      id: 'chunk_textbook_resp',
      materialId: 'doc_tb_01',
      userId: studentId,
      studentId,
      subject: 'Biology',
      documentName: 'Biology_Textbook.pdf',
      pageNumber: 78,
      chapter: 'Chapter 4: Cellular Respiration',
      section: 'Cytosolic Glycolysis',
      topic: 'Cellular Respiration',
      content: 'Glycolysis takes place in the cytoplasm, converting glucose into pyruvate and yielding 2 ATP and 2 NADH.',
      embedding: await generateGeminiEmbedding('Cellular respiration glycolysis cytoplasm glucose pyruvate ATP'),
      chunkIndex: 1,
    },
  ]);

  // Create real Past Paper PDF
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([600, 800]);
  page.drawText('National Advanced Biology Examination - May 2024 Paper 2', {
    x: 50,
    y: 750,
    size: 14,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText(
    'Question 1 (2024) [5 marks]: Explain how light absorption by Photosystem II leads to the photolysis of water and ATP production in the thylakoid membrane.',
    {
      x: 50,
      y: 700,
      size: 10,
      font,
      color: rgb(0.1, 0.1, 0.1),
    }
  );

  page.drawText(
    'Question 2 (2024) [3 marks]: State the subcellular location of glycolysis and explain why it can proceed in anaerobic conditions.',
    {
      x: 50,
      y: 650,
      size: 10,
      font,
      color: rgb(0.1, 0.1, 0.1),
    }
  );

  page.drawText(
    'Question 3: Describe the role of NAD+ as an electron carrier during biochemical catabolism.',
    {
      x: 50,
      y: 600,
      size: 10,
      font,
      color: rgb(0.1, 0.1, 0.1),
    }
  );

  page.drawText(
    'Question 4 (2023) [4 marks]: Calculate the theoretical Carnot cycle thermal efficiency of an idealized thermodynamic heat engine operating between 500K and 300K.',
    {
      x: 50,
      y: 550,
      size: 10,
      font,
      color: rgb(0.1, 0.1, 0.1),
    }
  );

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  // Ingest past paper document
  const ingestion = await ingestionService.ingestDocument({
    studentId,
    fileName: 'Biology_Exam_2024_Paper2.pdf',
    buffer: pdfBuffer,
    subject: 'Biology',
    docType: 'Past Paper',
  });

  assert.equal(ingestion.status, 'Indexed');
  const paperChunks = await repo.getChunks(studentId, 'Biology', ingestion.material.id);

  // Execute past paper analysis
  const analyzedQuestions = await pastPaperService.analyzePastPaperDocument({
    userId: studentId,
    materialId: ingestion.material.id,
    sourceDocument: 'Biology_Exam_2024_Paper2.pdf',
    subject: 'Biology',
    chunks: paperChunks,
    existingTopics: [topic1, topic2],
  });

  assert.ok(analyzedQuestions.length >= 3, 'Must extract at least 3 questions');

  // Verify Question 1 has Year 2024 and Marks 5
  const q1 = analyzedQuestions.find((q) => q.questionText.includes('Photosystem II') || q.questionText.includes('photolysis'));
  assert.ok(q1, 'Question 1 must be extracted');
  assert.equal(q1.year, '2024', 'Year 2024 must be preserved');
  assert.equal(q1.marks, 5, 'Marks 5 must be preserved');
  assert.equal(q1.sourceDocument, 'Biology_Exam_2024_Paper2.pdf');
  assert.equal(q1.pageNumber, 1);
  assert.equal(q1.topic, 'Photosynthesis', 'Must map to Photosynthesis');
  assert.equal(q1.needsReview, false, 'Valid topic must not need review');

  // Verify Question 3 (which had no year and no marks printed) did NOT invent year or marks
  const q3 = analyzedQuestions.find((q) => q.questionText.includes('electron carrier') || q.questionText.includes('NAD+'));
  if (q3) {
    assert.equal(q3.year, null, 'Must NOT invent examination year when absent from question');
    assert.equal(q3.marks, null, 'Must NOT invent marks when absent from question');
  }

  // Verify Question 4 (Carnot cycle out-of-syllabus physics question) is flagged with needsReview: true
  const q4 = analyzedQuestions.find((q) => q.questionText.includes('Carnot cycle') || q.questionText.includes('thermodynamic'));
  if (q4) {
    assert.equal(q4.needsReview, true, 'Ambiguous/out-of-domain question must be marked for student review');
    assert.equal(q4.mappingConfidence, 'Uncertain');
  }

  // Verify dynamic topic frequency calculation on actual uploaded papers
  const intelligence = await pastPaperService.getIntelligenceSummary(studentId, 'Biology');
  assert.ok(intelligence.totalQuestions >= 3, 'Intelligence must reflect total extracted questions');
  assert.ok(intelligence.frequentlyTestedTopics.length > 0, 'Must list frequently tested topics');

  // Verify topic appearances updated in topics table
  const updatedTopics = await repo.getTopics(studentId, 'Biology');
  const photoTopic = updatedTopics.find((t) => t.topicName === 'Photosynthesis');
  assert.ok(photoTopic && photoTopic.pastPaperFrequency >= 1, 'Photosynthesis pastPaperFrequency must be >= 1 based on real questions');

  // Verify year distribution
  assert.ok(intelligence.yearDistribution.length > 0, 'Must provide available year-wise distribution');
  const year2024 = intelligence.yearDistribution.find((y) => y.year === '2024');
  assert.ok(year2024 && year2024.questionCount >= 1, 'Year 2024 distribution must be present');

  // Verify source references
  assert.ok(intelligence.sourceReferences.length > 0, 'Must track source references');
  assert.equal(intelligence.sourceReferences[0].documentName, 'Biology_Exam_2024_Paper2.pdf');

  // Verify student review and topic reassignment
  const questionToReview = analyzedQuestions[0];
  const remapped = await pastPaperService.reviewQuestionTopic(
    studentId,
    questionToReview.id,
    'Cellular Respiration',
    'Glycolysis Mechanism'
  );

  assert.ok(remapped, 'Remapped question must be returned');
  assert.equal(remapped.topic, 'Cellular Respiration');
  assert.equal(remapped.subtopic, 'Glycolysis Mechanism');
  assert.equal(remapped.needsReview, false);
  assert.equal(remapped.mappingConfidence, 'High');
});
