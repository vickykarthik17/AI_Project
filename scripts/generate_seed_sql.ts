import fs from 'node:fs';
import path from 'node:path';
import {
  DEMO_USER_ID,
  SAMPLE_CHUNKS,
  SAMPLE_GAP_DIAGNOSES,
  SAMPLE_MATERIALS,
  SAMPLE_PAST_PAPER_QUESTIONS,
  SAMPLE_QUIZZES,
  SAMPLE_REVISION_PLAN,
  SAMPLE_TOPICS,
} from '../src/domain/seedData';

// Map legacy demo user id to fixed demo UUID
const DEMO_STUDENT_ID = '00000000-0000-0000-0000-000000000001';
const BIOLOGY_SUBJECT_ID = '10000000-0000-0000-0000-000000000001';

// Deterministic UUID maps
const docIdMap = new Map<string, string>();
SAMPLE_MATERIALS.forEach((m, idx) => {
  docIdMap.set(m.id, `20000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`);
});

const topicIdMap = new Map<string, string>();
SAMPLE_TOPICS.forEach((t, idx) => {
  topicIdMap.set(t.topicName.toLowerCase(), `40000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`);
  topicIdMap.set(t.id, `40000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`);
});

const quizIdMap = new Map<string, string>();
SAMPLE_QUIZZES.forEach((q, idx) => {
  quizIdMap.set(q.id, `60000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`);
});

const questionIdMap = new Map<string, string>();
let qCounter = 1;
SAMPLE_QUIZZES.forEach((q) => {
  q.questions.forEach((question) => {
    questionIdMap.set(question.id, `70000000-0000-0000-0000-${String(qCounter++).padStart(12, '0')}`);
  });
});

const planId = '80000000-0000-0000-0000-000000000001';

function escapeSql(str: string | null | undefined): string {
  if (str === null || str === undefined) return 'NULL';
  return `'${str.replace(/'/g, "''")}'`;
}

