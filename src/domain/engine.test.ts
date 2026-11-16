import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStructuredRevisionTasks,
  calculateConfidenceLevel,
  calculateRevisionPriorityScore,
  chunkStudyDocument,
  classifyKnowledgeStatus,
  computeDeterministicEmbedding,
  computeTopicPerformance,
  retrieveTopChunks,
  sanitizeDashes,
} from './engine';
import { QuizSubmissionAnswer } from '../types';

test('sanitizeDashes removes all em dashes and en dashes', () => {
  const raw = 'Chapter 3 \u2014 Photosynthesis \u2013 Light reactions';
  const cleaned = sanitizeDashes(raw);
  assert.equal(cleaned.includes('\u2014'), false);
  assert.equal(cleaned.includes('\u2013'), false);
  assert.equal(cleaned, 'Chapter 3 - Photosynthesis - Light reactions');
});

test('classifyKnowledgeStatus follows exact threshold and insufficient evidence rules', () => {
  assert.equal(classifyKnowledgeStatus(100, 1), 'Insufficient evidence');
  assert.equal(classifyKnowledgeStatus(0, 0), 'Insufficient evidence');
  assert.equal(classifyKnowledgeStatus(35, 7), 'Weak');
  assert.equal(classifyKnowledgeStatus(49, 4), 'Weak');
  assert.equal(classifyKnowledgeStatus(50, 4), 'Medium');
  assert.equal(classifyKnowledgeStatus(74, 5), 'Medium');
  assert.equal(classifyKnowledgeStatus(75, 4), 'Strong');
  assert.equal(classifyKnowledgeStatus(92, 6), 'Strong');
});

test('calculateConfidenceLevel scales with assessment evidence', () => {
  assert.equal(calculateConfidenceLevel(1, 1), 'Low');
  assert.equal(calculateConfidenceLevel(2, 0), 'Medium');
  assert.equal(calculateConfidenceLevel(5, 1), 'High');
  assert.equal(calculateConfidenceLevel(3, 2), 'High');
});

test('computeTopicPerformance aggregates accuracy and repeated mistakes', () => {
  const sampleAnswers: QuizSubmissionAnswer[] = [
    {
      questionId: 'q1',
      topic: 'Photosynthesis',
      subtopic: 'Calvin Cycle',
      studentResponse: 'Thylakoid',
      correctAnswer: 'Stroma',
      isCorrect: false,
      marksEarned: 0,
      maxMarks: 1,
      evaluationExplanation: 'Confused stroma with thylakoid.',
      difficulty: 'Medium',
      citation: {
        chunkId: 'c1',
        documentName: 'Biology_Textbook.pdf',
        chapter: 'Chapter 3',
        pageNumber: 42,
        section: 'Calvin Cycle',
        excerpt: 'The Calvin cycle takes place in the stroma.',
      },
    },
    {
      questionId: 'q2',
      topic: 'Photosynthesis',
      subtopic: 'Calvin Cycle',
      studentResponse: 'ATP only',
      correctAnswer: 'ATP and NADPH',
      isCorrect: false,
      marksEarned: 0,
      maxMarks: 1,
      evaluationExplanation: 'Missed NADPH.',
      difficulty: 'Medium',
      citation: {
        chunkId: 'c1',
        documentName: 'Biology_Textbook.pdf',
        chapter: 'Chapter 3',
        pageNumber: 42,
        section: 'Calvin Cycle',
        excerpt: 'Uses ATP and NADPH.',
      },
    },
    {
      questionId: 'q3',
      topic: 'Photosynthesis',
      subtopic: 'Photolysis',
      studentResponse: 'Splitting of water',
      correctAnswer: 'Splitting of water',
      isCorrect: true,
      marksEarned: 1,
      maxMarks: 1,
      evaluationExplanation: 'Correct.',
      difficulty: 'Easy',
      citation: {
        chunkId: 'c2',
        documentName: 'Biology_Textbook.pdf',
        chapter: 'Chapter 3',
        pageNumber: 41,
        section: 'Light Reactions',
        excerpt: 'Photolysis splits water molecules.',
      },
    },
  ];

  const perf = computeTopicPerformance(sampleAnswers);
  assert.equal(perf.questionsAttempted, 3);
  assert.equal(perf.correctCount, 1);
  assert.equal(perf.incorrectCount, 2);
  assert.equal(perf.repeatedMistakesCount, 1);
  assert.equal(perf.accuracyPercent < 49, true);
});

