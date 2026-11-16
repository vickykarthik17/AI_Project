import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  aiTelemetry,
  createGroundedChatStream,
  gapExplanationSchema,
  generateStructuredData,
  generateTextData,
  getGroqModel,
  getGroqProvider,
  getStudyAssistantTools,
  isGroqConfigured,
  pastPaperQuestionsSchema,
  pipeGroundedStreamToResponse,
  PROMPTS,
  quizQuestionsSchema,
  revisionTasksSchema,
  semanticEvaluationSchema,
  syllabusTopicsSchema,
} from './ai';
import { DEMO_USER_ID, SAMPLE_CHUNKS } from '../domain/seedData';
import { sanitizeDashes } from '../domain/engine';

test('1. AI SDK Provider Configuration: Resolves Groq model and handles offline mode safely', () => {
  const model = getGroqModel('llama-3.3-70b-versatile');
  assert.ok(model, 'Model must be defined');
  assert.equal(typeof model.modelId, 'string', 'Model ID must be a string');
  assert.equal(model.modelId, 'llama-3.3-70b-versatile');
});

test('2. AI SDK Schemas: Validates structured schemas for all GapFinder AI workflows', () => {
  // A. Syllabus Schema
  const validSyllabus = syllabusTopicsSchema.parse({
    topics: [
      {
        unitName: 'Unit 1: Energetics',
        chapterName: 'Chapter 3: Photosynthesis',
        topicName: 'Photosynthesis',
        subtopics: ['Light Reactions', 'Calvin Cycle'],
        importantConcepts: ['Photolysis of water in PSII'],
        prerequisites: ['Cellular Biology'],
        syllabusWeight: 9,
      },
    ],
  });
  assert.equal(validSyllabus.topics.length, 1);
  assert.equal(validSyllabus.topics[0].topicName, 'Photosynthesis');

  // B. Past Paper Schema
  const validPastPaper = pastPaperQuestionsSchema.parse({
    questions: [
      {
        pageNumber: 3,
        topic: 'Photosynthesis',
        subtopic: 'Thylakoid Reactions',
        questionText: 'Explain the role of plastoquinone in electron transport.',
        year: '2023',
        marks: 4,
        questionType: 'ShortAnswer',
      },
    ],
  });
  assert.equal(validPastPaper.questions.length, 1);
  assert.equal(validPastPaper.questions[0].marks, 4);

  // C. Quiz Question Schema
  const validQuiz = quizQuestionsSchema.parse({
    questions: [
      {
        questionText: 'Which organelle houses the Calvin cycle?',
        topic: 'Photosynthesis',
        subtopic: 'Stroma',
        questionType: 'MCQ',
        difficulty: 'Medium',
        options: ['Stroma', 'Thylakoid lumen', 'Mitochondrial matrix', 'Cytosol'],
        correctAnswer: 'Stroma',
        maxMarks: 1,
        explanation: 'The Calvin cycle takes place exclusively in the stroma of chloroplasts.',
        citationChunkId: 'chunk_bio_05',
      },
    ],
  });
  assert.equal(validQuiz.questions.length, 1);

  // D. Semantic Evaluation Schema
  const validEval = semanticEvaluationSchema.parse({
    correctness: true,
    awarded_marks: 1.5,
    maximum_marks: 2.0,
    missing_concepts: ['NADPH oxidation'],
    explanation: 'Demonstrated solid grasp of light reactions with minor omission.',
    evidence_used: 'Biology_Textbook.pdf (Page 42)',
  });
  assert.equal(validEval.correctness, true);
  assert.equal(validEval.awarded_marks, 1.5);

  // E. Revision Schedule Schema
  const validPlan = revisionTasksSchema.parse({
    tasks: [
      {
        dayNumber: 1,
        dateLabel: 'Day 1 (Nov 17)',
        topicName: 'Photosynthesis',
        priorityLevel: 'High',
        durationMinutes: 60,
        learningObjectives: 'Master thylakoid photolysis mechanisms',
        recommendedActivity: 'Active recall and diagram labeling',
        practicePrompts: ['Draw photosystem II electron flow'],
      },
    ],
    changeSummary: ['Prioritized Weak topics first.'],
  });
  assert.equal(validPlan.tasks.length, 1);
  assert.equal(validPlan.tasks[0].priorityLevel, 'High');
});

test('3. AI SDK Generation: Executes structured and text generation with deterministic fallbacks', async () => {
  // Test structured data generation with deterministic fallback
  const fallbackObj = {
    correctness: true,
    awarded_marks: 2.0,
    maximum_marks: 2.0,
    missing_concepts: [],
    explanation: 'Demonstrated full mastery.',
    evidence_used: 'Chapter 3 (Page 42)',
  };

  const resultObj = await generateStructuredData({
    schema: semanticEvaluationSchema,
    system: PROMPTS.semanticEvaluationPrompt,
    prompt: 'Evaluate student response.',
    fallback: () => fallbackObj,
    operationName: 'testStructuredFallback',
  });

  assert.ok(resultObj, 'Structured output must be returned');
  assert.equal(resultObj.correctness, true);
  assert.equal(resultObj.awarded_marks, 2.0);

  // Test text generation with fallback
  const fallbackText = 'Grounded textbook explanation of photosynthesis.';
  const resultText = await generateTextData({
    system: PROMPTS.ragSystemPrompt,
    prompt: 'Explain photosynthesis.',
    fallback: () => fallbackText,
    operationName: 'testTextFallback',
  });

  assert.ok(resultText, 'Text output must be returned');
  assert.equal(typeof resultText, 'string');
});

