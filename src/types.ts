export type ProcessingStatus =
  | 'Uploaded'
  | 'Extracting'
  | 'Chunking'
  | 'Embedding'
  | 'Indexed'
  | 'Indexing'
  | 'Processing'
  | 'Ready'
  | 'Failed';

export type DocumentType = 'Syllabus' | 'Textbook' | 'Study Notes' | 'Past Paper' | 'Plain Text';

export type KnowledgeStatus = 'Weak' | 'Medium' | 'Strong' | 'Insufficient evidence';

export type ConfidenceLevel = 'Low' | 'Medium' | 'High';

export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard';

export type QuestionType = 'MCQ' | 'TrueFalse' | 'FillBlank' | 'ShortAnswer';

export interface User {
  id: string;
  name: string;
  email: string;
  targetExam?: string;
  examDate?: string;
  dailyHours?: number;
  isDemo?: boolean;
  createdAt: string;
}

export interface StudyMaterial {
  id: string;
  userId: string;
  title: string;
  fileName: string;
  subject: string;
  docType: DocumentType;
  fileSize: number;
  pageCount: number;
  chunkCount: number;
  status: ProcessingStatus;
  errorMessage?: string;
  isSample?: boolean;
  contentHash?: string;
  storagePath?: string;
  uploadedAt: string;
}

export interface DocumentChunk {
  id: string; // chunk_id
  chunkId?: string; // alias for id
  materialId: string; // document_id
  documentId?: string; // alias for materialId
  userId: string; // student_id
  studentId?: string; // alias for userId
  subject: string;
  documentName: string;
  pageNumber: number;
  chapter: string;
  section: string;
  topic: string;
  content: string; // extracted_text
  extractedText?: string; // alias for content
  embedding: number[];
  chunkIndex: number;
}

export interface Citation {
  chunkId: string;
  documentName: string;
  chapter: string;
  pageNumber: number;
  section: string;
  excerpt: string;
  similarityScore?: number;
}

export interface RetrievalChunkResult {
  chunkId: string;
  documentId: string;
  studentId: string;
  subject: string;
  documentName: string;
  pageNumber: number;
  chapter: string;
  section: string;
  topic: string;
  content: string;
  similarityScore: number;
}

export interface RagInspectionTelemetry {
  query: string;
  queryEmbeddingStatus: {
    provider: string;
    model: string;
    dimensions: number;
    preview: number[];
    generatedAt: string;
  };
  filtersApplied: {
    studentId: string;
    subject?: string;
    topics?: string[];
    documentId?: string;
  };
  retrievedChunks: RetrievalChunkResult[];
  contextPassedToGroq: string;
  groqModel: string;
  groqResponse: {
    rawContent: string;
    model: string;
    finishReason?: string;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  };
  citationMapping: Array<{
    citationIndex: number;
    chunkId: string;
    documentName: string;
    chapter: string;
    pageNumber: number;
    section: string;
    excerpt: string;
    similarityScore: number;
    verified: boolean;
  }>;
  grounded: boolean;
  insufficientEvidence: boolean;
  executionTimeMs?: number;
}

export interface TopicNode {
  id: string;
  userId: string;
  subject: string;
  unitName: string;
  chapterName: string;
  topicName: string;
  subtopics: string[];
  importantConcepts: string[];
  prerequisites: string[];
  syllabusWeight: number; // 1 to 10
  pastPaperFrequency: number; // count of past paper appearances
  isSample?: boolean;
}

export interface PastPaperQuestion {
  id: string;
  userId: string;
  materialId: string;
  sourceDocument: string;
  pageNumber: number;
  subject: string;
  topic: string;
  subtopic: string;
  questionText: string;
  year: string | null;
  marks: number | null;
  questionType: string;
  needsReview?: boolean;
  mappingConfidence?: 'High' | 'Medium' | 'Low' | 'Uncertain';
  validationEvidence?: string;
  isSample?: boolean;
}

