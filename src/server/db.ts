import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  ChatMessage,
  DiagnosticQuiz,
  DocumentChunk,
  PastPaperQuestion,
  RevisionPlan,
  RevisionTask,
  StudyMaterial,
  TopicGapDiagnosis,
  TopicNode,
  User,
} from '../types';
import {
  DEMO_USER_ID,
  SAMPLE_CHUNKS,
  SAMPLE_GAP_DIAGNOSES,
  SAMPLE_MATERIALS,
  SAMPLE_PAST_PAPER_QUESTIONS,
  SAMPLE_QUIZZES,
  SAMPLE_REVISION_PLAN,
  SAMPLE_TOPICS,
} from '../domain/seedData';
import { sanitizeDashes } from '../domain/engine';

const require = createRequire(import.meta.url);

function createDatabaseConnection(resolvedDbPath: string) {
  const nativeBinaryPath = path.resolve(
    process.cwd(),
    'node_modules/better-sqlite3/build/Release/better_sqlite3.node'
  );
  if (fs.existsSync(nativeBinaryPath)) {
    try {
      const BetterSqlite = require('better-sqlite3');
      const db = new BetterSqlite(resolvedDbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 5000');
      return db;
    } catch {
      // Fall through to node:sqlite
    }
  }

  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(resolvedDbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  return {
    exec: (sql: string) => db.exec(sql),
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      return {
        get: (...params: any[]) => stmt.get(...params),
        all: (...params: any[]) => stmt.all(...params),
        run: (...params: any[]) => stmt.run(...params),
      };
    },
    transaction: <T extends (...args: any[]) => any>(fn: T): T => {
      return ((...args: any[]) => {
        db.exec('BEGIN IMMEDIATE');
        try {
          const res = fn(...args);
          db.exec('COMMIT');
          return res;
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
      }) as T;
    },
  };
}

const dbPath = path.resolve(process.cwd(), 'gapfinder.sqlite');
const sqlite = createDatabaseConnection(dbPath);

export function hashPassword(password: string, salt?: string): string {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return `${actualSalt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derived, 'hex'));
}

export function initDatabase(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      target_exam TEXT DEFAULT 'AP / National Biology Examination',
      exam_date TEXT DEFAULT '2026-11-18',
      daily_hours REAL DEFAULT 2.0,
      is_demo INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      subject TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      page_count INTEGER NOT NULL,
      chunk_count INTEGER NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      is_sample INTEGER DEFAULT 0,
      uploaded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      material_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      document_name TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      chapter TEXT NOT NULL,
      section TEXT NOT NULL,
      topic TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding_json TEXT NOT NULL,
      chunk_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      unit_name TEXT NOT NULL,
      chapter_name TEXT NOT NULL,
      topic_name TEXT NOT NULL,
      subtopics_json TEXT NOT NULL,
      concepts_json TEXT NOT NULL,
      prerequisites_json TEXT NOT NULL,
      syllabus_weight INTEGER NOT NULL,
      past_paper_frequency INTEGER NOT NULL,
      is_sample INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS past_paper_questions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      material_id TEXT NOT NULL,
      source_document TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      subtopic TEXT NOT NULL,
      question_text TEXT NOT NULL,
      year TEXT,
      marks INTEGER,
      question_type TEXT NOT NULL,
      needs_review INTEGER DEFAULT 0,
      mapping_confidence TEXT DEFAULT 'High',
      validation_evidence TEXT,
      is_sample INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      selected_topics_json TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      time_limit_minutes INTEGER NOT NULL,
      status TEXT NOT NULL,
      questions_json TEXT NOT NULL,
      answers_json TEXT NOT NULL,
      total_score REAL NOT NULL,
      max_score REAL NOT NULL,
      accuracy_percent INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL,
      is_sample INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS gap_diagnoses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      topic_name TEXT NOT NULL,
      unit_name TEXT NOT NULL,
      status TEXT NOT NULL,
      accuracy_percent INTEGER NOT NULL,
      questions_attempted INTEGER NOT NULL,
      correct_count INTEGER NOT NULL,
      incorrect_count INTEGER NOT NULL,
      confidence_level TEXT NOT NULL,
      repeated_mistakes_count INTEGER NOT NULL,
      trend_delta INTEGER NOT NULL,
      previous_status TEXT,
      common_mistakes_reason TEXT NOT NULL,
      recommended_action TEXT NOT NULL,
      past_paper_frequency INTEGER NOT NULL,
      priority_score INTEGER NOT NULL,
      citations_json TEXT NOT NULL,
      is_sample INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS revision_plans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      exam_date TEXT NOT NULL,
      days_available INTEGER NOT NULL,
      daily_hours REAL NOT NULL,
      priority_subjects_json TEXT NOT NULL,
      version INTEGER NOT NULL,
      change_summary_json TEXT NOT NULL,
      tasks_json TEXT NOT NULL,
      is_sample INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      citations_json TEXT NOT NULL DEFAULT '[]',
      grounded INTEGER NOT NULL DEFAULT 1,
      intent TEXT,
      debug_telemetry_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id, created_at);
  `);

  try {
    sqlite.prepare('ALTER TABLE past_paper_questions ADD COLUMN needs_review INTEGER DEFAULT 0').run();
  } catch {}
  try {
    sqlite.prepare("ALTER TABLE past_paper_questions ADD COLUMN mapping_confidence TEXT DEFAULT 'High'").run();
  } catch {}
  try {
    sqlite.prepare('ALTER TABLE past_paper_questions ADD COLUMN validation_evidence TEXT').run();
  } catch {}

  seedDemoAccountIfNeeded();
}

export function seedDemoAccountIfNeeded(forceReset: boolean = false): void {
  const existing = sqlite
    .prepare('SELECT id FROM users WHERE email = ?')
    .get('demo@gapfinder.ai') as { id: string } | undefined;

  if (existing && !forceReset) {
    return;
  }

  const tx = sqlite.transaction(() => {
    if (forceReset) {
      sqlite.prepare('DELETE FROM materials WHERE user_id = ?').run(DEMO_USER_ID);
      sqlite.prepare('DELETE FROM chunks WHERE user_id = ?').run(DEMO_USER_ID);
      sqlite.prepare('DELETE FROM topics WHERE user_id = ?').run(DEMO_USER_ID);
      sqlite.prepare('DELETE FROM past_paper_questions WHERE user_id = ?').run(DEMO_USER_ID);
      sqlite.prepare('DELETE FROM quizzes WHERE user_id = ?').run(DEMO_USER_ID);
      sqlite.prepare('DELETE FROM gap_diagnoses WHERE user_id = ?').run(DEMO_USER_ID);
      sqlite.prepare('DELETE FROM revision_plans WHERE user_id = ?').run(DEMO_USER_ID);
    }

    if (!existing) {
      sqlite
        .prepare(
          `INSERT INTO users (id, name, email, password_hash, target_exam, exam_date, daily_hours, is_demo, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          DEMO_USER_ID,
          'Aarav Sharma (Demo Student)',
          'demo@gapfinder.ai',
          hashPassword('Demo@123'),
          'National Advanced Biology Examination',
          '2026-11-18',
          2.0,
          1,
          '2026-11-05T09:00:00.000Z'
        );
    }

    const insertMaterial = sqlite.prepare(`
      INSERT OR REPLACE INTO materials
      (id, user_id, title, file_name, subject, doc_type, file_size, page_count, chunk_count, status, error_message, is_sample, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const m of SAMPLE_MATERIALS) {
      insertMaterial.run(
        m.id,
        m.userId,
        m.title,
        m.fileName,
        m.subject,
        m.docType,
        m.fileSize,
        m.pageCount,
        m.chunkCount,
        m.status,
        m.errorMessage || null,
        m.isSample ? 1 : 0,
        m.uploadedAt
      );
    }

    const insertChunk = sqlite.prepare(`
      INSERT OR REPLACE INTO chunks
      (id, material_id, user_id, subject, document_name, page_number, chapter, section, topic, content, embedding_json, chunk_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of SAMPLE_CHUNKS) {
      insertChunk.run(
        c.id,
        c.materialId,
        c.userId,
        c.subject,
        c.documentName,
        c.pageNumber,
        c.chapter,
        c.section,
        c.topic,
        c.content,
        JSON.stringify(c.embedding),
        c.chunkIndex
      );
    }

    const insertTopic = sqlite.prepare(`
      INSERT OR REPLACE INTO topics
      (id, user_id, subject, unit_name, chapter_name, topic_name, subtopics_json, concepts_json, prerequisites_json, syllabus_weight, past_paper_frequency, is_sample)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const t of SAMPLE_TOPICS) {
      insertTopic.run(
        t.id,
        t.userId,
        t.subject,
        t.unitName,
        t.chapterName,
        t.topicName,
        JSON.stringify(t.subtopics),
        JSON.stringify(t.importantConcepts),
        JSON.stringify(t.prerequisites),
        t.syllabusWeight,
        t.pastPaperFrequency,
        t.isSample ? 1 : 0
      );
    }

    const insertPP = sqlite.prepare(`
      INSERT OR REPLACE INTO past_paper_questions
      (id, user_id, material_id, source_document, page_number, subject, topic, subtopic, question_text, year, marks, question_type, is_sample)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const q of SAMPLE_PAST_PAPER_QUESTIONS) {
      insertPP.run(
        q.id,
        q.userId,
        q.materialId,
        q.sourceDocument,
        q.pageNumber,
        q.subject,
        q.topic,
        q.subtopic,
        q.questionText,
        q.year,
        q.marks,
        q.questionType,
        q.isSample ? 1 : 0
      );
    }

    const insertQuiz = sqlite.prepare(`
      INSERT OR REPLACE INTO quizzes
      (id, user_id, title, subject, selected_topics_json, difficulty, time_limit_minutes, status, questions_json, answers_json, total_score, max_score, accuracy_percent, duration_seconds, is_sample, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const qz of SAMPLE_QUIZZES) {
      insertQuiz.run(
        qz.id,
        qz.userId,
        qz.title,
        qz.subject,
        JSON.stringify(qz.selectedTopics),
        qz.difficulty,
        qz.timeLimitMinutes,
        qz.status,
        JSON.stringify(qz.questions),
        JSON.stringify(qz.answers),
        qz.totalScore,
        qz.maxScore,
        qz.accuracyPercent,
        qz.durationSeconds,
        qz.isSample ? 1 : 0,
        qz.createdAt,
        qz.completedAt || null
      );
    }

    const insertGap = sqlite.prepare(`
      INSERT OR REPLACE INTO gap_diagnoses
      (id, user_id, subject, topic_name, unit_name, status, accuracy_percent, questions_attempted, correct_count, incorrect_count, confidence_level, repeated_mistakes_count, trend_delta, previous_status, common_mistakes_reason, recommended_action, past_paper_frequency, priority_score, citations_json, is_sample, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const g of SAMPLE_GAP_DIAGNOSES) {
      insertGap.run(
        g.id,
        g.userId,
        g.subject,
        g.topicName,
        g.unitName,
        g.status,
        g.accuracyPercent,
        g.questionsAttempted,
        g.correctCount,
        g.incorrectCount,
        g.confidenceLevel,
        g.repeatedMistakesCount,
        g.trendDelta,
        g.previousStatus || null,
        g.commonMistakesReason,
        g.recommendedAction,
        g.pastPaperFrequency,
        g.priorityScore,
        JSON.stringify(g.citations),
        g.isSample ? 1 : 0,
        g.updatedAt
      );
    }

    const insertPlan = sqlite.prepare(`
      INSERT OR REPLACE INTO revision_plans
      (id, user_id, subject, exam_date, days_available, daily_hours, priority_subjects_json, version, change_summary_json, tasks_json, is_sample, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertPlan.run(
      SAMPLE_REVISION_PLAN.id,
      SAMPLE_REVISION_PLAN.userId,
      SAMPLE_REVISION_PLAN.subject,
      SAMPLE_REVISION_PLAN.examDate,
      SAMPLE_REVISION_PLAN.daysAvailable,
      SAMPLE_REVISION_PLAN.dailyHours,
      JSON.stringify(SAMPLE_REVISION_PLAN.prioritySubjects),
      SAMPLE_REVISION_PLAN.version,
      JSON.stringify(SAMPLE_REVISION_PLAN.changeSummary),
      JSON.stringify(SAMPLE_REVISION_PLAN.tasks),
      SAMPLE_REVISION_PLAN.isSample ? 1 : 0,
      SAMPLE_REVISION_PLAN.createdAt
    );
  });

  tx();
}

export const dbRepo = {
  createUser(name: string, email: string, password: string): User {
    const id = `user_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const cleanEmail = email.trim().toLowerCase();
    sqlite
      .prepare(
        `INSERT INTO users (id, name, email, password_hash, target_exam, exam_date, daily_hours, is_demo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
      )
      .run(
        id,
        sanitizeDashes(name.trim()),
        cleanEmail,
        hashPassword(password),
        'General University Examination',
        '2026-11-25',
        2.0,
        now
      );
    return this.getUserById(id)!;
  },

  getUserByEmail(email: string): (User & { passwordHash: string }) | null {
    const row = sqlite
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email.trim().toLowerCase()) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.password_hash,
      targetExam: row.target_exam,
      examDate: row.exam_date,
      dailyHours: row.daily_hours,
      isDemo: Boolean(row.is_demo),
      createdAt: row.created_at,
    };
  },

  getUserById(id: string): User | null {
    const row = sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      targetExam: row.target_exam,
      examDate: row.exam_date,
      dailyHours: row.daily_hours,
      isDemo: Boolean(row.is_demo),
      createdAt: row.created_at,
    };
  },

  updateUserProfile(userId: string, updates: { name?: string; targetExam?: string; examDate?: string; dailyHours?: number }): User | null {
    const current = this.getUserById(userId);
    if (!current) return null;
    sqlite
      .prepare(
        `UPDATE users SET name = ?, target_exam = ?, exam_date = ?, daily_hours = ? WHERE id = ?`
      )
      .run(
        sanitizeDashes(updates.name ?? current.name),
        sanitizeDashes(updates.targetExam ?? current.targetExam ?? ''),
        updates.examDate ?? current.examDate ?? '2026-11-18',
        updates.dailyHours ?? current.dailyHours ?? 2.0,
        userId
      );
    return this.getUserById(userId);
  },

  createSession(userId: string): string {
    const token = `gf_sess_${crypto.randomBytes(24).toString('hex')}`;
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    sqlite
      .prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
      .run(token, userId, expires);
    return token;
  },

  getUserByToken(token: string): User | null {
    const row = sqlite
      .prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?')
      .get(token) as { user_id: string; expires_at: string } | undefined;
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
      sqlite.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      return null;
    }
    return this.getUserById(row.user_id);
  },

  deleteSession(token: string): void {
    sqlite.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  },

  // Materials
  getMaterials(userId: string): StudyMaterial[] {
    const rows = sqlite
      .prepare('SELECT * FROM materials WHERE user_id = ? ORDER BY uploaded_at DESC')
      .all(userId) as any[];
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      title: r.title,
      fileName: r.file_name,
      subject: r.subject,
      docType: r.doc_type,
      fileSize: r.file_size,
      pageCount: r.page_count,
      chunkCount: r.chunk_count,
      status: r.status,
      errorMessage: r.error_message || undefined,
      isSample: Boolean(r.is_sample),
      uploadedAt: r.uploaded_at,
    }));
  },

  getMaterialById(userId: string, materialId: string): StudyMaterial | null {
    const r = sqlite
      .prepare('SELECT * FROM materials WHERE id = ? AND user_id = ?')
      .get(materialId, userId) as any;
    if (!r) return null;
    return {
      id: r.id,
      userId: r.user_id,
      title: r.title,
      fileName: r.file_name,
      subject: r.subject,
      docType: r.doc_type,
      fileSize: r.file_size,
      pageCount: r.page_count,
      chunkCount: r.chunk_count,
      status: r.status,
      errorMessage: r.error_message || undefined,
      isSample: Boolean(r.is_sample),
      uploadedAt: r.uploaded_at,
    };
  },

  saveMaterial(material: StudyMaterial): void {
    sqlite
      .prepare(
        `INSERT OR REPLACE INTO materials
         (id, user_id, title, file_name, subject, doc_type, file_size, page_count, chunk_count, status, error_message, is_sample, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        material.id,
        material.userId,
        sanitizeDashes(material.title),
        sanitizeDashes(material.fileName),
        sanitizeDashes(material.subject),
        material.docType,
        material.fileSize,
        material.pageCount,
        material.chunkCount,
        material.status,
        material.errorMessage ? sanitizeDashes(material.errorMessage) : null,
        material.isSample ? 1 : 0,
        material.uploadedAt
      );
  },

  deleteMaterial(userId: string, materialId: string): boolean {
    const info = sqlite
      .prepare('DELETE FROM materials WHERE id = ? AND user_id = ?')
      .run(materialId, userId);
    sqlite.prepare('DELETE FROM chunks WHERE material_id = ? AND user_id = ?').run(materialId, userId);
    sqlite
      .prepare('DELETE FROM past_paper_questions WHERE material_id = ? AND user_id = ?')
      .run(materialId, userId);
    return info.changes > 0;
  },

  // Chunks
  saveChunks(chunks: DocumentChunk[]): void {
    const stmt = sqlite.prepare(`
      INSERT OR REPLACE INTO chunks
      (id, material_id, user_id, subject, document_name, page_number, chapter, section, topic, content, embedding_json, chunk_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = sqlite.transaction((items: DocumentChunk[]) => {
      for (const c of items) {
        stmt.run(
          c.id,
          c.materialId,
          c.userId,
          sanitizeDashes(c.subject),
          sanitizeDashes(c.documentName),
          c.pageNumber,
          sanitizeDashes(c.chapter),
          sanitizeDashes(c.section),
          sanitizeDashes(c.topic),
          sanitizeDashes(c.content),
          JSON.stringify(c.embedding),
          c.chunkIndex
        );
      }
    });
    tx(chunks);
  },

  getChunks(userId: string, subject?: string): DocumentChunk[] {
    const rows = (
      subject
        ? sqlite
            .prepare(
              'SELECT * FROM chunks WHERE user_id = ? AND LOWER(subject) = LOWER(?) ORDER BY material_id, chunk_index ASC'
            )
            .all(userId, subject)
        : sqlite
            .prepare('SELECT * FROM chunks WHERE user_id = ? ORDER BY material_id, chunk_index ASC')
            .all(userId)
    ) as any[];

    return rows.map((r) => ({
      id: r.id,
      materialId: r.material_id,
      userId: r.user_id,
      subject: r.subject,
      documentName: r.document_name,
      pageNumber: r.page_number,
      chapter: r.chapter,
      section: r.section,
      topic: r.topic,
      content: r.content,
      embedding: JSON.parse(r.embedding_json || '[]'),
      chunkIndex: r.chunk_index,
    }));
  },

  // Topics
  getTopics(userId: string, subject?: string): TopicNode[] {
    const rows = (
      subject
        ? sqlite
            .prepare('SELECT * FROM topics WHERE user_id = ? AND LOWER(subject) = LOWER(?)')
            .all(userId, subject)
        : sqlite.prepare('SELECT * FROM topics WHERE user_id = ?').all(userId)
    ) as any[];
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      subject: r.subject,
      unitName: r.unit_name,
      chapterName: r.chapter_name,
      topicName: r.topic_name,
      subtopics: JSON.parse(r.subtopics_json || '[]'),
      importantConcepts: JSON.parse(r.concepts_json || '[]'),
      prerequisites: JSON.parse(r.prerequisites_json || '[]'),
      syllabusWeight: r.syllabus_weight,
      pastPaperFrequency: r.past_paper_frequency,
      isSample: Boolean(r.is_sample),
    }));
  },

  saveTopic(topic: TopicNode): void {
    sqlite
      .prepare(
        `INSERT OR REPLACE INTO topics
         (id, user_id, subject, unit_name, chapter_name, topic_name, subtopics_json, concepts_json, prerequisites_json, syllabus_weight, past_paper_frequency, is_sample)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        topic.id,
        topic.userId,
        sanitizeDashes(topic.subject),
        sanitizeDashes(topic.unitName),
        sanitizeDashes(topic.chapterName),
        sanitizeDashes(topic.topicName),
        JSON.stringify(topic.subtopics.map(sanitizeDashes)),
        JSON.stringify(topic.importantConcepts.map(sanitizeDashes)),
        JSON.stringify(topic.prerequisites.map(sanitizeDashes)),
        topic.syllabusWeight,
        topic.pastPaperFrequency,
        topic.isSample ? 1 : 0
      );
  },

  deleteTopic(userId: string, topicId: string): boolean {
    const topic = sqlite
      .prepare('SELECT topic_name FROM topics WHERE id = ? AND user_id = ?')
      .get(topicId, userId) as { topic_name: string } | undefined;
    const info = sqlite
      .prepare('DELETE FROM topics WHERE id = ? AND user_id = ?')
      .run(topicId, userId);
    if (topic) {
      sqlite
        .prepare('DELETE FROM gap_diagnoses WHERE user_id = ? AND LOWER(topic_name) = LOWER(?)')
        .run(userId, topic.topic_name);
    }
    return info.changes > 0;
  },

  // Past Paper Questions
  getPastPaperQuestions(userId: string, subject?: string): PastPaperQuestion[] {
    const rows = (
      subject
        ? sqlite
            .prepare(
              'SELECT * FROM past_paper_questions WHERE user_id = ? AND LOWER(subject) = LOWER(?) ORDER BY year DESC, page_number ASC'
            )
            .all(userId, subject)
        : sqlite
            .prepare('SELECT * FROM past_paper_questions WHERE user_id = ? ORDER BY year DESC, page_number ASC')
            .all(userId)
    ) as any[];
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      materialId: r.material_id,
      sourceDocument: r.source_document,
      pageNumber: r.page_number,
      subject: r.subject,
      topic: r.topic,
      subtopic: r.subtopic,
      questionText: r.question_text,
      year: r.year,
      marks: r.marks,
      questionType: r.question_type,
      needsReview: Boolean(r.needs_review),
      mappingConfidence: r.mapping_confidence || (r.needs_review ? 'Uncertain' : 'High'),
      validationEvidence: r.validation_evidence || undefined,
      isSample: Boolean(r.is_sample),
    }));
  },

  savePastPaperQuestions(questions: PastPaperQuestion[]): void {
    const stmt = sqlite.prepare(`
      INSERT OR REPLACE INTO past_paper_questions
      (id, user_id, material_id, source_document, page_number, subject, topic, subtopic, question_text, year, marks, question_type, needs_review, mapping_confidence, validation_evidence, is_sample)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = sqlite.transaction((items: PastPaperQuestion[]) => {
      for (const q of items) {
        stmt.run(
          q.id,
          q.userId,
          q.materialId,
          sanitizeDashes(q.sourceDocument),
          q.pageNumber,
          sanitizeDashes(q.subject),
          sanitizeDashes(q.topic),
          sanitizeDashes(q.subtopic),
          sanitizeDashes(q.questionText),
          q.year,
          q.marks,
          q.questionType,
          q.needsReview ? 1 : 0,
          q.mappingConfidence || 'High',
          q.validationEvidence || null,
          q.isSample ? 1 : 0
        );
      }
    });
    tx(questions);
  },

  updatePastPaperQuestion(
    userId: string,
    id: string,
    updates: Partial<PastPaperQuestion>
  ): PastPaperQuestion | null {
    const existing = sqlite
      .prepare('SELECT * FROM past_paper_questions WHERE id = ? AND user_id = ?')
      .get(id, userId) as any;
    if (!existing) return null;

    const merged: PastPaperQuestion = {
      id: existing.id,
      userId: existing.user_id,
      materialId: existing.material_id,
      sourceDocument: updates.sourceDocument ?? existing.source_document,
      pageNumber: updates.pageNumber ?? existing.page_number,
      subject: updates.subject ?? existing.subject,
      topic: updates.topic ?? existing.topic,
      subtopic: updates.subtopic ?? existing.subtopic,
      questionText: updates.questionText ?? existing.question_text,
      year: updates.year !== undefined ? updates.year : existing.year,
      marks: updates.marks !== undefined ? updates.marks : existing.marks,
      questionType: updates.questionType ?? existing.question_type,
      needsReview: updates.needsReview !== undefined ? updates.needsReview : Boolean(existing.needs_review),
      mappingConfidence: updates.mappingConfidence ?? existing.mapping_confidence ?? 'High',
      validationEvidence: updates.validationEvidence ?? existing.validation_evidence,
      isSample: Boolean(existing.is_sample),
    };

    sqlite
      .prepare(`
        UPDATE past_paper_questions SET
          topic = ?,
          subtopic = ?,
          question_text = ?,
          year = ?,
          marks = ?,
          question_type = ?,
          needs_review = ?,
          mapping_confidence = ?,
          validation_evidence = ?
        WHERE id = ? AND user_id = ?
      `)
      .run(
        sanitizeDashes(merged.topic),
        sanitizeDashes(merged.subtopic),
        sanitizeDashes(merged.questionText),
        merged.year,
        merged.marks,
        merged.questionType,
        merged.needsReview ? 1 : 0,
        merged.mappingConfidence || 'High',
        merged.validationEvidence || null,
        id,
        userId
      );

    return merged;
  },

  deletePastPaperQuestion(userId: string, id: string): boolean {
    const info = sqlite
      .prepare('DELETE FROM past_paper_questions WHERE id = ? AND user_id = ?')
      .run(id, userId);
    return info.changes > 0;
  },

  // Quizzes
  getQuizzes(userId: string, subject?: string): DiagnosticQuiz[] {
    const rows = (
      subject
        ? sqlite
            .prepare(
              'SELECT * FROM quizzes WHERE user_id = ? AND LOWER(subject) = LOWER(?) ORDER BY created_at ASC'
            )
            .all(userId, subject)
        : sqlite.prepare('SELECT * FROM quizzes WHERE user_id = ? ORDER BY created_at ASC').all(userId)
    ) as any[];
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      title: r.title,
      subject: r.subject,
      selectedTopics: JSON.parse(r.selected_topics_json || '[]'),
      difficulty: r.difficulty,
      timeLimitMinutes: r.time_limit_minutes,
      status: r.status,
      questions: JSON.parse(r.questions_json || '[]'),
      answers: JSON.parse(r.answers_json || '[]'),
      totalScore: r.total_score,
      maxScore: r.max_score,
      accuracyPercent: r.accuracy_percent,
      durationSeconds: r.duration_seconds,
      isSample: Boolean(r.is_sample),
      createdAt: r.created_at,
      completedAt: r.completed_at || undefined,
    }));
  },

  getQuizById(userId: string, quizId: string): DiagnosticQuiz | null {
    const r = sqlite
      .prepare('SELECT * FROM quizzes WHERE id = ? AND user_id = ?')
      .get(quizId, userId) as any;
    if (!r) return null;
    return {
      id: r.id,
      userId: r.user_id,
      title: r.title,
      subject: r.subject,
      selectedTopics: JSON.parse(r.selected_topics_json || '[]'),
      difficulty: r.difficulty,
      timeLimitMinutes: r.time_limit_minutes,
      status: r.status,
      questions: JSON.parse(r.questions_json || '[]'),
      answers: JSON.parse(r.answers_json || '[]'),
      totalScore: r.total_score,
      maxScore: r.max_score,
      accuracyPercent: r.accuracy_percent,
      durationSeconds: r.duration_seconds,
      isSample: Boolean(r.is_sample),
      createdAt: r.created_at,
      completedAt: r.completed_at || undefined,
    };
  },

  saveQuiz(quiz: DiagnosticQuiz): void {
    sqlite
      .prepare(
        `INSERT OR REPLACE INTO quizzes
         (id, user_id, title, subject, selected_topics_json, difficulty, time_limit_minutes, status, questions_json, answers_json, total_score, max_score, accuracy_percent, duration_seconds, is_sample, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        quiz.id,
        quiz.userId,
        sanitizeDashes(quiz.title),
        sanitizeDashes(quiz.subject),
        JSON.stringify(quiz.selectedTopics),
        quiz.difficulty,
        quiz.timeLimitMinutes,
        quiz.status,
        sanitizeDashes(JSON.stringify(quiz.questions)),
        sanitizeDashes(JSON.stringify(quiz.answers)),
        quiz.totalScore,
        quiz.maxScore,
        quiz.accuracyPercent,
        quiz.durationSeconds,
        quiz.isSample ? 1 : 0,
        quiz.createdAt,
        quiz.completedAt || null
      );
  },

  // Gap Diagnoses
  getGapDiagnoses(userId: string, subject?: string): TopicGapDiagnosis[] {
    const rows = (
      subject
        ? sqlite
            .prepare(
              'SELECT * FROM gap_diagnoses WHERE user_id = ? AND LOWER(subject) = LOWER(?) ORDER BY priority_score DESC'
            )
            .all(userId, subject)
        : sqlite
            .prepare('SELECT * FROM gap_diagnoses WHERE user_id = ? ORDER BY priority_score DESC')
            .all(userId)
    ) as any[];
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      subject: r.subject,
      topicName: r.topic_name,
      unitName: r.unit_name,
      status: r.status,
      accuracyPercent: r.accuracy_percent,
      questionsAttempted: r.questions_attempted,
      correctCount: r.correct_count,
      incorrectCount: r.incorrect_count,
      confidenceLevel: r.confidence_level,
      repeatedMistakesCount: r.repeated_mistakes_count,
      trendDelta: r.trend_delta,
      previousStatus: r.previous_status || undefined,
      commonMistakesReason: r.common_mistakes_reason,
      recommendedAction: r.recommended_action,
      pastPaperFrequency: r.past_paper_frequency,
      priorityScore: r.priority_score,
      citations: JSON.parse(r.citations_json || '[]'),
      isSample: Boolean(r.is_sample),
      updatedAt: r.updated_at,
    }));
  },

  saveGapDiagnoses(diagnoses: TopicGapDiagnosis[], userId?: string, subject?: string): void {
    const targetUserId = userId || (diagnoses.length > 0 ? diagnoses[0].userId : undefined);
    const stmt = sqlite.prepare(`
      INSERT OR REPLACE INTO gap_diagnoses
      (id, user_id, subject, topic_name, unit_name, status, accuracy_percent, questions_attempted, correct_count, incorrect_count, confidence_level, repeated_mistakes_count, trend_delta, previous_status, common_mistakes_reason, recommended_action, past_paper_frequency, priority_score, citations_json, is_sample, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = sqlite.transaction((items: TopicGapDiagnosis[]) => {
      if (targetUserId) {
        if (subject) {
          sqlite
            .prepare('DELETE FROM gap_diagnoses WHERE user_id = ? AND LOWER(subject) = LOWER(?)')
            .run(targetUserId, subject);
        } else {
          sqlite.prepare('DELETE FROM gap_diagnoses WHERE user_id = ?').run(targetUserId);
        }
      }
      for (const g of items) {
        stmt.run(
          g.id,
          g.userId,
          sanitizeDashes(g.subject),
          sanitizeDashes(g.topicName),
          sanitizeDashes(g.unitName),
          g.status,
          g.accuracyPercent,
          g.questionsAttempted,
          g.correctCount,
          g.incorrectCount,
          g.confidenceLevel,
          g.repeatedMistakesCount,
          g.trendDelta,
          g.previousStatus || null,
          sanitizeDashes(g.commonMistakesReason),
          sanitizeDashes(g.recommendedAction),
          g.pastPaperFrequency,
          g.priorityScore,
          sanitizeDashes(JSON.stringify(g.citations)),
          g.isSample ? 1 : 0,
          g.updatedAt
        );
      }
    });
    tx(diagnoses);
  },

  // Revision Plans
  getRevisionPlans(userId: string): RevisionPlan[] {
    const rows = sqlite
      .prepare('SELECT * FROM revision_plans WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as any[];
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      subject: r.subject,
      examDate: r.exam_date,
      daysAvailable: r.days_available,
      dailyHours: r.daily_hours,
      prioritySubjects: JSON.parse(r.priority_subjects_json || '[]'),
      version: r.version,
      changeSummary: JSON.parse(r.change_summary_json || '[]'),
      tasks: JSON.parse(r.tasks_json || '[]'),
      isSample: Boolean(r.is_sample),
      createdAt: r.created_at,
    }));
  },

  saveRevisionPlan(plan: RevisionPlan): void {
    sqlite
      .prepare(
        `INSERT OR REPLACE INTO revision_plans
         (id, user_id, subject, exam_date, days_available, daily_hours, priority_subjects_json, version, change_summary_json, tasks_json, is_sample, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        plan.id,
        plan.userId,
        sanitizeDashes(plan.subject),
        plan.examDate,
        plan.daysAvailable,
        plan.dailyHours,
        JSON.stringify(plan.prioritySubjects),
        plan.version,
        sanitizeDashes(JSON.stringify(plan.changeSummary)),
        sanitizeDashes(JSON.stringify(plan.tasks)),
        plan.isSample ? 1 : 0,
        plan.createdAt
      );
  },

  updateRevisionTaskStatus(userId: string, taskId: string, completed: boolean): RevisionPlan | null {
    const plans = this.getRevisionPlans(userId);
    for (const plan of plans) {
      const idx = plan.tasks.findIndex((t: RevisionTask) => t.id === taskId);
      if (idx !== -1) {
        plan.tasks[idx].completed = completed;
        this.saveRevisionPlan(plan);
        return plan;
      }
    }
    return null;
  },

  getChatMessages(userId: string): ChatMessage[] {
    const rows = sqlite
      .prepare('SELECT * FROM chat_messages WHERE user_id = ? ORDER BY created_at ASC')
      .all(userId) as any[];

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      role: r.role as 'user' | 'assistant',
      content: sanitizeDashes(r.content),
      citations: JSON.parse(r.citations_json || '[]'),
      grounded: Boolean(r.grounded),
      intent: r.intent || undefined,
      debugTelemetry: r.debug_telemetry_json ? JSON.parse(r.debug_telemetry_json) : undefined,
      createdAt: r.created_at,
    }));
  },

  saveChatMessage(userId: string, message: ChatMessage): void {
    sqlite
      .prepare(
        `INSERT OR REPLACE INTO chat_messages (id, user_id, role, content, citations_json, grounded, intent, debug_telemetry_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        message.id,
        userId,
        message.role,
        sanitizeDashes(message.content),
        JSON.stringify(message.citations || []),
        message.grounded ? 1 : 0,
        message.intent || null,
        message.debugTelemetry ? JSON.stringify(message.debugTelemetry) : null,
        message.createdAt || new Date().toISOString()
      );
  },

  clearChatMessages(userId: string): void {
    sqlite.prepare('DELETE FROM chat_messages WHERE user_id = ?').run(userId);
  },
};
