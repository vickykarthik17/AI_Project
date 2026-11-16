import { z } from 'zod';

/**
 * 1. Syllabus Topics & Hierarchy Schema
 */
export const syllabusTopicItemSchema = z.object({
  unitName: z.string().describe('Unit title or unit number'),
  chapterName: z.string().describe('Chapter title'),
  topicName: z.string().describe('Main topic title'),
  subtopics: z.array(z.string()).default([]).describe('Subtopics within this topic'),
  importantConcepts: z.array(z.string()).default([]).describe('Key concepts or mechanisms'),
  prerequisites: z.array(z.string()).default([]).describe('Prerequisite topics'),
  syllabusWeight: z.number().min(1).max(10).default(7).describe('Importance weight from 1 to 10'),
});

export const syllabusTopicsSchema = z.object({
  topics: z.array(syllabusTopicItemSchema).describe('List of extracted hierarchical syllabus topics'),
});

/**
 * 2. Past Examination Questions Schema
 */
export const pastPaperQuestionItemSchema = z.object({
  pageNumber: z.number().default(1).describe('Page number where the question was found'),
  topic: z.string().describe('Mapped syllabus topic name'),
  subtopic: z.string().default('Core Concept').describe('Mapped subtopic'),
  questionText: z.string().describe('Exact question prompt text'),
  year: z.string().nullable().optional().describe('Exam year if explicitly stated in text, otherwise null'),
  marks: z.number().nullable().optional().describe('Marks allocated if explicitly stated in text, otherwise null'),
  questionType: z.enum(['MCQ', 'TrueFalse', 'FillBlank', 'ShortAnswer']).default('ShortAnswer'),
});

export const pastPaperQuestionsSchema = z.object({
  questions: z.array(pastPaperQuestionItemSchema).describe('List of extracted past exam questions'),
});

/**
 * 3. Diagnostic Quiz Generation Schema
 */
export const quizQuestionGeneratedSchema = z.object({
  questionText: z.string().describe('Clear, academic question text grounded in provided study passages'),
  topic: z.string().describe('Associated topic name'),
  subtopic: z.string().describe('Associated subtopic or section name'),
  questionType: z.enum(['MCQ', 'TrueFalse', 'FillBlank', 'ShortAnswer']),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  options: z.array(z.string()).optional().describe('Options for MCQ or True/False questions'),
  correctAnswer: z.string().describe('Accurate correct answer directly supported by excerpt'),
  maxMarks: z.number().min(1).max(5).default(1),
  explanation: z.string().describe('Factual explanation referencing the excerpt'),
  citationChunkId: z.string().describe('ID of chunk providing factual support'),
});

export const quizQuestionsSchema = z.object({
  questions: z.array(quizQuestionGeneratedSchema).describe('Array of generated diagnostic quiz questions'),
});

/**
 * 4. Semantic Short Answer Evaluation Schema
 */
export const semanticEvaluationSchema = z.object({
  correctness: z.boolean().describe('Whether the answer demonstrates correct conceptual understanding'),
  awarded_marks: z.number().min(0).describe('Marks awarded based on scientific accuracy and completeness'),
  maximum_marks: z.number().min(1).describe('Maximum marks allocated for this question'),
  missing_concepts: z.array(z.string()).default([]).describe('Key mechanisms or concepts the student missed'),
  explanation: z.string().describe('Constructive examiner feedback without em dashes'),
  evidence_used: z.string().describe('Retrieved textbook evidence supporting this grading decision'),
});

/**
 * 5. Knowledge Gap Explanation Schema
 */
export const gapExplanationSchema = z.object({
  summary: z.string().describe('Concise summary of student performance and mastery gaps'),
  weakTopics: z.array(z.string()).describe('Topics requiring urgent remediation'),
  priorityRecommendations: z.array(z.string()).describe('Concrete action items for the student'),
});

/**
 * 6. Personalized Revision Schedule Schema
 */
export const revisionTaskItemSchema = z.object({
  dayNumber: z.number().min(1).describe('Sequential day number in the revision plan'),
  dateLabel: z.string().describe('Human readable date label for the study day'),
  topicName: z.string().describe('Target topic name'),
  priorityLevel: z.enum(['High', 'Medium', 'Low']).describe('Urgency level based on student gap severity'),
  durationMinutes: z.number().min(15).describe('Allocated study duration in minutes'),
  learningObjectives: z.string().describe('Specific conceptual competency goal for the day'),
  recommendedActivity: z.string().describe('Recommended action: conceptual review, practice, or active recall'),
  practicePrompts: z.array(z.string()).describe('Sample practice questions targeting diagnosed gaps'),
});

export const revisionTasksSchema = z.object({
  tasks: z.array(revisionTaskItemSchema).describe('Daily revision tasks generated for the student'),
  changeSummary: z.array(z.string()).default([]).describe('Explanations of adjustments made relative to previous plan'),
});