test('chunkStudyDocument preserves page, chapter, and section metadata', () => {
  const sampleDoc = `
Page 12
Chapter 1: Cell Biology
Section: Fluid Mosaic Model
The plasma membrane consists of a phospholipid bilayer with embedded proteins that regulate transport across the cell boundary and maintain homeostasis.
Page 13
Section: Active Transport
Active transport requires ATP hydrolysis to move ions against their concentration gradient using transmembrane protein pumps such as the sodium-potassium pump.
  `;

  const chunks = chunkStudyDocument({
    materialId: 'mat_1',
    userId: 'u_1',
    subject: 'Biology',
    documentName: 'Biology_Textbook.pdf',
    rawText: sampleDoc,
  });

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].pageNumber, 12);
  assert.equal(chunks[0].chapter, 'Chapter 1: Cell Biology');
  assert.equal(chunks[0].section, 'Fluid Mosaic Model');
  assert.equal(chunks[1].pageNumber, 13);
  assert.equal(chunks[1].section, 'Active Transport');
});

test('retrieveTopChunks ranks relevant biology chunks highest', () => {
  const rawChunks = chunkStudyDocument({
    materialId: 'mat_bio',
    userId: 'u_1',
    subject: 'Biology',
    documentName: 'Biology_Textbook.pdf',
    rawText: `
Page 41
Chapter 3: Photosynthesis
Section: Light-Dependent Reactions
Light energy is absorbed by chlorophyll in Photosystem II and Photosystem I within the thylakoid membrane, driving photolysis of water and generating ATP and NADPH.
Page 68
Chapter 5: Human Physiology
Section: Cardiac Cycle
The sinoatrial node initiates electrical impulses causing atrial systole followed by ventricular contraction across the myocardium.
    `,
  });

  const indexedChunks = rawChunks.map((c) => ({
    ...c,
    embedding: computeDeterministicEmbedding(c.content),
  }));

  const query = 'Where do light-dependent reactions and photolysis occur in photosynthesis?';
  const results = retrieveTopChunks({
    query,
    queryEmbedding: computeDeterministicEmbedding(query),
    chunks: indexedChunks,
    subject: 'Biology',
    topK: 2,
  });

  assert.equal(results.length >= 1, true);
  assert.equal(results[0].chunk.pageNumber, 41);
  assert.equal(results[0].chunk.section, 'Light-Dependent Reactions');
});

test('calculateRevisionPriorityScore ranks Weak topics with high exam frequency above Strong topics', () => {
  const weakScore = calculateRevisionPriorityScore({
    status: 'Weak',
    accuracyPercent: 35,
    pastPaperFrequency: 5,
    syllabusWeight: 9,
    isPrerequisiteForWeakTopic: true,
    repeatedMistakesCount: 2,
  });

  const strongScore = calculateRevisionPriorityScore({
    status: 'Strong',
    accuracyPercent: 88,
    pastPaperFrequency: 2,
    syllabusWeight: 5,
    isPrerequisiteForWeakTopic: false,
    repeatedMistakesCount: 0,
  });

  assert.equal(weakScore > strongScore, true);
});

