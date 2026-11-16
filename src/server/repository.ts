import {
  ChatMessage,
  DiagnosticQuiz,
  DocumentChunk,
  PastPaperQuestion,
  RevisionPlan,
  StudyMaterial,
  TopicGapDiagnosis,
  TopicNode,
} from '../types';
import { dbRepo } from './db';
import {
  isSupabaseConfigured,
  supabaseDbRepo,
  supabaseStorageService,
} from './supabase';

/**
 * Unified persistent repository for GapFinder AI.
 * Routes dynamically to Supabase PostgreSQL when credentials are provided,
 * while seamlessly falling back to SQLite for local development and offline environments.
 */
export const repo = {
  // ============================================================================
  // Study Materials
  // ============================================================================
  async getMaterials(
    userId: string,
    subjectFilter?: string,
    token?: string
  ): Promise<StudyMaterial[]> {
    if (isSupabaseConfigured()) {
      return supabaseDbRepo.getMaterials(userId, subjectFilter, token);
    }
    const mats = dbRepo.getMaterials(userId);
    if (subjectFilter && subjectFilter !== 'all') {
      return mats.filter((m) => m.subject.toLowerCase() === subjectFilter.toLowerCase());
    }
    return mats;
  },

  async getMaterialById(
    id: string,
    userId: string,
    token?: string
  ): Promise<StudyMaterial | null> {
    if (isSupabaseConfigured()) {
      return supabaseDbRepo.getMaterialById(id, userId, token);
    }
    return dbRepo.getMaterialById(userId, id);
  },

  async saveMaterial(material: StudyMaterial, token?: string): Promise<void> {
    if (isSupabaseConfigured()) {
      await supabaseDbRepo.createMaterial(material, token);
    }
    // Also record in local SQLite repository
    dbRepo.saveMaterial(material);
  },

  async updateMaterial(
    id: string,
    userId: string,
    updates: Partial<StudyMaterial>,
    token?: string
  ): Promise<void> {
    if (isSupabaseConfigured()) {
      await supabaseDbRepo.updateMaterial(id, userId, updates, token);
    }
    const existing = dbRepo.getMaterialById(userId, id);
    if (existing) {
      dbRepo.saveMaterial({ ...existing, ...updates });
    }
  },

  async deleteMaterial(id: string, userId: string, token?: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      await supabaseDbRepo.deleteMaterial(id, userId, token);
    }
    return dbRepo.deleteMaterial(userId, id);
  },

  // ============================================================================
  // Document Chunks & Semantic Vectors
  // ============================================================================
  async getChunks(
    userId: string,
    subjectFilter?: string,
    materialId?: string,
    token?: string
  ): Promise<DocumentChunk[]> {
    if (isSupabaseConfigured()) {
      const chunks = await supabaseDbRepo.getChunks(userId, subjectFilter, materialId, token);
      if (chunks.length > 0) return chunks;
    }
    let localChunks = dbRepo.getChunks(userId, subjectFilter);
    if (materialId) {
      localChunks = localChunks.filter((c) => c.materialId === materialId);
    }
    return localChunks;
  },

  async saveChunks(chunks: DocumentChunk[], userId: string, token?: string): Promise<void> {
    if (isSupabaseConfigured()) {
      await supabaseDbRepo.saveChunks(chunks, userId, token);
    }
    dbRepo.saveChunks(chunks);
  },

  // ============================================================================
  // Topics & Subtopics
  // ============================================================================
  async getTopics(userId: string, subjectFilter?: string, token?: string): Promise<TopicNode[]> {
    if (isSupabaseConfigured()) {
      const topics = await supabaseDbRepo.getTopics(userId, subjectFilter, token);
      if (topics.length > 0) return topics;
    }
    return dbRepo.getTopics(userId, subjectFilter);
  },

  async saveTopic(topic: TopicNode, token?: string): Promise<void> {
    if (isSupabaseConfigured()) {
      await supabaseDbRepo.saveTopics([topic], topic.userId, topic.subject, token);
    }
    dbRepo.saveTopic(topic);
  },

  async saveTopics(
    topics: TopicNode[],
    userId: string,
    subjectFilter?: string,
    token?: string
  ): Promise<void> {
    if (isSupabaseConfigured()) {
      await supabaseDbRepo.saveTopics(topics, userId, subjectFilter, token);
    }
    for (const t of topics) {
      dbRepo.saveTopic(t);
    }
  },

  async deleteTopic(id: string, userId: string, token?: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      await supabaseDbRepo.deleteTopic(id, userId, token);
    }
    return dbRepo.deleteTopic(userId, id);
  },

  // ============================================================================
  // Past Paper Questions
  // ============================================================================
  async getPastPaperQuestions(
    userId: string,
    subjectFilter?: string,
    token?: string
  ): Promise<PastPaperQuestion[]> {
    if (isSupabaseConfigured()) {
      const pp = await supabaseDbRepo.getPastPaperQuestions(userId, subjectFilter, token);
      if (pp.length > 0) return pp;
    }
    return dbRepo.getPastPaperQuestions(userId, subjectFilter);
  },

  async savePastPaperQuestions(
    questions: PastPaperQuestion[],
    userId: string,
    token?: string
  ): Promise<void> {
    if (isSupabaseConfigured()) {
      await supabaseDbRepo.savePastPaperQuestions(questions, userId, token);
    }
    dbRepo.savePastPaperQuestions(questions);
  },

  async updatePastPaperQuestion(
    userId: string,
    id: string,
    updates: Partial<PastPaperQuestion>,
    token?: string
  ): Promise<PastPaperQuestion | null> {
    if (isSupabaseConfigured()) {
      await supabaseDbRepo.updatePastPaperQuestion(userId, id, updates, token);
    }
    return dbRepo.updatePastPaperQuestion(userId, id, updates);
  },

  async deletePastPaperQuestion(userId: string, id: string, token?: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      await supabaseDbRepo.deletePastPaperQuestion(userId, id, token);
    }
    return dbRepo.deletePastPaperQuestion(userId, id);
  },

  // ============================================================================
  // Diagnostic Quizzes & Attempts
  // ============================================================================
  async getQuizzes(
    userId: string,
    subjectFilter?: string,
    token?: string
  ): Promise<DiagnosticQuiz[]> {
    if (isSupabaseConfigured()) {
      const quizzes = await supabaseDbRepo.getQuizzes(userId, subjectFilter, token);
      if (quizzes.length > 0) return quizzes;
    }
    return dbRepo.getQuizzes(userId, subjectFilter);
  },

  async getQuizById(id: string, userId: string, token?: string): Promise<DiagnosticQuiz | null> {
    if (isSupabaseConfigured()) {
      const quiz = await supabaseDbRepo.getQuizById(id, userId, token);
      if (quiz) return quiz;
    }
    return dbRepo.getQuizById(userId, id);
  },

  async saveQuiz(quiz: DiagnosticQuiz, token?: string): Promise<void> {
    if (isSupabaseConfigured()) {
      await supabaseDbRepo.saveQuiz(quiz, token);
    }
    dbRepo.saveQuiz(quiz);
  },

  // ============================================================================
  // Gap Analysis Reports
  // ============================================================================
  async getGapDiagnoses(
    userId: string,
    subjectFilter?: string,
    token?: string
  ): Promise<TopicGapDiagnosis[]> {
    if (isSupabaseConfigured()) {
      const gaps = await supabaseDbRepo.getGapReports(userId, subjectFilter, token);
      if (gaps.length > 0) return gaps;
    }
    return dbRepo.getGapDiagnoses(userId, subjectFilter);
  },

  async saveGapDiagnoses(
    diagnoses: TopicGapDiagnosis[],
    userId: string,
    subjectFilter?: string,
    token?: string
  ): Promise<void> {
    if (isSupabaseConfigured()) {
      await supabaseDbRepo.saveGapReports(diagnoses, userId, subjectFilter, token);
    }
    dbRepo.saveGapDiagnoses(diagnoses, userId, subjectFilter);
  },

  // ============================================================================
  // Revision Plans & Tasks
  // ============================================================================
  async getRevisionPlans(
    userId: string,
    subjectFilter?: string,
    token?: string
  ): Promise<RevisionPlan[]> {
    if (isSupabaseConfigured()) {
      const plans = await supabaseDbRepo.getRevisionPlans(userId, subjectFilter, token);
      if (plans.length > 0) return plans;
    }
    return dbRepo.getRevisionPlans(userId);
  },

  async saveRevisionPlan(plan: RevisionPlan, token?: string): Promise<void> {
    if (isSupabaseConfigured()) {
      await supabaseDbRepo.saveRevisionPlan(plan, token);
    }
    dbRepo.saveRevisionPlan(plan);
  },

  async updateRevisionTaskStatus(
    userId: string,
    taskId: string,
    completed: boolean,
    token?: string
  ): Promise<RevisionPlan | null> {
    if (isSupabaseConfigured()) {
      const plans = await this.getRevisionPlans(userId, undefined, token);
      const activePlan = plans[0];
      if (activePlan) {
        await supabaseDbRepo.updateRevisionTaskCompletion(taskId, activePlan.id, userId, completed, token);
      }
    }
    return dbRepo.updateRevisionTaskStatus(userId, taskId, completed);
  },

  // ============================================================================
  // File Storage via Supabase
  // ============================================================================
  async uploadStudyMaterialFile(
    userId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
    token?: string
  ): Promise<{ path: string } | null> {
    if (isSupabaseConfigured()) {
      try {
        return await supabaseStorageService.uploadMaterial(userId, fileName, buffer, mimeType, token);
      } catch (err: any) {
        console.warn('Supabase storage upload warning:', err.message);
      }
    }
    return null;
  },

  // ============================================================================
  // AI Study Assistant Conversation Memory (Student Scoped)
  // ============================================================================
  async getChatMessages(userId: string, token?: string): Promise<ChatMessage[]> {
    if (isSupabaseConfigured()) {
      const msgs = await supabaseDbRepo.getChatMessages(userId, token);
      if (msgs.length > 0) return msgs;
    }
    return dbRepo.getChatMessages(userId);
  },

  async saveChatMessage(message: ChatMessage, userId: string, token?: string): Promise<void> {
    if (isSupabaseConfigured()) {
      await supabaseDbRepo.saveChatMessage(message, userId, token);
    }
    dbRepo.saveChatMessage(userId, message);
  },

  async clearChatMessages(userId: string, token?: string): Promise<void> {
    if (isSupabaseConfigured()) {
      await supabaseDbRepo.clearChatMessages(userId, token);
    }
    dbRepo.clearChatMessages(userId);
  },
};