export interface PastPaperIntelligence {
  totalQuestions: number;
  frequentlyTestedTopics: Array<{
    topicName: string;
    questionCount: number;
    percentage: number;
    syllabusWeight: number;
  }>;
  yearDistribution: Array<{
    year: string;
    questionCount: number;
    topicsCovered: string[];
  }>;
  topicYearMatrix: Record<string, Record<string, number>>;
  questionsNeedingReviewCount: number;
  sourceReferences: Array<{
    documentName: string;
    materialId: string;
    questionCount: number;
    pages: number[];
  }>;
}

export interface HierarchicalUnit {
  unitName: string;
  chapters: Array<{
    chapterName: string;
    topics: TopicNode[];
  }>;
}

export interface HierarchicalTopicMap {
  subject: string;
  units: HierarchicalUnit[];
  totalTopics: number;
}

export interface QuizQuestion {
  id: string;
  quizId: string;
  topic: string;
  subtopic: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  questionText: string;
  options?: string[];
  correctAnswer: string;
  maxMarks: number;
  explanation: string;
  citation: Citation;
}

export interface QuizSubmissionAnswer {
  questionId: string;
  topic: string;
  subtopic: string;
  studentResponse: string;
  correctAnswer: string;
  isCorrect: boolean;
  marksEarned: number;
  maxMarks: number;
  evaluationExplanation: string;
  difficulty: DifficultyLevel;
  citation: Citation;
  missingConcepts?: string[];
  evidenceUsed?: string;
}

export interface DiagnosticQuiz {
  id: string;
  userId: string;
  title: string;
  subject: string;
  selectedTopics: string[];
  difficulty: DifficultyLevel | 'Mixed';
  timeLimitMinutes: number;
  status: 'InProgress' | 'Completed';
  questions: QuizQuestion[];
  answers: QuizSubmissionAnswer[];
  totalScore: number;
  maxScore: number;
  accuracyPercent: number;
  durationSeconds: number;
  isSample?: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface TopicGapDiagnosis {
  id: string;
  userId: string;
  subject: string;
  topicName: string;
  unitName: string;
  status: KnowledgeStatus;
  accuracyPercent: number;
  questionsAttempted: number;
  correctCount: number;
  incorrectCount: number;
  confidenceLevel: ConfidenceLevel;
  repeatedMistakesCount: number;
  repeatedMisconceptions?: string[];
  trendDelta: number; // positive = improving, negative = declining
  previousStatus?: KnowledgeStatus;
  commonMistakesReason: string;
  reasonForClassification?: string;
  recommendedAction: string;
  pastPaperFrequency: number;
  priorityScore: number;
  citations: Citation[];
  isSample?: boolean;
  updatedAt: string;
}

export interface RevisionTask {
  id: string;
  planId: string;
  userId: string;
  dayNumber: number;
  dateLabel: string;
  topicName: string;
  subject: string;
  taskType: 'Concept Revision' | 'Practice Questions' | 'Mistake Review';
  title: string;
  durationMinutes: number;
  priorityLevel: 'Critical' | 'High' | 'Medium' | 'Review';
  learningObjectives: string[];
  practicePrompts: string[];
  completed: boolean;
  reasonForInclusion: string;
}

export interface RevisionPlan {
  id: string;
  userId: string;
  subject: string;
  examDate: string;
  daysAvailable: number;
  dailyHours: number;
  prioritySubjects: string[];
  version: number;
  changeSummary: string[];
  tasks: RevisionTask[];
  isSample?: boolean;
  createdAt: string;
}

export type StudyAssistantIntent =
  | 'explain_topic'
  | 'simplify_concept'
  | 'summarize_chapter'
  | 'explain_mistake'
  | 'practice_questions'
  | 'compare_concepts'
  | 'review_mistakes'
  | 'test_weak_areas'
  | 'general';

export interface ChatMessage {
  id: string;
  userId?: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  grounded: boolean;
  intent?: StudyAssistantIntent | string;
  insufficientEvidence?: boolean;
  debugTelemetry?: RagInspectionTelemetry;
  createdAt: string;
}

export interface ContextualAction {
  id: string;
  label: string;
  prompt: string;
  intent: StudyAssistantIntent;
  description: string;
  topicName?: string;
}
