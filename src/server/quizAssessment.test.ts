import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { ingestionService } from './ingestionService';
import { quizGeneratorService } from './quizGeneratorService';
import { repo } from './repository';
import { initDatabase } from './db';

initDatabase();

const TEST_STUDENT_ID = '00000000-0000-4000-8000-000000000031';

async function createBiochemistryPdf(): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Page 1: Glycolysis
  const page1 = pdfDoc.addPage([600, 800]);
  page1.drawText('Chapter 3: Cellular Metabolism', { x: 50, y: 740, size: 16, font });
  page1.drawText('Section 3.1: Glycolysis pathway', { x: 50, y: 710, size: 12, font });
  page1.drawText(
    'Glycolysis is a cytoplasmic metabolic pathway that converts glucose into pyruvate molecules.',
    { x: 50, y: 670, size: 10, font }
  );
  page1.drawText(
    'Phosphofructokinase serves as the primary allosteric rate-limiting regulatory enzyme in glycolysis.',
    { x: 50, y: 640, size: 10, font }
  );
  page1.drawText(
    'The net yield of glycolysis per glucose molecule is two ATP molecules and two NADH molecules.',
    { x: 50, y: 610, size: 10, font }
  );

  // Page 2: Krebs Cycle
  const page2 = pdfDoc.addPage([600, 800]);
  page2.drawText('Chapter 4: Citric Acid Cycle', { x: 50, y: 740, size: 16, font });
  page2.drawText('Section 4.2: Mitochondrial Matrix Reactions', { x: 50, y: 710, size: 12, font });
  page2.drawText(
    'The Krebs cycle operates inside the mitochondrial matrix to oxidize acetyl groups derived from pyruvate.',
    { x: 50, y: 670, size: 10, font }
  );
  page2.drawText(
    'Oxaloacetate condenses with acetyl-CoA to synthesize citrate catalyzed by citrate synthase.',
    { x: 50, y: 640, size: 10, font }
  );
  page2.drawText(
    'Each turn of the citric acid cycle yields three NADH molecules, one FADH2 molecule, and one GTP.',
    { x: 50, y: 610, size: 10, font }
  );

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

before(async () => {
  const pdfBuffer = await createBiochemistryPdf();
  const result = await ingestionService.ingestDocument({
    studentId: TEST_STUDENT_ID,
    fileName: 'Biochemistry_Metabolism.pdf',
    subject: 'Biochemistry',
    docType: 'Textbook',
    buffer: pdfBuffer,
  });
  assert.equal(result.status, 'Indexed');
});

test('1. Ingestion: Verifies indexed biochemistry PDF chunks in repository', async () => {
  const chunks = await repo.getChunks(TEST_STUDENT_ID, 'Biochemistry');
  assert.ok(chunks.length >= 2, 'Chunks should be persisted in repository');
  assert.ok(
    chunks.some((c) => c.content.includes('Glycolysis')),
    'Chunks must contain Glycolysis text'
  );
  assert.ok(
    chunks.some((c) => c.content.includes('Krebs')),
    'Chunks must contain Krebs text'
  );
});