function escapeJson(obj: any): string {
  return `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;
}

let sql = `-- ============================================================================
-- GapFinder AI: Production Supabase Seed Script
-- Demo Account: demo@gapfinder.ai / Demo@123
-- Student ID: 00000000-0000-0000-0000-000000000001
-- ============================================================================

-- Ensure pgcrypto extension for password hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 1. Demo Student in auth.users and public.students
INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
)
VALUES (
    '${DEMO_STUDENT_ID}',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'demo@gapfinder.ai',
    crypt('Demo@123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Demo Student"}'::jsonb,
    now(),
    now()
)
ON CONFLICT (id) DO UPDATE SET
    encrypted_password = crypt('Demo@123', gen_salt('bf')),
    email_confirmed_at = now();

INSERT INTO public.students (
    id,
    email,
    name,
    target_exam,
    exam_date,
    daily_hours,
    is_demo,
    created_at,
    updated_at
)
VALUES (
    '${DEMO_STUDENT_ID}',
    'demo@gapfinder.ai',
    'Demo Student',
    'AP / National Advanced Biology Examination',
    '2026-11-18',
    2.0,
    true,
    now(),
    now()
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    target_exam = EXCLUDED.target_exam,
    exam_date = EXCLUDED.exam_date,
    daily_hours = EXCLUDED.daily_hours,
    is_demo = EXCLUDED.is_demo;

-- 2. Subjects
INSERT INTO public.subjects (id, student_id, name)
VALUES ('${BIOLOGY_SUBJECT_ID}', '${DEMO_STUDENT_ID}', 'Biology')
ON CONFLICT (student_id, name) DO NOTHING;

-- 3. Documents (Study Materials)
`;

SAMPLE_MATERIALS.forEach((m) => {
  const uuid = docIdMap.get(m.id)!;
  sql += `INSERT INTO public.documents (
    id, student_id, subject_id, subject_name, title, file_name, file_path, doc_type, file_size, page_count, chunk_count, status, is_sample, uploaded_at
) VALUES (
    '${uuid}', '${DEMO_STUDENT_ID}', '${BIOLOGY_SUBJECT_ID}', ${escapeSql(m.subject)}, ${escapeSql(m.title)}, ${escapeSql(m.fileName)}, ${escapeSql(m.fileName)}, ${escapeSql(m.docType)}, ${m.fileSize}, ${m.pageCount}, ${m.chunkCount}, ${escapeSql(m.status)}, true, '${m.uploadedAt}'
) ON CONFLICT (id) DO NOTHING;\n`;
});

sql += `\n-- 4. Document Chunks with Vector Embeddings\n`;
SAMPLE_CHUNKS.forEach((c, idx) => {
  const chunkUuid = `30000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`;
  const docUuid = docIdMap.get(c.materialId) || docIdMap.get('mat_bio_textbook')!;
  const vecString = `'[${c.embedding.join(',')}]'::vector(64)`;

  sql += `INSERT INTO public.document_chunks (
    id, document_id, student_id, subject_id, subject_name, document_name, page_number, chapter, section, topic, content, embedding, chunk_index
) VALUES (
    '${chunkUuid}', '${docUuid}', '${DEMO_STUDENT_ID}', '${BIOLOGY_SUBJECT_ID}', ${escapeSql(c.subject)}, ${escapeSql(c.documentName)}, ${c.pageNumber}, ${escapeSql(c.chapter)}, ${escapeSql(c.section)}, ${escapeSql(c.topic)}, ${escapeSql(c.content)}, ${vecString}, ${c.chunkIndex}
) ON CONFLICT (id) DO NOTHING;\n`;
});

sql += `\n-- 5. Topics and Subtopics\n`;
let subtopicCounter = 1;
SAMPLE_TOPICS.forEach((t) => {
  const topicUuid = topicIdMap.get(t.id)!;
  sql += `INSERT INTO public.topics (
    id, student_id, subject_id, subject_name, unit_name, chapter_name, topic_name, important_concepts, prerequisites, syllabus_weight, past_paper_frequency, is_sample
) VALUES (
    '${topicUuid}', '${DEMO_STUDENT_ID}', '${BIOLOGY_SUBJECT_ID}', ${escapeSql(t.subject)}, ${escapeSql(t.unitName)}, ${escapeSql(t.chapterName)}, ${escapeSql(t.topicName)}, ${escapeJson(t.importantConcepts)}, ${escapeJson(t.prerequisites)}, ${t.syllabusWeight}, ${t.pastPaperFrequency}, true
) ON CONFLICT (id) DO NOTHING;\n`;

  t.subtopics.forEach((subName) => {
    const subUuid = `45000000-0000-0000-0000-${String(subtopicCounter++).padStart(12, '0')}`;
    sql += `INSERT INTO public.subtopics (id, topic_id, student_id, name)
VALUES ('${subUuid}', '${topicUuid}', '${DEMO_STUDENT_ID}', ${escapeSql(subName)})
ON CONFLICT (id) DO NOTHING;\n`;
  });
});

sql += `\n-- 6. Past Paper Questions\n`;
SAMPLE_PAST_PAPER_QUESTIONS.forEach((pp, idx) => {
  const ppUuid = `50000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`;
  const docUuid = docIdMap.get(pp.materialId) || docIdMap.get('mat_bio_past_papers')!;
  const topicUuid = topicIdMap.get(pp.topic.toLowerCase()) || null;

  sql += `INSERT INTO public.past_paper_questions (
    id, student_id, document_id, topic_id, source_document, page_number, subject_name, topic_name, subtopic_name, question_text, year, marks, question_type, is_sample
) VALUES (
    '${ppUuid}', '${DEMO_STUDENT_ID}', '${docUuid}', ${topicUuid ? `'${topicUuid}'` : 'NULL'}, ${escapeSql(pp.sourceDocument)}, ${pp.pageNumber}, ${escapeSql(pp.subject)}, ${escapeSql(pp.topic)}, ${escapeSql(pp.subtopic)}, ${escapeSql(pp.questionText)}, ${escapeSql(pp.year)}, ${pp.marks || 'NULL'}, ${escapeSql(pp.questionType)}, true
) ON CONFLICT (id) DO NOTHING;\n`;
});

sql += `\n-- 7. Diagnostic Quizzes, Quiz Questions, and Student Answers (Preserving All Attempts)\n`;
let answerCounter = 1;
SAMPLE_QUIZZES.forEach((quiz) => {
  const qzUuid = quizIdMap.get(quiz.id)!;
  sql += `INSERT INTO public.quizzes (
    id, student_id, subject_id, title, subject_name, selected_topics, difficulty, time_limit_minutes, status, total_score, max_score, accuracy_percent, duration_seconds, is_sample, created_at, completed_at
) VALUES (
    '${qzUuid}', '${DEMO_STUDENT_ID}', '${BIOLOGY_SUBJECT_ID}', ${escapeSql(quiz.title)}, ${escapeSql(quiz.subject)}, ${escapeJson(quiz.selectedTopics)}, ${escapeSql(quiz.difficulty)}, ${quiz.timeLimitMinutes}, ${escapeSql(quiz.status)}, ${quiz.totalScore}, ${quiz.maxScore}, ${quiz.accuracyPercent}, ${quiz.durationSeconds}, true, '${quiz.createdAt}', ${quiz.completedAt ? `'${quiz.completedAt}'` : 'NULL'}
) ON CONFLICT (id) DO NOTHING;\n`;

  quiz.questions.forEach((q) => {
    const qUuid = questionIdMap.get(q.id)!;
    const topicUuid = topicIdMap.get(q.topic.toLowerCase()) || null;
    sql += `INSERT INTO public.quiz_questions (
    id, quiz_id, topic_id, topic_name, subtopic_name, question_type, difficulty, question_text, options, correct_answer, max_marks, explanation, citation_chunk_id, citation_document, citation_chapter, citation_page, citation_section, citation_excerpt
) VALUES (
    '${qUuid}', '${qzUuid}', ${topicUuid ? `'${topicUuid}'` : 'NULL'}, ${escapeSql(q.topic)}, ${escapeSql(q.subtopic)}, ${escapeSql(q.questionType)}, ${escapeSql(q.difficulty)}, ${escapeSql(q.questionText)}, ${q.options ? escapeJson(q.options) : 'NULL'}, ${escapeSql(q.correctAnswer)}, ${q.maxMarks}, ${escapeSql(q.explanation)}, ${escapeSql(q.citation?.chunkId)}, ${escapeSql(q.citation?.documentName)}, ${escapeSql(q.citation?.chapter)}, ${q.citation?.pageNumber || 'NULL'}, ${escapeSql(q.citation?.section)}, ${escapeSql(q.citation?.excerpt)}
) ON CONFLICT (id) DO NOTHING;\n`;
  });

  quiz.answers.forEach((ans) => {
    const ansUuid = `75000000-0000-0000-0000-${String(answerCounter++).padStart(12, '0')}`;
    const targetQUuid = questionIdMap.get(ans.questionId) || questionIdMap.get(ans.questionId.replace('_ans', '')) || 'NULL';
    sql += `INSERT INTO public.student_answers (
    id, quiz_id, question_id, student_id, topic_name, subtopic_name, student_response, correct_answer, is_correct, marks_earned, max_marks, evaluation_explanation, difficulty
) VALUES (
    '${ansUuid}', '${qzUuid}', ${targetQUuid === 'NULL' ? 'NULL' : `'${targetQUuid}'`}, '${DEMO_STUDENT_ID}', ${escapeSql(ans.topic)}, ${escapeSql(ans.subtopic)}, ${escapeSql(ans.studentResponse)}, ${escapeSql(ans.correctAnswer)}, ${ans.isCorrect}, ${ans.marksEarned}, ${ans.maxMarks}, ${escapeSql(ans.evaluationExplanation)}, ${escapeSql(ans.difficulty)}
) ON CONFLICT (id) DO NOTHING;\n`;
  });
});

sql += `\n-- 8. Topic Performance\n`;
const TOPIC_PERFORMANCES = [
  { topic: 'Cell Biology', attempted: 6, correct: 5, incorrect: 1, acc: 83, repeated: 0, hardOrMed: 4 },
  { topic: 'Genetics', attempted: 6, correct: 4, incorrect: 2, acc: 67, repeated: 1, hardOrMed: 5 },
  { topic: 'Photosynthesis', attempted: 7, correct: 2, incorrect: 5, acc: 29, repeated: 3, hardOrMed: 6 },
  { topic: 'Respiration', attempted: 7, correct: 3, incorrect: 4, acc: 43, repeated: 2, hardOrMed: 6 },
  { topic: 'Human Physiology', attempted: 6, correct: 4, incorrect: 2, acc: 67, repeated: 0, hardOrMed: 5 },
];

TOPIC_PERFORMANCES.forEach((tp, idx) => {
  const perfUuid = `78000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`;
  const topicUuid = topicIdMap.get(tp.topic.toLowerCase()) || null;
  sql += `INSERT INTO public.topic_performance (
    id, student_id, topic_id, topic_name, questions_attempted, correct_count, incorrect_count, accuracy_percent, repeated_mistakes_count, hard_or_medium_count
) VALUES (
    '${perfUuid}', '${DEMO_STUDENT_ID}', ${topicUuid ? `'${topicUuid}'` : 'NULL'}, ${escapeSql(tp.topic)}, ${tp.attempted}, ${tp.correct}, ${tp.incorrect}, ${tp.acc}, ${tp.repeated}, ${tp.hardOrMed}
) ON CONFLICT (student_id, topic_name) DO UPDATE SET
    questions_attempted = EXCLUDED.questions_attempted,
    correct_count = EXCLUDED.correct_count,
    incorrect_count = EXCLUDED.incorrect_count,
    accuracy_percent = EXCLUDED.accuracy_percent,
    repeated_mistakes_count = EXCLUDED.repeated_mistakes_count,
    hard_or_medium_count = EXCLUDED.hard_or_medium_count;\n`;
});

sql += `\n-- 9. Knowledge Gap Reports\n`;
SAMPLE_GAP_DIAGNOSES.forEach((gap, idx) => {
  const gapUuid = `79000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`;
  sql += `INSERT INTO public.gap_reports (
    id, student_id, subject_name, topic_name, unit_name, status, accuracy_percent, questions_attempted, correct_count, incorrect_count, confidence_level, repeated_mistakes_count, trend_delta, previous_status, common_mistakes_reason, recommended_action, past_paper_frequency, priority_score, citations, is_sample, updated_at
) VALUES (
    '${gapUuid}', '${DEMO_STUDENT_ID}', ${escapeSql(gap.subject)}, ${escapeSql(gap.topicName)}, ${escapeSql(gap.unitName)}, ${escapeSql(gap.status)}, ${gap.accuracyPercent}, ${gap.questionsAttempted}, ${gap.correctCount}, ${gap.incorrectCount}, ${escapeSql(gap.confidenceLevel)}, ${gap.repeatedMistakesCount}, ${gap.trendDelta}, ${escapeSql(gap.previousStatus)}, ${escapeSql(gap.commonMistakesReason)}, ${escapeSql(gap.recommendedAction)}, ${gap.pastPaperFrequency}, ${gap.priorityScore}, ${escapeJson(gap.citations)}, true, '${gap.updatedAt}'
) ON CONFLICT (student_id, topic_name) DO UPDATE SET
    status = EXCLUDED.status,
    accuracy_percent = EXCLUDED.accuracy_percent,
    questions_attempted = EXCLUDED.questions_attempted,
    correct_count = EXCLUDED.correct_count,
    incorrect_count = EXCLUDED.incorrect_count,
    confidence_level = EXCLUDED.confidence_level,
    repeated_mistakes_count = EXCLUDED.repeated_mistakes_count,
    trend_delta = EXCLUDED.trend_delta,
    common_mistakes_reason = EXCLUDED.common_mistakes_reason,
    recommended_action = EXCLUDED.recommended_action,
    priority_score = EXCLUDED.priority_score,
    citations = EXCLUDED.citations;\n`;
});

sql += `\n-- 10. Revision Plan and Tasks\n`;
sql += `INSERT INTO public.revision_plans (
    id, student_id, subject_name, exam_date, days_available, daily_hours, priority_subjects, version, change_summary, is_sample, created_at
) VALUES (
    '${planId}', '${DEMO_STUDENT_ID}', ${escapeSql(SAMPLE_REVISION_PLAN.subject)}, '${SAMPLE_REVISION_PLAN.examDate}', ${SAMPLE_REVISION_PLAN.daysAvailable}, ${SAMPLE_REVISION_PLAN.dailyHours}, ${escapeJson(SAMPLE_REVISION_PLAN.prioritySubjects)}, ${SAMPLE_REVISION_PLAN.version}, ${escapeJson(SAMPLE_REVISION_PLAN.changeSummary)}, true, '${SAMPLE_REVISION_PLAN.createdAt}'
) ON CONFLICT (id) DO NOTHING;\n`;

SAMPLE_REVISION_PLAN.tasks.forEach((task, idx) => {
  const taskUuid = `85000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`;
  sql += `INSERT INTO public.revision_tasks (
    id, plan_id, student_id, day_number, date_label, topic_name, subject_name, task_type, title, duration_minutes, priority_level, learning_objectives, practice_prompts, completed, reason_for_inclusion, created_at
) VALUES (
    '${taskUuid}', '${planId}', '${DEMO_STUDENT_ID}', ${task.dayNumber}, ${escapeSql(task.dateLabel)}, ${escapeSql(task.topicName)}, ${escapeSql(task.subject)}, ${escapeSql(task.taskType)}, ${escapeSql(task.title)}, ${task.durationMinutes}, ${escapeSql(task.priorityLevel)}, ${escapeJson(task.learningObjectives)}, ${escapeJson(task.practicePrompts)}, ${task.completed}, ${escapeSql(task.reasonForInclusion)}, now()
) ON CONFLICT (id) DO NOTHING;\n`;
});

sql += `\n-- 11. Progress History (Preserving Quiz Attempts)\n`;
SAMPLE_QUIZZES.forEach((q, idx) => {
  const progUuid = `90000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`;
  const qzUuid = quizIdMap.get(q.id)!;
  sql += `INSERT INTO public.progress_history (
    id, student_id, quiz_id, attempt_number, quiz_title, subject_name, accuracy_percent, total_score, max_score, duration_seconds, completed_at
) VALUES (
    '${progUuid}', '${DEMO_STUDENT_ID}', '${qzUuid}', ${idx + 1}, ${escapeSql(q.title)}, ${escapeSql(q.subject)}, ${q.accuracyPercent}, ${q.totalScore}, ${q.maxScore}, ${q.durationSeconds}, '${q.completedAt || q.createdAt}'
) ON CONFLICT (id) DO NOTHING;\n`;
});

fs.writeFileSync(path.resolve('supabase/seed.sql'), sql, 'utf8');
console.log('Successfully generated supabase/seed.sql (Length: ' + sql.length + ' chars)');

