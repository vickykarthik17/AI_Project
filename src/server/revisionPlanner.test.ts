import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { revisionPlannerService } from './revisionPlannerService';
import { intelligenceEngine } from './intelligenceEngine';
import { repo } from './repository';
import { initDatabase } from './db';
import {
  Citation,
  DiagnosticQuiz,
  KnowledgeStatus,
  QuizQuestion,
  QuizSubmissionAnswer,
  TopicGapDiagnosis,
  TopicNode,
} from '../types';

initDatabase();

const dummyCitation: Citation = {
  chunkId: 'chunk_rev_01',
  documentName: 'Advanced_Biology_Metabolism.pdf',
  chapter: 'Chapter 2: Bioenergetics',
  pageNumber: 34,
  section: 'Section 2.1: Photosynthetic Light Reactions',
  excerpt:
    'Photosystem II absorbs light at 680 nm to drive the photolysis of water, generating protons and oxygen.',
};

test('1. Plan Generation: Supports different study durations and time constraints', async () => {
  const studentId = '00000000-0000-4000-8000-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const subject = 'Biology';

  // Seed baseline topics and initial gap diagnoses
  const topics: TopicNode[] = [
    {
      id: 't_photo',
      userId: studentId,
      subject,
      unitName: 'Plant Physiology',
      chapterName: 'Photosynthesis',
      topicName: 'Photosynthesis',
      subtopics: ['Light-dependent reactions', 'Calvin Cycle'],
      importantConcepts: ['RuBisCO', 'Photolysis of water'],
      prerequisites: [],
      syllabusWeight: 9,
      pastPaperFrequency: 4,
    },
    {
      id: 't_resp',
      userId: studentId,
      subject,
      unitName: 'Cellular Energetics',
      chapterName: 'Respiration',
      topicName: 'Cellular Respiration',
      subtopics: ['Glycolysis', 'Krebs Cycle'],
      importantConcepts: ['Phosphofructokinase', 'Mitochondrial matrix'],
      prerequisites: [],
      syllabusWeight: 8,
      pastPaperFrequency: 3,
    },
  ];

  for (const t of topics) {
    await repo.saveTopic(t);
  }

  // Baseline initial gap diagnoses: Photosynthesis is Weak (35%), Respiration is Weak (20%)
  const initialGaps: TopicGapDiagnosis[] = [
    {
      id: `gap_${studentId}_photo`,
      userId: studentId,
      subject,
      topicName: 'Photosynthesis',
      unitName: 'Plant Physiology',
      status: 'Weak',
      accuracyPercent: 35,
      questionsAttempted: 4,
      correctCount: 1,
      incorrectCount: 3,
      confidenceLevel: 'Medium',
      repeatedMistakesCount: 1,
      trendDelta: 0,
      commonMistakesReason: 'Weak conceptual accuracy on photolysis and light reactions.',
      recommendedAction: 'Focus 60-min concept revision on Photosynthesis.',
      pastPaperFrequency: 4,
      priorityScore: 88,
      citations: [dummyCitation],
      updatedAt: new Date().toISOString(),
    },
    {
      id: `gap_${studentId}_resp`,
      userId: studentId,
      subject,
      topicName: 'Cellular Respiration',
      unitName: 'Cellular Energetics',
      status: 'Weak',
      accuracyPercent: 20,
      questionsAttempted: 4,
      correctCount: 1,
      incorrectCount: 3,
      confidenceLevel: 'Medium',
      repeatedMistakesCount: 2,
      trendDelta: 0,
      commonMistakesReason: 'Repeated misconceptions in Glycolysis enzyme regulation.',
      recommendedAction: 'Focus 60-min concept revision on Cellular Respiration.',
      pastPaperFrequency: 3,
      priorityScore: 92,
      citations: [dummyCitation],
      updatedAt: new Date().toISOString(),
    },
  ];
  await repo.saveGapDiagnoses(initialGaps, studentId, subject);

  // A. Generate Short Revision Plan (3 days, 1.5 hours/day = 90 mins daily)
  const shortResult = await revisionPlannerService.generateRevisionPlan({
    userId: studentId,
    subject,
    examDate: '2026-11-20',
    daysAvailable: 3,
    dailyHours: 1.5,
    prioritySubjects: [subject],
  });

  assert.ok(shortResult.activePlan);
  assert.equal(shortResult.activePlan.daysAvailable, 3);
  assert.equal(shortResult.activePlan.dailyHours, 1.5);
  assert.equal(shortResult.activePlan.version, 1);

  // Verify all tasks contain required fields
  for (const task of shortResult.activePlan.tasks) {
    assert.ok(task.dayNumber >= 1 && task.dayNumber <= 3, 'Day number must be in range 1-3');
    assert.ok(task.dateLabel.length > 0, 'Date label must be present');
    assert.ok(task.topicName.length > 0, 'Topic must be present');
    assert.ok(
      ['Critical', 'High', 'Medium', 'Review'].includes(task.priorityLevel),
      'Priority level must be valid'
    );
    assert.ok(task.durationMinutes > 0, 'Duration must be positive');
    assert.ok(task.learningObjectives.length > 0, 'Learning objectives must be present');
    assert.ok(task.title.length > 0, 'Recommended activity title must be present');
    assert.ok(task.practicePrompts.length > 0, 'Practice questions must be present');
    assert.equal(task.completed, false, 'Initial completion status must be false');
  }

  // B. Generate Comprehensive Revision Plan (7 days, 2.5 hours/day = 150 mins daily)
  const fullResult = await revisionPlannerService.generateRevisionPlan({
    userId: studentId,
    subject,
    examDate: '2026-11-25',
    daysAvailable: 7,
    dailyHours: 2.5,
    prioritySubjects: [subject],
  });

  assert.ok(fullResult.activePlan);
  assert.equal(fullResult.activePlan.daysAvailable, 7);
  assert.equal(fullResult.activePlan.dailyHours, 2.5);
  assert.equal(fullResult.activePlan.version, 2, 'Version should increment to v2');
  assert.equal(fullResult.historicalPlans.length, 1, 'Previous plan v1 must be preserved in history');
});