test('buildStructuredRevisionTasks creates daily concept, practice, and review tasks', () => {
  const tasks = buildStructuredRevisionTasks({
    planId: 'plan_1',
    userId: 'u_1',
    subject: 'Biology',
    daysAvailable: 3,
    dailyHours: 2,
    diagnoses: [
      {
        id: 'd1',
        userId: 'u_1',
        subject: 'Biology',
        topicName: 'Photosynthesis',
        unitName: 'Unit 3: Plant Energetics',
        status: 'Weak',
        accuracyPercent: 35,
        questionsAttempted: 7,
        correctCount: 2,
        incorrectCount: 5,
        confidenceLevel: 'High',
        repeatedMistakesCount: 2,
        trendDelta: -5,
        commonMistakesReason: 'Confused light-dependent reactions with the Calvin cycle.',
        recommendedAction: 'Revise thylakoid photophosphorylation and carbon fixation.',
        pastPaperFrequency: 6,
        priorityScore: 92,
        citations: [],
        updatedAt: new Date().toISOString(),
      },
    ],
    topics: [],
  });

  assert.equal(tasks.length, 9); // 3 days * 3 tasks per day
  assert.equal(tasks[0].durationMinutes, 60);
  assert.equal(tasks[1].durationMinutes, 30);
  assert.equal(tasks[2].durationMinutes, 30);
});

test('seed dataset contains zero em dashes anywhere', async () => {
  const seed = await import('./seedData');
  const serialized = JSON.stringify(seed);
  assert.equal(serialized.includes('\u2014'), false, 'Seed data must not contain any em dashes');
});

test('dbRepo initializes demo user, passwords, and relations correctly', async () => {
  const { initDatabase, dbRepo, verifyPassword } = await import('../server/db');
  initDatabase();
  const user = dbRepo.getUserByEmail('demo@gapfinder.ai');
  assert.ok(user, 'Demo user should exist');
  assert.equal(verifyPassword('Demo@123', user.passwordHash), true);
  assert.equal(verifyPassword('WrongPass', user.passwordHash), false);

  const materials = dbRepo.getMaterials(user.id);
  assert.ok(materials.length >= 3, 'Demo materials should be seeded');

  const topics = dbRepo.getTopics(user.id);
  assert.ok(topics.length >= 4, 'Demo topics should be seeded');

  const quizzes = dbRepo.getQuizzes(user.id);
  assert.ok(quizzes.length >= 2, 'Demo quizzes should be seeded');

  const gaps = dbRepo.getGapDiagnoses(user.id);
  assert.ok(gaps.length >= 4, 'Demo gap diagnoses should be seeded');

  const plans = dbRepo.getRevisionPlans(user.id);
  assert.ok(plans.length >= 1, 'Demo revision plan should be seeded');
});

