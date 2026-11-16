import test from 'node:test';
import assert from 'node:assert/strict';
import { intelligenceEngine } from './intelligenceEngine';
import { repo } from './repository';
import { initDatabase } from './db';
import {
  Citation,
  DiagnosticQuiz,
  QuizQuestion,
  QuizSubmissionAnswer,
  TopicNode,
} from '../types';

initDatabase();

const dummyCitation: Citation = {
  chunkId: 'chunk_bio_test_01',
  documentName: 'Advanced_Biochemistry_Cellular_Metabolism.pdf',
  chapter: 'Chapter 3: Cellular Metabolism',
  pageNumber: 42,
  section: 'Section 3.1: Glycolysis Pathway',
  excerpt:
    'Phosphofructokinase is the key allosteric rate-limiting enzyme that catalyzes the phosphorylation of fructose-6-phosphate to fructose-1,6-bisphosphate.',
};

test('1. Objective Answer Evaluation: Deterministic exact and normalized grading for MCQ, True/False, and Fill in Blank', async () => {
  // A. MCQ Question Evaluation
  const mcqQuestion: QuizQuestion = {
    id: 'q_mcq_01',
    quizId: 'quiz_test_01',
    topic: 'Glycolysis',
    subtopic: 'Rate-limiting enzymes',
    questionType: 'MCQ',
    difficulty: 'Medium',
    questionText: 'Which enzyme serves as the primary rate-limiting step in glycolysis?',
    options: [
      'Phosphofructokinase',
      'Hexokinase',
      'Pyruvate Kinase',
      'Triose Phosphate Isomerase',
    ],
    correctAnswer: 'Phosphofructokinase',
    maxMarks: 1,
    explanation:
      'Phosphofructokinase catalyzes the commitment step of glycolysis by converting fructose-6-phosphate to fructose-1,6-bisphosphate.',
    citation: dummyCitation,
  };

  // Correct MCQ
  const evalMcqCorrect = await intelligenceEngine.evaluateSingleAnswer({
    question: mcqQuestion,
    studentResponse: 'Phosphofructokinase',
  });
  assert.equal(evalMcqCorrect.isCorrect, true);
  assert.equal(evalMcqCorrect.marksEarned, 1);
  assert.equal(evalMcqCorrect.maxMarks, 1);
  assert.equal(evalMcqCorrect.topic, 'Glycolysis');
  assert.equal(evalMcqCorrect.difficulty, 'Medium');
  assert.ok(evalMcqCorrect.evaluationExplanation.includes('Correct!'));
  assert.equal(evalMcqCorrect.citation.chunkId, dummyCitation.chunkId);
  assert.deepEqual(evalMcqCorrect.missingConcepts, []);

  // Incorrect MCQ
  const evalMcqIncorrect = await intelligenceEngine.evaluateSingleAnswer({
    question: mcqQuestion,
    studentResponse: 'Hexokinase',
  });
  assert.equal(evalMcqIncorrect.isCorrect, false);
  assert.equal(evalMcqIncorrect.marksEarned, 0);
  assert.ok(evalMcqIncorrect.evaluationExplanation.includes('Incorrect'));
  assert.ok(evalMcqIncorrect.missingConcepts?.includes('Phosphofructokinase'));

  // B. True/False Question Evaluation
  const tfQuestion: QuizQuestion = {
    id: 'q_tf_01',
    quizId: 'quiz_test_01',
    topic: 'Glycolysis',
    subtopic: 'ATP Yield',
    questionType: 'TrueFalse',
    difficulty: 'Easy',
    questionText: 'True or False: Glycolysis occurs in the cytoplasm of eukaryotic cells.',
    options: ['True', 'False'],
    correctAnswer: 'True',
    maxMarks: 1,
    explanation: 'Glycolysis occurs in the cytoplasm and does not require organellar compartmentalization.',
    citation: dummyCitation,
  };

  const evalTfCorrect = await intelligenceEngine.evaluateSingleAnswer({
    question: tfQuestion,
    studentResponse: 'True',
  });
  assert.equal(evalTfCorrect.isCorrect, true);
  assert.equal(evalTfCorrect.marksEarned, 1);

  // C. Fill in the Blank Question Evaluation
  const fibQuestion: QuizQuestion = {
    id: 'q_fib_01',
    quizId: 'quiz_test_01',
    topic: 'Glycolysis',
    subtopic: 'End products',
    questionType: 'FillBlank',
    difficulty: 'Easy',
    questionText: 'The primary three-carbon organic product of glycolysis is ________.',
    correctAnswer: 'Pyruvate',
    maxMarks: 1,
    explanation: 'One glucose molecule produces two pyruvate molecules during glycolysis.',
    citation: dummyCitation,
  };

  // Case-insensitive normalized matching
  const evalFib = await intelligenceEngine.evaluateSingleAnswer({
    question: fibQuestion,
    studentResponse: '   pyruvate! ',
  });
  assert.equal(evalFib.isCorrect, true);
  assert.equal(evalFib.marksEarned, 1);

  // D. Unanswered Question Handling
  const evalUnanswered = await intelligenceEngine.evaluateSingleAnswer({
    question: mcqQuestion,
    studentResponse: '',
  });
  assert.equal(evalUnanswered.isCorrect, false);
  assert.equal(evalUnanswered.marksEarned, 0);
  assert.equal(evalUnanswered.studentResponse, '(Unanswered)');
  assert.ok(evalUnanswered.evaluationExplanation.includes('unanswered'));
});