test('2. Adaptive Updates: Recalculates priorities, preserves completed tasks, and reallocates study time after quiz improvement', async () => {
  const studentId = '00000000-0000-4000-8000-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const subject = 'Biology';

  // Seed baseline topics
  const topics: TopicNode[] = [
    {
      id: 't_photo_2',
      userId: studentId,
      subject,
      unitName: 'Plant Physiology',
      chapterName: 'Photosynthesis',
      topicName: 'Photosynthesis',
      subtopics: ['Light Reactions', 'Calvin Cycle'],
      importantConcepts: ['RuBisCO'],
      prerequisites: [],
      syllabusWeight: 9,
      pastPaperFrequency: 4,
    },
    {
      id: 't_resp_2',
      userId: studentId,
      subject,
      unitName: 'Cellular Energetics',
      chapterName: 'Respiration',
      topicName: 'Cellular Respiration',
      subtopics: ['Glycolysis'],
      importantConcepts: ['Phosphofructokinase'],
      prerequisites: [],
      syllabusWeight: 8,
      pastPaperFrequency: 3,
    },
  ];
  for (const t of topics) await repo.saveTopic(t);

  // Initial gap state: Photosynthesis Weak (35%), Cellular Respiration Weak (25%)
  const initialGaps: TopicGapDiagnosis[] = [
    {
      id: `gap_${studentId}_p`,
      userId: studentId,
      subject,
      topicName: 'Photosynthesis',
      unitName: 'Plant Physiology',
      status: 'Weak',
      accuracyPercent: 35,
      questionsAttempted: 4,
      correctCount: 1,
      incorrectCount: 3,
      confidenceLevel: 'Medium',
      repeatedMistakesCount: 1,
      trendDelta: 0,
      commonMistakesReason: 'Weak conceptual accuracy on Photosynthesis.',
      recommendedAction: 'Focus 60-min concept revision on Photosynthesis.',
      pastPaperFrequency: 4,
      priorityScore: 85,
      citations: [dummyCitation],
      updatedAt: new Date().toISOString(),
    },
    {
      id: `gap_${studentId}_r`,
      userId: studentId,
      subject,
      topicName: 'Cellular Respiration',
      unitName: 'Cellular Energetics',
      status: 'Weak',
      accuracyPercent: 25,
      questionsAttempted: 4,
      correctCount: 1,
      incorrectCount: 3,
      confidenceLevel: 'Medium',
      repeatedMistakesCount: 2,
      trendDelta: 0,
      commonMistakesReason: 'Weak conceptual accuracy on Cellular Respiration.',
      recommendedAction: 'Focus 60-min concept revision on Cellular Respiration.',
      pastPaperFrequency: 3,
      priorityScore: 90,
      citations: [dummyCitation],
      updatedAt: new Date().toISOString(),
    },
  ];
  await repo.saveGapDiagnoses(initialGaps, studentId, subject);

  // 1. Generate initial revision plan v1 (5 days, 2 hours/day)
  const initialResult = await revisionPlannerService.generateRevisionPlan({
    userId: studentId,
    subject,
    examDate: '2026-11-22',
    daysAvailable: 5,
    dailyHours: 2,
    prioritySubjects: [subject],
  });

  const planV1 = initialResult.activePlan;
  assert.equal(planV1.version, 1);

  // 2. Student completes Day 1 tasks in Plan v1
  const day1Task1 = planV1.tasks[0];
  const day1Task2 = planV1.tasks[1];

  await repo.updateRevisionTaskStatus(studentId, day1Task1.id, true);
  await repo.updateRevisionTaskStatus(studentId, day1Task2.id, true);

  // 3. Student takes a new diagnostic re-test quiz on Photosynthesis and achieves 68% accuracy!
  // Photosynthesis improves from 35% (Weak) to 68% (Medium)
  const retestAnswers: QuizSubmissionAnswer[] = [
    {
      questionId: 'q_photo_new_1',
      topic: 'Photosynthesis',
      subtopic: 'Light Reactions',
      studentResponse: 'Photolysis of water produces oxygen',
      correctAnswer: 'Photolysis of water produces oxygen',
      isCorrect: true,
      marksEarned: 1,
      maxMarks: 1,
      evaluationExplanation: 'Correct.',
      difficulty: 'Medium',
      citation: dummyCitation,
    },
    {
      questionId: 'q_photo_new_2',
      topic: 'Photosynthesis',
      subtopic: 'Calvin Cycle',
      studentResponse: 'RuBisCO fixes carbon dioxide',
      correctAnswer: 'RuBisCO fixes carbon dioxide',
      isCorrect: true,
      marksEarned: 1,
      maxMarks: 1,
      evaluationExplanation: 'Correct.',
      difficulty: 'Medium',
      citation: dummyCitation,
    },
    {
      questionId: 'q_photo_new_3',
      topic: 'Photosynthesis',
      subtopic: 'Light Reactions',
      studentResponse: 'Inaccurate answer',
      correctAnswer: 'Non-cyclic photophosphorylation',
      isCorrect: false,
      marksEarned: 0,
      maxMarks: 1,
      evaluationExplanation: 'Missed non-cyclic photophosphorylation.',
      difficulty: 'Hard',
      citation: dummyCitation,
    },
  ];

  const completedQuiz: DiagnosticQuiz = {
    id: `quiz_retest_${studentId}`,
    userId: studentId,
    title: 'Photosynthesis Targeted Re-Test',
    subject,
    selectedTopics: ['Photosynthesis'],
    difficulty: 'Medium',
    timeLimitMinutes: 10,
    status: 'Completed',
    questions: [],
    answers: retestAnswers,
    totalScore: 2,
    maxScore: 3,
    accuracyPercent: 68,
    durationSeconds: 300,
    createdAt: new Date().toISOString(),
  };

  await repo.saveQuiz(completedQuiz);

  // 4. Trigger Adaptive Plan Update
  const updatedPlan = await revisionPlannerService.adaptRevisionPlanAfterQuiz({
    userId: studentId,
    quiz: completedQuiz,
  });

  assert.ok(updatedPlan);
  assert.equal(updatedPlan.version, 2, 'Adaptive plan should advance to v2');

  // Verify completed tasks from Plan v1 are preserved!
  const preservedCompleted = updatedPlan.tasks.filter((t) => t.completed);
  assert.ok(
    preservedCompleted.length >= 2,
    `Completed tasks must be preserved, found ${preservedCompleted.length}`
  );
  assert.ok(
    preservedCompleted.some((t) => t.id === day1Task1.id),
    'Day 1 task 1 must be preserved'
  );
  assert.ok(
    preservedCompleted.some((t) => t.id === day1Task2.id),
    'Day 1 task 2 must be preserved'
  );

  // Verify change summary explains the Photosynthesis improvement and priority reallocation
  const summaryText = updatedPlan.changeSummary.join(' ');
  assert.ok(
    summaryText.includes('Photosynthesis') &&
      (summaryText.includes('improved') || summaryText.includes('Reduced priority') || summaryText.includes('68%')),
    `Change summary must document Photosynthesis improvement: "${summaryText}"`
  );

  // Verify historical plan v1 is preserved and not overwritten
  const allStudentPlans = await repo.getRevisionPlans(studentId);
  assert.ok(
    allStudentPlans.length >= 2,
    `Expected at least 2 historical plan versions, got ${allStudentPlans.length}`
  );
  assert.equal(allStudentPlans[0].version, 2, 'Latest active plan must be v2');
  assert.equal(allStudentPlans[1].version, 1, 'Historical plan v1 must be preserved');
});

test('3. Dash Compliance: All generated revision tasks and change summaries contain zero em dashes or en dashes', async () => {
  const studentId = '00000000-0000-4000-8000-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const subject = 'Biology';

  const result = await revisionPlannerService.generateRevisionPlan({
    userId: studentId,
    subject,
    examDate: '2026-11-26',
    daysAvailable: 4,
    dailyHours: 2,
    prioritySubjects: [subject],
  });

  const serialized = JSON.stringify(result.activePlan);
  assert.ok(!serialized.includes('\u2014'), 'Must not contain em dash (\\u2014)');
  assert.ok(!serialized.includes('\u2013'), 'Must not contain en dash (\\u2013)');
});