test('Groq AI service integration operates with llama-3.3-70b-versatile and strict fallbacks', async () => {
  const {
    GROQ_DEFAULT_MODEL,
    getGroqClient,
    generateEmbeddingVector,
    extractTopicsWithGroq,
    analyzePastPaperWithGroq,
    generateGroundedQuizQuestions,
    evaluateSubmittedAnswers,
    answerGroundedStudyQuery,
  } = await import('../server/groqService');

  assert.equal(GROQ_DEFAULT_MODEL, 'llama-3.3-70b-versatile');

  // Embeddings
  const vec = await generateEmbeddingVector('Cellular respiration and glycolysis ATP yield');
  assert.equal(vec.length, 64);
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
  assert.ok(norm > 0.99 && norm < 1.01, 'Embedding vector must be unit-normalized');

  // Sample chunks for Groq service tests
  const testChunks = [
    {
      id: 'chk_1',
      materialId: 'mat_1',
      userId: 'u_test',
      subject: 'Biology',
      documentName: 'Textbook.pdf',
      pageNumber: 15,
      chapter: 'Chapter 1: Cell Membrane',
      section: 'Active Transport Mechanisms',
      topic: 'Cell Biology',
      content: 'Primary active transport uses ATP hydrolysis directly to pump ions like Na+ and K+ against their electrochemical gradients across the plasma membrane.',
      embedding: vec,
      chunkIndex: 0,
    },
    {
      id: 'chk_2',
      materialId: 'mat_1',
      userId: 'u_test',
      subject: 'Biology',
      documentName: 'Textbook.pdf',
      pageNumber: 22,
      chapter: 'Chapter 2: Bioenergetics',
      section: 'Glycolysis and Substrate-Level Phosphorylation',
      topic: 'Cellular Respiration',
      content: 'Glycolysis converts one glucose molecule into two pyruvate molecules in the cytosol, yielding a net gain of 2 ATP and 2 NADH without requiring oxygen.',
      embedding: vec,
      chunkIndex: 1,
    },
  ];

  // Topic Extraction with Groq
  const extractedTopics = await extractTopicsWithGroq({
    userId: 'u_test',
    subject: 'Biology',
    chunks: testChunks,
  });
  assert.ok(extractedTopics.length >= 2, 'Should extract topics from chunks');
  assert.ok(extractedTopics[0].topicName.length > 0);
  assert.ok(extractedTopics[0].syllabusWeight >= 1 && extractedTopics[0].syllabusWeight <= 10);

  // Past Paper Analysis with Groq
  const pastPapers = await analyzePastPaperWithGroq({
    userId: 'u_test',
    materialId: 'mat_1',
    sourceDocument: 'PastPaper2024.pdf',
    subject: 'Biology',
    chunks: [
      {
        ...testChunks[0],
        content: 'Explain why active transport requires ATP hydrolysis to move sodium ions across the membrane [3 marks] (2024).',
      },
    ],
    existingTopics: extractedTopics,
  });
  assert.ok(pastPapers.length >= 1, 'Should extract past paper question');
  assert.equal(pastPapers[0].year, '2024');
  assert.equal(pastPapers[0].marks, 3);

  // Grounded Quiz Generation with Groq
  const quiz = await generateGroundedQuizQuestions({
    quizId: 'quiz_groq_test',
    subject: 'Biology',
    topics: ['Cell Biology', 'Cellular Respiration'],
    questionCount: 4,
    difficulty: 'Mixed',
    questionTypes: ['MCQ', 'TrueFalse', 'FillBlank', 'ShortAnswer'],
    retrievedChunks: testChunks,
  });
  assert.equal(quiz.length, 4, 'Should generate 4 diagnostic questions');
  assert.ok(quiz[0].citation.chunkId, 'Every question must cite a chunkId');
  assert.ok(quiz[0].citation.documentName, 'Every question must cite a documentName');

  // Answer Evaluation
  const evalResults = await evaluateSubmittedAnswers({
    questions: quiz,
    userResponses: {
      [quiz[0].id]: quiz[0].correctAnswer,
      [quiz[1].id]: 'Wrong answer that is incorrect',
    },
  });
  assert.equal(evalResults.length, 4);
  assert.equal(evalResults[0].isCorrect, true);
  assert.equal(evalResults[0].marksEarned, quiz[0].maxMarks);
  assert.equal(evalResults[1].isCorrect, false);
  assert.equal(evalResults[1].marksEarned, 0);

  // Grounded RAG Study Assistant with Groq
  const answered = await answerGroundedStudyQuery({
    query: 'What does active transport use to move ions?',
    subject: 'Biology',
    allChunks: testChunks,
  });
  assert.equal(answered.grounded, true);
  assert.ok(answered.citations.length > 0, 'Must attach source citations');
  assert.ok(answered.answer.length > 20);

  // Uncovered topic refusal
  const refused = await answerGroundedStudyQuery({
    query: 'Explain quantum chromodynamics and gluon color charge',
    subject: 'Biology',
    allChunks: testChunks,
  });
  assert.equal(refused.grounded, false);
  assert.equal(refused.citations.length, 0);
  assert.ok(refused.answer.includes('Insufficient Supporting Information'));
});