test('2. Semantic Short Answer Evaluation: Evaluates conceptual explanations with structured outputs and partial marks', async () => {
  const shortAnswerQuestion: QuizQuestion = {
    id: 'q_sa_01',
    quizId: 'quiz_test_01',
    topic: 'Glycolysis',
    subtopic: 'Allosteric Regulation',
    questionType: 'ShortAnswer',
    difficulty: 'Hard',
    questionText:
      'Explain how phosphofructokinase is allosterically regulated in response to cellular energy levels.',
    correctAnswer:
      'Phosphofructokinase is allosterically inhibited by high levels of ATP and citrate, signaling ample energy supply. It is allosterically activated by high levels of AMP and ADP, stimulating glycolysis to generate ATP.',
    maxMarks: 2,
    explanation:
      'High ATP/AMP ratio signals energy sufficiency and down-regulates phosphofructokinase, whereas low energy charge activates the enzyme.',
    citation: dummyCitation,
  };

  // 1. Partial credit test: student mentions ATP inhibition but omits AMP/ADP activation
  const partialResponse =
    'Phosphofructokinase is inhibited when cellular ATP levels are high because the cell has sufficient energy.';
  const evalPartial = await intelligenceEngine.evaluateSemanticShortAnswer({
    question: shortAnswerQuestion,
    studentResponse: partialResponse,
  });

  assert.equal(evalPartial.maximum_marks, 2);
  assert.ok(
    evalPartial.awarded_marks >= 0.5 && evalPartial.awarded_marks <= 1.5,
    `Expected partial marks between 0.5 and 1.5, got ${evalPartial.awarded_marks}`
  );
  assert.ok(
    evalPartial.missing_concepts.length >= 1,
    'Missing concepts should be identified for partial response'
  );
  assert.ok(evalPartial.explanation.length > 10, 'Explanation must be provided');
  assert.ok(evalPartial.evidence_used.length > 5, 'Retrieved evidence citation must be present');

  // 2. Full credit test: student explains both inhibition by ATP and activation by AMP/ADP
  const fullResponse =
    'Phosphofructokinase is allosterically inhibited by high ATP and citrate when cellular energy is abundant, and stimulated by high AMP and ADP levels when energy is low.';
  const evalFull = await intelligenceEngine.evaluateSemanticShortAnswer({
    question: shortAnswerQuestion,
    studentResponse: fullResponse,
  });

  assert.equal(evalFull.awarded_marks, 2);
  assert.equal(evalFull.correctness, true);
  assert.equal(evalFull.maximum_marks, 2);

  // 3. Completely incorrect test
  const wrongResponse = 'It hydrolyzes ribosomes in the nucleus during mitosis.';
  const evalWrong = await intelligenceEngine.evaluateSemanticShortAnswer({
    question: shortAnswerQuestion,
    studentResponse: wrongResponse,
  });

  assert.equal(evalWrong.awarded_marks, 0);
  assert.equal(evalWrong.correctness, false);
  assert.ok(evalWrong.missing_concepts.length >= 1);
});