test('2. RAG Diagnostic Quiz Generation: Creates questions grounded strictly in retrieved chunks', async () => {
  const quiz = await quizGeneratorService.generateDiagnosticQuiz({
    userId: TEST_STUDENT_ID,
    subject: 'Biochemistry',
    topics: ['Cellular Metabolism', 'Citric Acid Cycle'],
    questionCount: 4,
    difficulty: 'Mixed',
    questionTypes: ['MCQ', 'TrueFalse', 'FillBlank', 'ShortAnswer'],
    timeLimitMinutes: 20,
  });

  assert.ok(quiz.id.startsWith('quiz_'), 'Quiz ID should start with quiz_');
  assert.equal(quiz.subject, 'Biochemistry');
  assert.equal(quiz.status, 'InProgress');
  assert.equal(quiz.timeLimitMinutes, 20);
  assert.equal(quiz.questions.length, 4);

  // Validate every single question adheres to the strict specification
  for (const q of quiz.questions) {
    assert.ok(q.id, 'Question must have a unique ID');
    assert.ok(q.topic, 'Question must have a topic');
    assert.ok(q.subtopic, 'Question must have a subtopic');
    assert.ok(['MCQ', 'TrueFalse', 'FillBlank', 'ShortAnswer'].includes(q.questionType));
    assert.ok(['Easy', 'Medium', 'Hard'].includes(q.difficulty));
    assert.ok(q.questionText.length > 10, 'Question text must be substantive');
    assert.ok(q.correctAnswer.length > 0, 'Correct answer must be present');
    assert.ok(q.explanation.length > 0, 'Explanation must be present');
    assert.ok(q.maxMarks >= 1, 'Marks must be positive');

    // Source Citation Verification
    assert.ok(q.citation, 'Question must include citation');
    assert.ok(q.citation.chunkId, 'Citation must have chunkId');
    assert.ok(q.citation.documentName.includes('.pdf'), 'Citation document name must be valid');
    assert.ok(q.citation.pageNumber >= 1, 'Citation must preserve page number');
    assert.ok(q.citation.chapter, 'Citation must include chapter');
    assert.ok(q.citation.section, 'Citation must include section');
    assert.ok(q.citation.excerpt.length > 10, 'Citation must include excerpt');

    // MCQ specific verification
    if (q.questionType === 'MCQ') {
      assert.ok(Array.isArray(q.options) && q.options.length >= 2, 'MCQ must have options');
      assert.ok(q.options.includes(q.correctAnswer), 'MCQ options must include correct answer');
    }

    // True/False specific verification
    if (q.questionType === 'TrueFalse') {
      assert.deepEqual(q.options, ['True', 'False']);
    }
  }

  // Verify citation grounding against the actual stored chunks
  const allStoredChunks = await repo.getChunks(TEST_STUDENT_ID, 'Biochemistry');
  for (const q of quiz.questions) {
    const matchingChunk = allStoredChunks.find((c) => c.id === q.citation.chunkId);
    assert.ok(
      matchingChunk,
      `Citation chunkId "${q.citation.chunkId}" must match an actual stored chunk in database`
    );
    assert.equal(matchingChunk.documentName, q.citation.documentName);
    assert.equal(matchingChunk.pageNumber, q.citation.pageNumber);
  }
});

test('3. Security Invariant: Answers and explanations are strictly hidden while quiz is InProgress', async () => {
  const fullQuiz = await quizGeneratorService.generateDiagnosticQuiz({
    userId: TEST_STUDENT_ID,
    subject: 'Biochemistry',
    topics: ['Cellular Metabolism'],
    questionCount: 3,
    difficulty: 'Medium',
    questionTypes: ['MCQ', 'TrueFalse'],
    timeLimitMinutes: 10,
  });

  assert.equal(fullQuiz.status, 'InProgress');
  assert.ok(fullQuiz.questions[0].correctAnswer.length > 0, 'Internal quiz retains answers in DB');

  // Sanitize for student delivery
  const sanitized = quizGeneratorService.getSanitizedQuizForStudent(fullQuiz);

  assert.equal(sanitized.id, fullQuiz.id);
  assert.equal(sanitized.status, 'InProgress');
  for (const sq of sanitized.questions) {
    assert.equal(sq.correctAnswer, '', 'Student-facing correctAnswer must be blank before submission');
    assert.equal(sq.explanation, '', 'Student-facing explanation must be blank before submission');
  }
});

test('4. Draft Progress: In-progress draft answers are saved and restored without evaluation', async () => {
  const quiz = await quizGeneratorService.generateDiagnosticQuiz({
    userId: TEST_STUDENT_ID,
    subject: 'Biochemistry',
    topics: ['Cellular Metabolism'],
    questionCount: 2,
    difficulty: 'Easy',
    questionTypes: ['MCQ', 'TrueFalse'],
    timeLimitMinutes: 10,
  });

  const draftAnswers: Record<string, string> = {
    [quiz.questions[0].id]: 'Draft Option A',
  };

  const saveResult = await quizGeneratorService.saveQuizDraftProgress({
    quizId: quiz.id,
    userId: TEST_STUDENT_ID,
    answers: draftAnswers,
    remainingSeconds: 540,
  });

  assert.equal(saveResult.success, true);

  const updatedQuiz = await repo.getQuizById(quiz.id, TEST_STUDENT_ID);
  assert.ok(updatedQuiz);
  assert.equal(updatedQuiz.status, 'InProgress');
  assert.equal(updatedQuiz.answers.length, 1);
  assert.equal(updatedQuiz.answers[0].studentResponse, 'Draft Option A');
});