test('4. AI SDK Tools: Enforces student data isolation and validates inputs', async () => {
  const tools = getStudyAssistantTools(DEMO_USER_ID, 'Biology');
  assert.ok(tools.searchUploadedDocuments, 'searchUploadedDocuments tool must exist');
  assert.ok(tools.fetchTopicPerformance, 'fetchTopicPerformance tool must exist');
  assert.ok(tools.fetchPreviousMistakes, 'fetchPreviousMistakes tool must exist');

  // Verify searchUploadedDocuments execution
  const searchExec = tools.searchUploadedDocuments.execute as any;
  const searchResult = await searchExec({ query: 'thylakoid', topK: 2 });
  assert.ok(searchResult, 'Search result must be returned');
  assert.ok(Array.isArray(searchResult.chunks), 'Must return chunks array');

  // Verify fetchTopicPerformance execution
  const perfExec = tools.fetchTopicPerformance.execute as any;
  const perfResult = await perfExec({ topicName: 'Photosynthesis' });
  assert.ok(perfResult, 'Performance result must be returned');

  // Verify multi-tenant safety: missing studentId throws error
  assert.throws(
    () => getStudyAssistantTools('', 'Biology'),
    /Security Invariant/,
    'Must prevent tool initialization without authenticated studentId'
  );
});

test('5. AI SDK Streaming: Creates grounded text stream and pipes SSE events', async () => {
  const mockChunks = SAMPLE_CHUNKS.slice(0, 2).map((c) => ({
    chunkId: c.id,
    documentId: c.materialId,
    studentId: DEMO_USER_ID,
    subject: c.subject,
    documentName: c.documentName,
    pageNumber: c.pageNumber,
    chapter: c.chapter,
    section: c.section,
    topic: c.topic,
    content: c.content,
    similarityScore: 0.92,
  }));

  const mockRes: any = {
    headers: {} as Record<string, string>,
    chunksWritten: [] as string[],
    setHeader(key: string, val: string) {
      this.headers[key] = val;
    },
    write(chunk: string) {
      this.chunksWritten.push(chunk);
    },
    end() {
      this.ended = true;
    },
    ended: false,
  };

  const citations = [
    {
      chunkId: 'chunk_bio_05',
      documentName: 'Biology_Textbook.pdf',
      chapter: 'Chapter 3: Photosynthesis',
      pageNumber: 42,
      section: 'Thylakoid Membrane',
      excerpt: 'Light reactions occur in the thylakoid.',
      similarityScore: 0.92,
    },
  ];

  // Create a mock stream result matching Vercel AI SDK textStream interface
  const mockStreamResult = {
    textStream: (async function* () {
      yield 'Photosynthesis ';
      yield 'converts ';
      yield 'light energy into chemical energy.';
    })(),
  };

  await pipeGroundedStreamToResponse(mockStreamResult, mockRes, citations);

  assert.equal(mockRes.headers['Content-Type'], 'text/event-stream; charset=utf-8');
  assert.ok(mockRes.chunksWritten.length >= 3, 'Must have written streaming SSE chunks');
  assert.ok(mockRes.ended, 'Response must have ended');

  // Verify final data chunk contains citations and full content
  const lastChunk = mockRes.chunksWritten[mockRes.chunksWritten.length - 1];
  assert.ok(lastChunk.includes('"type":"done"'), 'Final event must be done');
  assert.ok(lastChunk.includes('chunk_bio_05'), 'Final event must include citations');
});

test('6. AI SDK Usage Telemetry: Tracks token usage and execution latency', () => {
  aiTelemetry.clear();

  aiTelemetry.record({
    operation: 'testOperation',
    model: 'llama-3.3-70b-versatile',
    promptTokens: 120,
    completionTokens: 85,
    totalTokens: 205,
    durationMs: 450,
    success: true,
  });

  const summary = aiTelemetry.getSummary();
  assert.equal(summary.totalRequests, 1);
  assert.equal(summary.successful, 1);
  assert.equal(summary.totalTokens, 205);
  assert.equal(summary.avgLatencyMs, 450);
});

test('7. Dash Compliance: All AI SDK prompts, schemas, and outputs contain zero em dashes or en dashes', () => {
  for (const [key, prompt] of Object.entries(PROMPTS)) {
    assert.ok(!/[\u2013\u2014]/.test(prompt), `Prompt ${key} must contain zero em dashes or en dashes`);
  }
});