test('3. Deterministic Gap Analysis: Student A (Weak 0-49% with repeated misconceptions)', () => {
  const studentId = '00000000-0000-4000-8000-000000000041';
  const topicName = 'Glycolysis';

  // 4 attempted questions with 3 mistakes on the same subtopic
  const answers: QuizSubmissionAnswer[] = [
    {
      questionId: 'q1',
      topic: topicName,
      subtopic: 'Phosphofructokinase Regulation',
      studentResponse: 'Wrong Opt 1',
      correctAnswer: 'Phosphofructokinase',
      isCorrect: false,
      marksEarned: 0,
      maxMarks: 1,
      evaluationExplanation: 'Missed allosteric activator.',
      difficulty: 'Medium',
      citation: dummyCitation,
      missingConcepts: ['Allosteric activation by AMP'],
    },
    {
      questionId: 'q2',
      topic: topicName,
      subtopic: 'Phosphofructokinase Regulation',
      studentResponse: 'Wrong Opt 2',
      correctAnswer: 'Inhibited by ATP',
      isCorrect: false,
      marksEarned: 0,
      maxMarks: 1,
      evaluationExplanation: 'Confused ATP inhibition with activation.',
      difficulty: 'Hard',
      citation: dummyCitation,
      missingConcepts: ['ATP allosteric inhibition'],
    },
    {
      questionId: 'q3',
      topic: topicName,
      subtopic: 'Hexokinase Step',
      studentResponse: 'Correct answer',
      correctAnswer: 'Correct answer',
      isCorrect: true,
      marksEarned: 1,
      maxMarks: 1,
      evaluationExplanation: 'Correct.',
      difficulty: 'Easy',
      citation: dummyCitation,
    },
    {
      questionId: 'q4',
      topic: topicName,
      subtopic: 'Phosphofructokinase Regulation',
      studentResponse: 'Wrong Opt 3',
      correctAnswer: 'Citrate',
      isCorrect: false,
      marksEarned: 0,
      maxMarks: 1,
      evaluationExplanation: 'Missed citrate feedback inhibition.',
      difficulty: 'Medium',
      citation: dummyCitation,
      missingConcepts: ['Citrate feedback'],
    },
  ];

  const quiz: DiagnosticQuiz = {
    id: 'quiz_student_a_01',
    userId: studentId,
    title: 'Biochemistry Diagnostic',
    subject: 'Biochemistry',
    selectedTopics: [topicName],
    difficulty: 'Mixed',
    timeLimitMinutes: 15,
    status: 'Completed',
    questions: [],
    answers,
    totalScore: 1,
    maxScore: 4,
    accuracyPercent: 25,
    durationSeconds: 300,
    createdAt: new Date().toISOString(),
  };

  const topics: TopicNode[] = [
    {
      id: 't_glycolysis',
      userId: studentId,
      subject: 'Biochemistry',
      unitName: 'Cellular Energetics',
      chapterName: 'Metabolic Pathways',
      topicName: 'Glycolysis',
      subtopics: ['Phosphofructokinase Regulation', 'Hexokinase Step', 'Substrate-level phosphorylation'],
      importantConcepts: ['Allosteric regulation', 'Rate-limiting steps'],
      prerequisites: [],
      syllabusWeight: 9,
      pastPaperFrequency: 4,
    },
  ];

  const diagnoses = intelligenceEngine.calculateGapAnalysis({
    userId: studentId,
    subject: 'Biochemistry',
    quizzes: [quiz],
    topics,
  });

  assert.equal(diagnoses.length, 1);
  const diag = diagnoses[0];

  assert.equal(diag.topicName, 'Glycolysis');
  // 0-49% strictly classifies as Weak
  assert.equal(diag.status, 'Weak');
  assert.ok(diag.accuracyPercent <= 49, `Accuracy must be <= 49, got ${diag.accuracyPercent}`);
  assert.equal(diag.questionsAttempted, 4);
  assert.equal(diag.correctCount, 1);
  assert.equal(diag.incorrectCount, 3);
  assert.ok(diag.repeatedMistakesCount >= 1, 'Repeated mistakes count must be recorded');
  assert.ok(
    diag.repeatedMisconceptions && diag.repeatedMisconceptions.length > 0,
    'Repeated misconceptions must be identified'
  );
  assert.ok(
    diag.commonMistakesReason.includes('Recurring misconception') ||
    diag.commonMistakesReason.includes('Phosphofructokinase Regulation'),
    'Reason must cite the recurring error in Phosphofructokinase Regulation'
  );
  assert.ok(
    diag.recommendedAction.includes('60-minute') || diag.recommendedAction.includes('revision'),
    'Action must recommend focused revision'
  );
});