test('5. Submission & Evaluation: Evaluates responses, computes scores, and prevents duplicate submissions', async () => {
  const quiz = await quizGeneratorService.generateDiagnosticQuiz({
    userId: TEST_STUDENT_ID,
    subject: 'Biochemistry',
    topics: ['Cellular Metabolism', 'Citric Acid Cycle'],
    questionCount: 4,
    difficulty: 'Medium',
    questionTypes: ['MCQ', 'TrueFalse', 'FillBlank', 'ShortAnswer'],
    timeLimitMinutes: 15,
  });

  // Provide correct answer for question 0, wrong for question 1
  const responses: Record<string, string> = {
    [quiz.questions[0].id]: quiz.questions[0].correctAnswer,
    [quiz.questions[1].id]: 'Definitely incorrect response 12345',
    [quiz.questions[2].id]: quiz.questions[2].correctAnswer,
    [quiz.questions[3].id]: 'Pyruvate enters the mitochondria and undergoes oxidative decarboxylation',
  };

  const { completedQuiz, evaluatedAnswers } = await quizGeneratorService.submitAndEvaluateQuiz({
    quizId: quiz.id,
    userId: TEST_STUDENT_ID,
    answers: responses,
    durationSeconds: 320,
  });

  assert.equal(completedQuiz.status, 'Completed');
  assert.ok(completedQuiz.completedAt, 'completedAt timestamp must be set');
  assert.equal(completedQuiz.durationSeconds, 320);
  assert.equal(evaluatedAnswers.length, 4);

  // Question 0 should be marked correct
  assert.equal(evaluatedAnswers[0].isCorrect, true);
  assert.equal(evaluatedAnswers[0].marksEarned, quiz.questions[0].maxMarks);

  // Question 1 should be marked incorrect
  assert.equal(evaluatedAnswers[1].isCorrect, false);
  assert.equal(evaluatedAnswers[1].marksEarned, 0);

  // Verify totalScore and accuracy
  assert.ok(completedQuiz.totalScore >= 1);
  assert.ok(completedQuiz.accuracyPercent >= 25 && completedQuiz.accuracyPercent <= 100);

  // Answers and explanations are now fully revealed
  const postSubmitQuiz = quizGeneratorService.getSanitizedQuizForStudent(completedQuiz);
  assert.ok(postSubmitQuiz.questions[0].correctAnswer.length > 0, 'Answers revealed after submission');
  assert.ok(postSubmitQuiz.questions[0].explanation.length > 0, 'Explanations revealed after submission');

  // Verify Duplicate Submission Prevention Guard
  await assert.rejects(
    async () => {
      await quizGeneratorService.submitAndEvaluateQuiz({
        quizId: quiz.id,
        userId: TEST_STUDENT_ID,
        answers: responses,
        durationSeconds: 320,
      });
    },
    (err: any) => {
      return (
        err.message.includes('already been submitted and completed') ||
        err.statusCode === 400
      );
    },
    'Subsequent submissions of a completed quiz must be rejected'
  );
});

test('6. Dash Compliance: Generated quizzes contain zero em dashes or en dashes anywhere', async () => {
  const quiz = await quizGeneratorService.generateDiagnosticQuiz({
    userId: TEST_STUDENT_ID,
    subject: 'Biochemistry',
    topics: ['Cellular Metabolism'],
    questionCount: 4,
    difficulty: 'Mixed',
    questionTypes: ['MCQ', 'TrueFalse', 'FillBlank', 'ShortAnswer'],
    timeLimitMinutes: 15,
  });

  const serialized = JSON.stringify(quiz);
  assert.ok(!serialized.includes('\u2014'), 'Must not contain em dash (\\u2014)');
  assert.ok(!serialized.includes('\u2013'), 'Must not contain en dash (\\u2013)');
});