test('4. Deterministic Gap Analysis: Student B (Improving across multiple attempts with trend delta)', () => {
  const studentId = '00000000-0000-4000-8000-000000000042';
  const topicName = 'Citric Acid Cycle';

  // Attempt 1: 3 questions, 1 correct (33% accuracy)
  const attempt1: DiagnosticQuiz = {
    id: 'quiz_b_attempt_1',
    userId: studentId,
    title: 'Diagnostic Attempt 1',
    subject: 'Biochemistry',
    selectedTopics: [topicName],
    difficulty: 'Medium',
    timeLimitMinutes: 10,
    status: 'Completed',
    questions: [],
    answers: [
      {
        questionId: 'q1',
        topic: topicName,
        subtopic: 'Oxaloacetate Condensation',
        studentResponse: 'Wrong',
        correctAnswer: 'Citrate Synthase',
        isCorrect: false,
        marksEarned: 0,
        maxMarks: 1,
        evaluationExplanation: 'Incorrect enzyme.',
        difficulty: 'Medium',
        citation: dummyCitation,
      },
      {
        questionId: 'q2',
        topic: topicName,
        subtopic: 'NADH Yield',
        studentResponse: '3 NADH',
        correctAnswer: '3 NADH',
        isCorrect: true,
        marksEarned: 1,
        maxMarks: 1,
        evaluationExplanation: 'Correct.',
        difficulty: 'Medium',
        citation: dummyCitation,
      },
      {
        questionId: 'q3',
        topic: topicName,
        subtopic: 'Matrix Location',
        studentResponse: 'Cytoplasm',
        correctAnswer: 'Mitochondrial Matrix',
        isCorrect: false,
        marksEarned: 0,
        maxMarks: 1,
        evaluationExplanation: 'Incorrect location.',
        difficulty: 'Easy',
        citation: dummyCitation,
      },
    ],
    totalScore: 1,
    maxScore: 3,
    accuracyPercent: 33,
    durationSeconds: 240,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  };

  // Attempt 2: 3 questions, 3 correct (100% accuracy)
  const attempt2: DiagnosticQuiz = {
    id: 'quiz_b_attempt_2',
    userId: studentId,
    title: 'Diagnostic Attempt 2',
    subject: 'Biochemistry',
    selectedTopics: [topicName],
    difficulty: 'Medium',
    timeLimitMinutes: 10,
    status: 'Completed',
    questions: [],
    answers: [
      {
        questionId: 'q4',
        topic: topicName,
        subtopic: 'Oxaloacetate Condensation',
        studentResponse: 'Citrate Synthase',
        correctAnswer: 'Citrate Synthase',
        isCorrect: true,
        marksEarned: 1,
        maxMarks: 1,
        evaluationExplanation: 'Correct.',
        difficulty: 'Medium',
        citation: dummyCitation,
      },
      {
        questionId: 'q5',
        topic: topicName,
        subtopic: 'FADH2 Yield',
        studentResponse: '1 FADH2',
        correctAnswer: '1 FADH2',
        isCorrect: true,
        marksEarned: 1,
        maxMarks: 1,
        evaluationExplanation: 'Correct.',
        difficulty: 'Medium',
        citation: dummyCitation,
      },
      {
        questionId: 'q6',
        topic: topicName,
        subtopic: 'Matrix Location',
        studentResponse: 'Mitochondrial Matrix',
        correctAnswer: 'Mitochondrial Matrix',
        isCorrect: true,
        marksEarned: 1,
        maxMarks: 1,
        evaluationExplanation: 'Correct.',
        difficulty: 'Medium',
        citation: dummyCitation,
      },
    ],
    totalScore: 3,
    maxScore: 3,
    accuracyPercent: 100,
    durationSeconds: 200,
    createdAt: new Date().toISOString(),
  };

  const topics: TopicNode[] = [
    {
      id: 't_cac',
      userId: studentId,
      subject: 'Biochemistry',
      unitName: 'Cellular Energetics',
      chapterName: 'Citric Acid Cycle',
      topicName: 'Citric Acid Cycle',
      subtopics: ['Oxaloacetate Condensation', 'NADH Yield', 'Matrix Location'],
      importantConcepts: ['Citrate Synthase', 'Reducing Equivalents'],
      prerequisites: [],
      syllabusWeight: 8,
      pastPaperFrequency: 3,
    },
  ];

  const diagnoses = intelligenceEngine.calculateGapAnalysis({
    userId: studentId,
    subject: 'Biochemistry',
    quizzes: [attempt1, attempt2],
    topics,
  });

  assert.equal(diagnoses.length, 1);
  const diag = diagnoses[0];

  assert.equal(diag.topicName, 'Citric Acid Cycle');
  // Attempt 1 was 33%, Attempt 2 was 100%. Overall accuracy is (1+3)/(3+3) = 67% (Medium)
  assert.equal(diag.status, 'Medium');
  assert.equal(diag.questionsAttempted, 6);
  assert.equal(diag.correctCount, 4);
  assert.equal(diag.incorrectCount, 2);
  // Trend delta: latest (100) - first (33) = +67%
  assert.ok(diag.trendDelta > 0, `Trend delta should be positive (+67%), got ${diag.trendDelta}`);
  assert.ok(
    diag.commonMistakesReason.includes('Improved') || diag.commonMistakesReason.includes('+'),
    'Reason should document measurable improvement across attempts'
  );
});

test('5. Deterministic Gap Analysis: Student C (Insufficient Evidence with < 2 questions)', () => {
  const studentId = '00000000-0000-4000-8000-000000000043';
  const topicName = 'Oxidative Phosphorylation';

  // Only 1 question attempted
  const quiz: DiagnosticQuiz = {
    id: 'quiz_c_single',
    userId: studentId,
    title: 'Quick Check',
    subject: 'Biochemistry',
    selectedTopics: [topicName],
    difficulty: 'Easy',
    timeLimitMinutes: 5,
    status: 'Completed',
    questions: [],
    answers: [
      {
        questionId: 'q_single',
        topic: topicName,
        subtopic: 'Chemiosmosis',
        studentResponse: 'ATP Synthase',
        correctAnswer: 'ATP Synthase',
        isCorrect: true,
        marksEarned: 1,
        maxMarks: 1,
        evaluationExplanation: 'Correct.',
        difficulty: 'Easy',
        citation: dummyCitation,
      },
    ],
    totalScore: 1,
    maxScore: 1,
    accuracyPercent: 100,
    durationSeconds: 60,
    createdAt: new Date().toISOString(),
  };

  const topics: TopicNode[] = [
    {
      id: 't_oxphos',
      userId: studentId,
      subject: 'Biochemistry',
      unitName: 'Cellular Energetics',
      chapterName: 'Electron Transport',
      topicName: 'Oxidative Phosphorylation',
      subtopics: ['Chemiosmosis', 'Proton Gradient'],
      importantConcepts: ['ATP Synthase', 'Complex IV'],
      prerequisites: [],
      syllabusWeight: 8,
      pastPaperFrequency: 3,
    },
  ];

  const diagnoses = intelligenceEngine.calculateGapAnalysis({
    userId: studentId,
    subject: 'Biochemistry',
    quizzes: [quiz],
    topics,
  });

  assert.equal(diagnoses.length, 1);
  const diag = diagnoses[0];

  // Invariant: Even though accuracy is 100%, 1 question < 2 questions attempted MUST classify as Insufficient evidence
  assert.equal(diag.status, 'Insufficient evidence');
  assert.equal(diag.confidenceLevel, 'Low');
  assert.equal(diag.questionsAttempted, 1);
  assert.ok(
    diag.commonMistakesReason.includes('Insufficient assessment evidence'),
    'Reason must state insufficient evidence'
  );
  assert.ok(
    diag.recommendedAction.includes('at least 2 questions'),
    'Recommended action must prompt taking at least 2 questions'
  );
});

test('6. Dash Compliance: All evaluations, explanations, and gap reports contain zero em dashes or en dashes', () => {
  const studentId = '00000000-0000-4000-8000-000000000044';
  const topicName = 'Enzyme Kinetics';

  const topics: TopicNode[] = [
    {
      id: 't_enzymes',
      userId: studentId,
      subject: 'Biochemistry',
      unitName: 'Enzymology',
      chapterName: 'Kinetics',
      topicName: 'Enzyme Kinetics',
      subtopics: ['Michaelis-Menten', 'Lineweaver-Burk'],
      importantConcepts: ['Km value', 'Vmax'],
      prerequisites: [],
      syllabusWeight: 7,
      pastPaperFrequency: 2,
    },
  ];

  const diagnoses = intelligenceEngine.calculateGapAnalysis({
    userId: studentId,
    subject: 'Biochemistry',
    quizzes: [],
    topics,
  });

  const serialized = JSON.stringify(diagnoses);
  assert.ok(!serialized.includes('\u2014'), 'Must not contain em dash (\\u2014)');
  assert.ok(!serialized.includes('\u2013'), 'Must not contain en dash (\\u2013)');
});

