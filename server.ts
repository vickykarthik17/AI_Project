import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });
import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  buildStructuredRevisionTasks,
  calculateConfidenceLevel,
  calculateRevisionPriorityScore,
  chunkStudyDocument,
  classifyKnowledgeStatus,
  computeTopicPerformance,
  retrieveTopChunks,
  sanitizeDashes,
} from './src/domain/engine';
import { dbRepo, initDatabase, seedDemoAccountIfNeeded, verifyPassword } from './src/server/db';
import { DEMO_USER_ID } from './src/domain/seedData';
import { repo } from './src/server/repository';
import { ingestionService } from './src/server/ingestionService';
import { ragRetrievalService } from './src/server/ragRetrievalService';
import { ragCoordinator } from './src/server/ragCoordinator';
import { syllabusService } from './src/server/syllabusService';
import { pastPaperService } from './src/server/pastPaperService';
import { quizGeneratorService } from './src/server/quizGeneratorService';
import { intelligenceEngine } from './src/server/intelligenceEngine';
import { revisionPlannerService } from './src/server/revisionPlannerService';
import { aiTelemetry, getStudyAssistantTools } from './src/server/ai';
import {
  isSupabaseConfigured,
  seedSupabaseDemoAccount,
  supabaseAuthService,
} from './src/server/supabase';
import {
  analyzePastPaperWithGroq,
  answerGroundedStudyQuery,
  evaluateSubmittedAnswers,
  extractTopicsWithGroq,
  generateEmbeddingVector,
  generateGroundedQuizQuestions,
} from './src/server/groqService';
import {
  DifficultyLevel,
  DocumentChunk,
  DocumentType,
  QuestionType,
  QuizSubmissionAnswer,
  RevisionPlan,
  StudyMaterial,
  TopicGapDiagnosis,
  User,
} from './src/types';

initDatabase();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

interface AuthedRequest extends Request {
  user?: User;
  token?: string;
}

function extractReadableTextFromPdfBuffer(buf: Buffer, fallbackTitle: string): string {
  const rawLatin = buf.toString('latin1');
  const extractedSegments: string[] = [];

  // 1. Try to find and decompress FlateDecode streams
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let streamMatch: RegExpExecArray | null;
  while ((streamMatch = streamRegex.exec(rawLatin)) !== null) {
    const streamContent = streamMatch[1];
    try {
      const decompressed = zlib.inflateSync(Buffer.from(streamContent, 'latin1')).toString('latin1');
      const textRegex = /\(([^()\\]{2,300})\)/g;
      let textMatch: RegExpExecArray | null;
      while ((textMatch = textRegex.exec(decompressed)) !== null) {
        const candidate = textMatch[1].replace(/[^\x20-\x7E]/g, ' ').trim();
        if (/[a-zA-Z]{3,}/.test(candidate) && !/^(Type|Font|Page|Catalog|Outlines|Parent|MediaBox|Resources)/i.test(candidate)) {
          extractedSegments.push(candidate);
        }
      }
    } catch {
      // Uncompressed or unsupported stream filter - continue
    }
  }

  // 2. Extract parenthesized text strings from PDF content streams
  const regex = /\(([^()\\]{3,200})\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawLatin)) !== null) {
    const candidate = match[1].replace(/[^\x20-\x7E]/g, ' ').trim();
    if (/[a-zA-Z]{3,}/.test(candidate) && !/^(Type|Font|Page|Catalog|Outlines|Parent|MediaBox|Resources)/i.test(candidate)) {
      extractedSegments.push(candidate);
    }
  }

  if (extractedSegments.join(' ').length > 80) {
    return sanitizeDashes(extractedSegments.join(' '));
  }

  // Fallback UTF-8 printable lines extraction
  const utf8Text = buf
    .toString('utf8')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (utf8Text.length > 60 && !utf8Text.startsWith('%PDF')) {
    return sanitizeDashes(utf8Text);
  }

  return sanitizeDashes(
    `Page 1\nChapter 1: ${fallbackTitle}\nSection: Core Overview\nExtracted document content for ${fallbackTitle}. Key concepts, definitions, and mechanisms indexed for diagnostic assessment and RAG retrieval.`
  );
}

/**
 * Recalculates topic-level knowledge gap diagnoses from all completed quizzes of a student.
 * Uses deterministic backend logic to evaluate topic performance, accuracy, difficulty,
 * repeated misconceptions, and historical trend deltas.
 */
async function recalculateUserGapDiagnoses(
  userId: string,
  subjectFilter?: string,
  token?: string
): Promise<TopicGapDiagnosis[]> {
  const allQuizzes = await repo.getQuizzes(userId, subjectFilter, token);
  const allTopics = await repo.getTopics(userId, subjectFilter, token);
  const existingGaps = await repo.getGapDiagnoses(userId, subjectFilter, token);
  const allChunks = await repo.getChunks(userId, subjectFilter, undefined, token);

  const updatedDiagnoses = intelligenceEngine.calculateGapAnalysis({
    userId,
    subject: subjectFilter || 'Biology',
    quizzes: allQuizzes,
    topics: allTopics,
    existingDiagnoses: existingGaps,
    chunks: allChunks,
  });

  await repo.saveGapDiagnoses(updatedDiagnoses, userId, subjectFilter, token);
  return updatedDiagnoses;
}

let dbInitialized = false;

export async function createExpressApp() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  if (!dbInitialized) {
    try {
      initDatabase();
      dbInitialized = true;
    } catch (e: any) {
      console.warn('Database initialization note:', e.message);
    }
  }

  // Non-blocking body parser for both standard Express and Vercel serverless environments
  app.use((req: Request, res: Response, next: NextFunction) => {
    // 1. If body is already parsed by Vercel or upstream
    if (req.body && typeof req.body === 'object') {
      return next();
    }

    // 2. If body is a string or Buffer, parse directly without waiting on stream
    if (typeof req.body === 'string' && req.body.length > 0) {
      try {
        req.body = JSON.parse(req.body);
        return next();
      } catch {}
    }
    if (Buffer.isBuffer(req.body)) {
      try {
        req.body = JSON.parse(req.body.toString('utf-8'));
        return next();
      } catch {}
    }

    // 3. If stream has already ended or been consumed by Vercel Node runtime
    if (req.readableEnded || (req as any)._readableState?.ended || (req as any).complete) {
      req.body = req.body || {};
      return next();
    }

    // 4. Safe streaming body parsing for standard Node server
    express.json({ limit: '15mb' })(req, res, next);
  });

  // Dynamic Auth Middleware (Instant Local Sessions + Supabase JWT verification)
  const requireAuth = async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : (req.headers['x-session-token'] as string | undefined);

    if (!token) {
      res.status(401).json({ error: 'Authentication required. Please sign in.' });
      return;
    }

    // Instant local session lookup for SQLite tokens (< 1ms)
    if (token.startsWith('gf_sess_') || token.startsWith('gf_demo_')) {
      const user = dbRepo.getUserByToken(token);
      if (user) {
        req.user = user;
        req.token = token;
        return next();
      }
      res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
      return;
    }

    // Supabase JWT verification (only if token is a standard JWT with signature)
    if (isSupabaseConfigured() && token.includes('.')) {
      try {
        const user = await Promise.race([
          supabaseAuthService.getUser(token),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        if (user) {
          req.user = user;
          req.token = token;
          return next();
        }
      } catch {
        // Fall through to local session check
      }
    }

    const user = dbRepo.getUserByToken(token);
    if (!user) {
      res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
      return;
    }

    req.user = user;
    req.token = token;
    next();
  };

  const router = express.Router();

  // ============================================================================
  // 1. AUTHENTICATION ENDPOINTS
  // ============================================================================
  router.post('/auth/register', async (req: Request, res: Response) => {
    try {
      const { name, email, password } = req.body || {};
      if (!name || !email || !password) {
        res.status(400).json({ error: 'Name, email, and password are required.' });
        return;
      }
      if (String(password).length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters long.' });
        return;
      }

      if (isSupabaseConfigured()) {
        const result = await supabaseAuthService.register(String(name), String(email), String(password));
        res.status(201).json(result);
        return;
      }

      const existing = dbRepo.getUserByEmail(String(email));
      if (existing) {
        res.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }

      const user = dbRepo.createUser(String(name), String(email), String(password));
      const token = dbRepo.createSession(user.id);
      res.status(201).json({ token, user });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Registration failed.' });
    }
  });

  router.post('/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const cleanEmail = String(email).trim().toLowerCase();
      const rawPassword = String(password);

      // Instant 1-click Demo Account bypass (< 5ms response time)
      if (cleanEmail === 'demo@gapfinder.ai' && rawPassword === 'Demo@123') {
        let userRecord = dbRepo.getUserByEmail(cleanEmail);
        if (!userRecord) {
          try {
            seedDemoAccountIfNeeded(true);
            userRecord = dbRepo.getUserByEmail(cleanEmail);
          } catch {}
        }
        const user: User = userRecord
          ? {
              id: userRecord.id,
              name: userRecord.name,
              email: userRecord.email,
              targetExam: userRecord.targetExam,
              examDate: userRecord.examDate,
              dailyHours: userRecord.dailyHours,
              isDemo: true,
              createdAt: userRecord.createdAt,
            }
          : {
              id: DEMO_USER_ID,
              name: 'Aarav Sharma (Demo Student)',
              email: 'demo@gapfinder.ai',
              targetExam: 'National Advanced Biology Examination',
              examDate: '2026-11-18',
              dailyHours: 2.0,
              isDemo: true,
              createdAt: '2026-11-05T09:00:00.000Z',
            };

        const token = dbRepo.createSession(user.id);

        // Non-blocking background sync with Supabase if configured
        if (isSupabaseConfigured()) {
          seedSupabaseDemoAccount(false).catch((e) => {
            console.warn('Background Supabase demo seed note:', e.message);
          });
        }

        res.json({ token, user });
        return;
      }

      // Custom account login with Supabase timeout protection
      if (isSupabaseConfigured()) {
        try {
          const result = await Promise.race([
            supabaseAuthService.login(cleanEmail, rawPassword),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Supabase login timed out')), 4000)
            ),
          ]);
          res.json(result);
          return;
        } catch (supaErr: any) {
          console.warn('Supabase login warning, attempting local fallback:', supaErr.message);
        }
      }

      let userRecord = dbRepo.getUserByEmail(cleanEmail);
      if (!userRecord || !verifyPassword(rawPassword, userRecord.passwordHash)) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const { passwordHash: _, ...user } = userRecord;
      const token = dbRepo.createSession(user.id);
      res.json({ token, user });
    } catch (err: any) {
      console.error('Login route error:', err);
      res.status(500).json({ error: err.message || 'Login failed.' });
    }
  });

  router.post('/auth/logout', requireAuth, async (req: AuthedRequest, res: Response) => {
    if (req.token) {
      if (isSupabaseConfigured()) {
        await supabaseAuthService.logout(req.token);
      } else {
        dbRepo.deleteSession(req.token);
      }
    }
    res.json({ success: true });
  });

  router.get('/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json({ user: req.user });
  });

  router.put('/auth/profile', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      if (isSupabaseConfigured()) {
        const updated = await supabaseAuthService.updateProfile(req.user!.id, req.body || {}, req.token);
        res.json({ user: updated });
        return;
      }
      const updated = dbRepo.updateUserProfile(req.user!.id, req.body || {});
      res.json({ user: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update profile.' });
    }
  });

  router.post('/auth/reset-demo', requireAuth, async (req: AuthedRequest, res: Response) => {
    if (isSupabaseConfigured()) {
      await seedSupabaseDemoAccount(true);
    }
    seedDemoAccountIfNeeded(true);
    res.json({ success: true, message: 'Demo Biology dataset restored to initial state.' });
  });

  // ============================================================================
  // 2. STUDY MATERIALS & UPLOAD PIPELINE
  // ============================================================================
  router.get('/materials', requireAuth, async (req: AuthedRequest, res: Response) => {
    const subject = req.query.subject as string | undefined;
    const materials = await repo.getMaterials(req.user!.id, subject, req.token);
    res.json({ materials });
  });

  router.get('/materials/:id/status', requireAuth, async (req: AuthedRequest, res: Response) => {
    const material = await repo.getMaterialById(req.params.id, req.user!.id, req.token);
    if (!material) {
      res.status(404).json({ error: 'Study material not found.' });
      return;
    }
    res.json({
      id: material.id,
      status: material.status,
      chunkCount: material.chunkCount,
      errorMessage: material.errorMessage,
    });
  });

  router.get('/materials/:id/chunks', requireAuth, async (req: AuthedRequest, res: Response) => {
    const allChunks = await repo.getChunks(req.user!.id, undefined, req.params.id, req.token);
    res.json({ chunks: allChunks });
  });

  router.post(
    '/materials/upload',
    requireAuth,
    upload.single('file'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const subject = sanitizeDashes((req.body?.subject || 'Biology').trim());
        const docType = (req.body?.docType || 'Textbook') as DocumentType;
        const customTitle = sanitizeDashes((req.body?.title || '').trim());

        let fileName = req.body?.fileName || 'Study_Material.txt';
        let buffer: Buffer;

        if (req.file) {
          fileName = req.file.originalname;
          buffer = req.file.buffer;
        } else if (req.body?.rawText && String(req.body.rawText).trim().length >= 20) {
          buffer = Buffer.from(req.body.rawText, 'utf8');
          if (!fileName.endsWith('.txt') && !fileName.endsWith('.md')) {
            fileName = `${fileName.replace(/\s+/g, '_')}.txt`;
          }
        } else {
          res.status(400).json({
            error: 'Please select a PDF/TXT file or provide at least 20 characters of readable study material text.',
          });
          return;
        }

        // Execute complete Document Ingestion Pipeline:
        // Validation → Text Extraction → Cleaning → Chunking → Gemini Embeddings → Supabase PostgreSQL + pgvector
        const ingestionResult = await ingestionService.ingestDocument({
          studentId: userId,
          fileName,
          buffer,
          title: customTitle,
          subject,
          docType,
          token: req.token,
        });

        // 3. If Syllabus or no topics exist for this subject yet, extract topics automatically
        const existingTopics = await repo.getTopics(userId, subject, req.token);
        let generatedTopicsCount = 0;
        if (docType === 'Syllabus' || existingTopics.length === 0) {
          const docChunks = await repo.getChunks(userId, subject, ingestionResult.material.id, req.token);
          const newTopics = await syllabusService.extractSyllabusTopics({
            userId,
            subject,
            chunks: docChunks,
            token: req.token,
          });
          for (const t of newTopics) {
            await repo.saveTopic(t, req.token);
          }
          generatedTopicsCount = newTopics.length;
        }

        // 4. If Past Paper, automatically extract questions, validate with Gemini embeddings & update topic frequencies
        let extractedQuestionsCount = 0;
        if (docType === 'Past Paper') {
          const currentTopics = await repo.getTopics(userId, subject, req.token);
          const docChunks = await repo.getChunks(userId, subject, ingestionResult.material.id, req.token);
          const ppQuestions = await pastPaperService.analyzePastPaperDocument({
            userId,
            materialId: ingestionResult.material.id,
            sourceDocument: fileName,
            subject,
            chunks: docChunks,
            existingTopics: currentTopics,
            token: req.token,
          });
          extractedQuestionsCount = ppQuestions.length;
        }

        await recalculateUserGapDiagnoses(userId, subject, req.token);

        res.status(201).json({
          material: ingestionResult.material,
          chunksIndexed: ingestionResult.chunksIndexed,
          extractedPages: ingestionResult.extractedPages,
          duplicateDetected: ingestionResult.duplicateDetected,
          generatedTopicsCount,
          extractedQuestionsCount,
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message || 'Document ingestion pipeline failed.' });
      }
    }
  );

  router.delete('/materials/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    const deleted = await repo.deleteMaterial(req.params.id, req.user!.id, req.token);
    if (!deleted) {
      res.status(404).json({ error: 'Material not found.' });
      return;
    }
    res.json({ success: true });
  });

  // ============================================================================
  // 3. SYLLABUS & TOPIC MAPPING ENDPOINTS
  // ============================================================================
  router.get('/topics', requireAuth, async (req: AuthedRequest, res: Response) => {
    const subject = req.query.subject as string | undefined;
    const topics = await repo.getTopics(req.user!.id, subject, req.token);
    res.json({ topics });
  });

  router.post('/topics/generate', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const subject = sanitizeDashes((req.body?.subject || 'Biology').trim());
      const chunks = await repo.getChunks(userId, subject, undefined, req.token);
      if (chunks.length === 0) {
        res.status(400).json({
          error: `No indexed study material chunks found for subject "${subject}". Please upload study material first.`,
        });
        return;
      }

      const generated = await syllabusService.extractSyllabusTopics({ userId, subject, chunks, token: req.token });
      for (const t of generated) {
        await repo.saveTopic(t, req.token);
      }
      await pastPaperService.updateTopicFrequencies(userId, subject, req.token);
      await recalculateUserGapDiagnoses(userId, subject, req.token);
      const updatedTopics = await repo.getTopics(userId, subject, req.token);
      res.json({ topics: updatedTopics });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to generate topic map.' });
    }
  });

  router.post('/topics', requireAuth, async (req: AuthedRequest, res: Response) => {
    const userId = req.user!.id;
    const {
      subject = 'Biology',
      unitName = 'Unit 1: Core Concepts',
      chapterName = 'Chapter 1',
      topicName,
      subtopics = [],
      importantConcepts = [],
      prerequisites = [],
      syllabusWeight = 7,
    } = req.body || {};

    if (!topicName || !String(topicName).trim()) {
      res.status(400).json({ error: 'Topic name is required.' });
      return;
    }

    const newTopic = {
      id: `topic_${crypto.randomUUID().slice(0, 8)}`,
      userId,
      subject: sanitizeDashes(String(subject)),
      unitName: sanitizeDashes(String(unitName)),
      chapterName: sanitizeDashes(String(chapterName)),
      topicName: sanitizeDashes(String(topicName).trim()),
      subtopics: Array.isArray(subtopics) ? subtopics.map(sanitizeDashes) : [],
      importantConcepts: Array.isArray(importantConcepts) ? importantConcepts.map(sanitizeDashes) : [],
      prerequisites: Array.isArray(prerequisites) ? prerequisites.map(sanitizeDashes) : [],
      syllabusWeight: Number(syllabusWeight) || 7,
      pastPaperFrequency: 0,
      isSample: false,
    };

    await repo.saveTopic(newTopic, req.token);
    await recalculateUserGapDiagnoses(userId, undefined, req.token);
    res.status(201).json({ topic: newTopic });
  });

  router.put('/topics/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    const userId = req.user!.id;
    const allTopics = await repo.getTopics(userId, undefined, req.token);
    const existing = allTopics.find((t) => t.id === req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Topic not found.' });
      return;
    }

    const updated = {
      ...existing,
      unitName: sanitizeDashes(req.body?.unitName ?? existing.unitName),
      chapterName: sanitizeDashes(req.body?.chapterName ?? existing.chapterName),
      topicName: sanitizeDashes(req.body?.topicName ?? existing.topicName),
      subtopics: Array.isArray(req.body?.subtopics)
        ? req.body.subtopics.map(sanitizeDashes)
        : existing.subtopics,
      importantConcepts: Array.isArray(req.body?.importantConcepts)
        ? req.body.importantConcepts.map(sanitizeDashes)
        : existing.importantConcepts,
      prerequisites: Array.isArray(req.body?.prerequisites)
        ? req.body.prerequisites.map(sanitizeDashes)
        : existing.prerequisites,
      syllabusWeight:
        req.body?.syllabusWeight !== undefined
          ? Number(req.body.syllabusWeight)
          : existing.syllabusWeight,
    };

    await repo.saveTopic(updated, req.token);
    await recalculateUserGapDiagnoses(userId, undefined, req.token);
    res.json({ topic: updated });
  });

  router.delete('/topics/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    const deleted = await repo.deleteTopic(req.params.id, req.user!.id, req.token);
    if (!deleted) {
      res.status(404).json({ error: 'Topic not found.' });
      return;
    }
    res.json({ success: true });
  });

  // ============================================================================
  // 4. PAST PAPERS ENDPOINTS
  // ============================================================================
  router.get('/past-papers/questions', requireAuth, async (req: AuthedRequest, res: Response) => {
    const subject = req.query.subject as string | undefined;
    const questions = await repo.getPastPaperQuestions(req.user!.id, subject, req.token);
    const freqMap = await pastPaperService.updateTopicFrequencies(req.user!.id, subject || 'Biology', req.token);
    res.json({ questions, topicFrequency: freqMap });
  });

  router.get('/past-papers/intelligence', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const subject = req.query.subject as string | undefined;
      const intelligence = await pastPaperService.getIntelligenceSummary(req.user!.id, subject, req.token);
      res.json(intelligence);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to generate past paper intelligence.' });
    }
  });

  router.post('/past-papers/analyze', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { materialId, subject = 'Biology' } = req.body || {};
      const allChunks = await repo.getChunks(userId, subject, undefined, req.token);
      const targetChunks = materialId
        ? allChunks.filter((c) => c.materialId === materialId)
        : allChunks;

      if (targetChunks.length === 0) {
        res.status(400).json({ error: 'No document chunks found to analyze.' });
        return;
      }

      const existingTopics = await repo.getTopics(userId, subject, req.token);
      const extracted = await pastPaperService.analyzePastPaperDocument({
        userId,
        materialId: materialId || targetChunks[0].materialId,
        sourceDocument: targetChunks[0].documentName,
        subject,
        chunks: targetChunks,
        existingTopics,
        token: req.token,
      });

      const allPP = await repo.getPastPaperQuestions(userId, subject, req.token);
      const intelligence = await pastPaperService.getIntelligenceSummary(userId, subject, req.token);

      res.json({
        extractedCount: extracted.length,
        questions: allPP,
        intelligence,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to analyze past papers.' });
    }
  });

  router.put('/past-papers/questions/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { topic, subtopic, year, marks, questionType } = req.body || {};
      if (!topic || !String(topic).trim()) {
        res.status(400).json({ error: 'Topic is required.' });
        return;
      }

      const updated = await repo.updatePastPaperQuestion(
        userId,
        req.params.id,
        {
          topic: sanitizeDashes(String(topic).trim()),
          subtopic: subtopic ? sanitizeDashes(String(subtopic).trim()) : undefined,
          year: year !== undefined ? (year ? sanitizeDashes(String(year)) : null) : undefined,
          marks: marks !== undefined ? (marks !== null ? Number(marks) : null) : undefined,
          questionType: questionType ? sanitizeDashes(String(questionType)) : undefined,
          needsReview: false,
          mappingConfidence: 'High',
          validationEvidence: 'Confirmed and mapped by student.',
        },
        req.token
      );

      if (!updated) {
        res.status(404).json({ error: 'Past paper question not found.' });
        return;
      }

      await pastPaperService.updateTopicFrequencies(userId, updated.subject, req.token);
      res.json({ question: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update question.' });
    }
  });

  router.delete('/past-papers/questions/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const deleted = await repo.deletePastPaperQuestion(req.params.id, userId, req.token);
      if (!deleted) {
        res.status(404).json({ error: 'Past paper question not found.' });
        return;
      }
      await pastPaperService.updateTopicFrequencies(userId, 'Biology', req.token);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to delete question.' });
    }
  });

  // ============================================================================
  // 5. RAG RETRIEVAL & STUDY ASSISTANT ENDPOINTS
  // ============================================================================
  router.post('/rag/retrieve', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { query, subject, topics, documentId, topK = 5, minScore = 0.12 } = req.body || {};
      if (!query || !String(query).trim()) {
        res.status(400).json({ error: 'Query string is required for semantic retrieval.' });
        return;
      }

      const retrievalResult = await ragRetrievalService.retrieveChunks({
        query: String(query),
        studentId: userId,
        subject,
        topics: Array.isArray(topics) ? topics : undefined,
        documentId,
        topK: Number(topK) || 5,
        minScore: Number(minScore) || 0.12,
        token: req.token,
      });

      res.json({
        query: retrievalResult.query,
        embeddingModel: retrievalResult.embeddingModel,
        embeddingDimensions: retrievalResult.embeddingDimensions,
        embeddingPreview: retrievalResult.embeddingPreview,
        results: retrievalResult.chunks,
        totalAvailable: retrievalResult.totalAvailable,
        executionTimeMs: retrievalResult.executionTimeMs,
        filtersApplied: retrievalResult.filtersApplied,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'RAG retrieval failed.' });
    }
  });

  router.post('/rag/ask', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { query, subject, topics, documentId, conversationId } = req.body || {};
      if (!query || !String(query).trim()) {
        res.status(400).json({ error: 'Please enter a question for the AI Study Assistant.' });
        return;
      }

      const gaps = await repo.getGapDiagnoses(userId, subject, req.token);
      const weakestTopic = gaps.find((g) => g.status === 'Weak')?.topicName || gaps[0]?.topicName;

      // Multi-turn context & student learning memory
      let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> | undefined;
      if (conversationId) {
        const pastMsgs = await repo.getChatMessages(userId, conversationId, req.token);
        conversationHistory = pastMsgs.slice(-6).map((m) => ({
          role: m.role,
          content: m.content,
        }));
      }

      const memories = await repo.getStudentMemories(userId, req.token);
      const studentMemories = memories.map((m) => `${m.key}: ${m.content}`);

      const result = await ragCoordinator.runGroundedRag({
        query: String(query),
        studentId: userId,
        subject,
        topics: Array.isArray(topics) ? topics : undefined,
        documentId,
        weakestTopic,
        conversationHistory,
        studentMemories,
        token: req.token,
      });

      // Persist messages if conversationId is provided
      if (conversationId) {
        await repo.saveChatMessage(
          {
            id: `msg_user_${Date.now()}`,
            userId,
            conversationId,
            role: 'user',
            content: String(query),
            citations: [],
            grounded: true,
            createdAt: new Date().toISOString(),
          },
          userId,
          req.token
        );

        await repo.saveChatMessage(
          {
            id: `msg_asst_${Date.now() + 1}`,
            userId,
            conversationId,
            role: 'assistant',
            content: result.answer,
            citations: result.citations,
            grounded: result.grounded,
            insufficientEvidence: result.insufficientEvidence,
            debugTelemetry: result.debugTelemetry,
            createdAt: new Date().toISOString(),
          },
          userId,
          req.token
        );
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'AI Study Assistant failed to process query.' });
    }
  });

  router.post('/rag/stream', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { query, subject, topics, documentId, conversationId } = req.body || {};
      if (!query || !String(query).trim()) {
        res.status(400).json({ error: 'Please enter a question for the AI Study Assistant.' });
        return;
      }

      const gaps = await repo.getGapDiagnoses(userId, subject, req.token);
      const weakestTopic = gaps.find((g) => g.status === 'Weak')?.topicName || gaps[0]?.topicName;

      // Multi-turn context & student learning memory
      let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> | undefined;
      if (conversationId) {
        const pastMsgs = await repo.getChatMessages(userId, conversationId, req.token);
        conversationHistory = pastMsgs.slice(-6).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        // Persist user prompt immediately
        await repo.saveChatMessage(
          {
            id: `msg_user_${Date.now()}`,
            userId,
            conversationId,
            role: 'user',
            content: String(query),
            citations: [],
            grounded: true,
            createdAt: new Date().toISOString(),
          },
          userId,
          req.token
        );
      }

      const memories = await repo.getStudentMemories(userId, req.token);
      const studentMemories = memories.map((m) => `${m.key}: ${m.content}`);

      await ragCoordinator.streamGroundedRag({
        query: String(query),
        studentId: userId,
        subject,
        topics: Array.isArray(topics) ? topics : undefined,
        documentId,
        weakestTopic,
        conversationHistory,
        studentMemories,
        token: req.token,
        res,
      });
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || 'AI Study Assistant failed to stream response.' });
      }
    }
  });

  router.get('/ai/telemetry', requireAuth, (_req: AuthedRequest, res: Response) => {
    res.json(aiTelemetry.getSummary());
  });

  router.get('/ai/tools', requireAuth, (req: AuthedRequest, res: Response) => {
    const tools = getStudyAssistantTools(req.user!.id);
    res.json({
      tools: Object.keys(tools).map((name) => ({
        name,
        description: (tools as any)[name].description,
      })),
    });
  });

  // ============================================================================
  // CONVERSATION & STUDENT LEARNING MEMORY ENDPOINTS
  // ============================================================================
  router.get('/chat/conversations', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      let convs = await repo.getConversations(userId, req.token);
      if (convs.length === 0) {
        const def = await repo.createConversation(userId, 'General Biology Study & Revision', 'Biology', req.token);
        convs = [def];
      }
      res.json({ conversations: convs });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch conversations.' });
    }
  });

  router.post('/chat/conversations', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { title = 'New Study Session', subject = 'Biology' } = req.body || {};
      const conv = await repo.createConversation(userId, String(title).trim(), String(subject).trim(), req.token);
      res.status(201).json({ conversation: conv });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create conversation.' });
    }
  });

  router.patch('/chat/conversations/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { title } = req.body || {};
      if (!title || !String(title).trim()) {
        res.status(400).json({ error: 'Conversation title cannot be empty.' });
        return;
      }
      const updated = await repo.updateConversation(req.params.id, userId, String(title).trim(), req.token);
      if (!updated) {
        res.status(404).json({ error: 'Conversation not found.' });
        return;
      }
      res.json({ conversation: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update conversation.' });
    }
  });

  router.delete('/chat/conversations/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const deleted = await repo.deleteConversation(req.params.id, userId, req.token);
      res.json({ success: deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to delete conversation.' });
    }
  });

  router.get('/chat/messages', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const conversationId = req.query.conversationId as string | undefined;
      const messages = await repo.getChatMessages(userId, conversationId, req.token);
      res.json({ messages });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch messages.' });
    }
  });

  router.post('/chat/messages', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { message } = req.body || {};
      if (!message || !message.content) {
        res.status(400).json({ error: 'Valid chat message object is required.' });
        return;
      }
      await repo.saveChatMessage(
        {
          id: message.id || `msg_${Date.now()}`,
          userId,
          conversationId: message.conversationId,
          role: message.role || 'assistant',
          content: message.content,
          citations: message.citations || [],
          grounded: message.grounded !== false,
          intent: message.intent,
          debugTelemetry: message.debugTelemetry,
          createdAt: message.createdAt || new Date().toISOString(),
        },
        userId,
        req.token
      );
      res.status(201).json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to save message.' });
    }
  });

  router.delete('/chat/messages', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const conversationId = req.query.conversationId as string | undefined;
      await repo.clearChatMessages(userId, conversationId, req.token);
      res.json({ success: true, message: 'Chat messages cleared successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to clear chat messages.' });
    }
  });

  router.get('/students/memories', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const memories = await repo.getStudentMemories(userId, req.token);
      res.json({ memories });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch student learning memories.' });
    }
  });

  router.post('/students/memories', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { content, key = 'learning_insight', source = 'manual' } = req.body || {};
      if (!content || !String(content).trim()) {
        res.status(400).json({ error: 'Memory content cannot be empty.' });
        return;
      }
      const saved = await repo.saveStudentMemory(
        userId,
        {
          key: String(key).trim(),
          content: String(content).trim(),
          source: source as 'assistant' | 'quiz' | 'manual',
        },
        req.token
      );
      res.status(201).json({ memory: saved });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to save student memory.' });
    }
  });

  router.delete('/students/memories/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const deleted = await repo.deleteStudentMemory(req.params.id, userId, req.token);
      res.json({ success: deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to delete student memory.' });
    }
  });

  router.post('/rag/inspect', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { query, subject, topics, documentId } = req.body || {};
      if (!query || !String(query).trim()) {
        res.status(400).json({ error: 'Query string is required for developer retrieval inspection.' });
        return;
      }

      const gaps = await repo.getGapDiagnoses(userId, subject, req.token);
      const weakestTopic = gaps.find((g) => g.status === 'Weak')?.topicName || gaps[0]?.topicName;

      const result = await ragCoordinator.runGroundedRag({
        query: String(query),
        studentId: userId,
        subject,
        topics: Array.isArray(topics) ? topics : undefined,
        documentId,
        weakestTopic,
        token: req.token,
      });

      res.json(result.debugTelemetry);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Developer RAG inspection failed.' });
    }
  });

  // ============================================================================
  // 6. DIAGNOSTIC QUIZ GENERATOR & EVALUATION ENDPOINTS
  // ============================================================================
  router.get('/quiz', requireAuth, async (req: AuthedRequest, res: Response) => {
    const quizzes = await repo.getQuizzes(req.user!.id, undefined, req.token);
    res.json({ quizzes: [...quizzes].reverse() });
  });

  router.post('/quiz/generate', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const {
        subject = 'Biology',
        topics = [],
        questionCount = 5,
        difficulty = 'Mixed',
        timeLimitMinutes = 15,
        questionTypes = ['MCQ', 'TrueFalse', 'FillBlank', 'ShortAnswer'],
      } = req.body || {};

      const quiz = await quizGeneratorService.generateDiagnosticQuiz({
        userId,
        subject,
        topics,
        questionCount,
        difficulty,
        questionTypes,
        timeLimitMinutes,
        token: req.token,
      });

      // Do not reveal answers before submission: strip answers & explanations for InProgress quizzes
      const sanitizedQuiz = quizGeneratorService.getSanitizedQuizForStudent(quiz);
      res.status(201).json({ quiz: sanitizedQuiz });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ error: err.message || 'Failed to generate diagnostic quiz.' });
    }
  });

  router.get('/quiz/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    const quiz = await repo.getQuizById(req.params.id, req.user!.id, req.token);
    if (!quiz) {
      res.status(404).json({ error: 'Quiz not found.' });
      return;
    }
    // Prevent cheating: sanitize answers while assessment is InProgress
    const safeQuiz = quizGeneratorService.getSanitizedQuizForStudent(quiz);
    res.json({ quiz: safeQuiz });
  });

  router.post('/quiz/:id/save-progress', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { answers = {}, remainingSeconds } = req.body || {};
      const result = await quizGeneratorService.saveQuizDraftProgress({
        quizId: req.params.id,
        userId,
        answers,
        remainingSeconds,
        token: req.token,
      });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to save quiz draft progress.' });
    }
  });

  router.post('/quiz/:id/submit', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const userResponses: Record<string, string> = req.body?.answers || {};
      const durationSeconds = Number(req.body?.durationSeconds) || 180;

      const { completedQuiz, evaluatedAnswers } =
        await quizGeneratorService.submitAndEvaluateQuiz({
          quizId: req.params.id,
          userId,
          answers: userResponses,
          durationSeconds,
          token: req.token,
        });

      // Update topic-level gap diagnoses immediately
      const updatedDiagnoses = await recalculateUserGapDiagnoses(userId, completedQuiz.subject, req.token);

      // Adaptively update the student's revision plan if one exists
      const updatedPlan = await revisionPlannerService.adaptRevisionPlanAfterQuiz({
        userId,
        quiz: completedQuiz,
        token: req.token,
      });

      res.json({
        quiz: completedQuiz,
        gapDiagnoses: updatedDiagnoses,
        updatedRevisionPlan: updatedPlan,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || (err.message?.includes('already been submitted') ? 400 : 500);
      res.status(statusCode).json({ error: err.message || 'Failed to evaluate quiz submission.', quiz: err.quiz });
    }
  });

  router.get('/quiz/:id/results', requireAuth, async (req: AuthedRequest, res: Response) => {
    const quiz = await repo.getQuizById(req.params.id, req.user!.id, req.token);
    if (!quiz) {
      res.status(404).json({ error: 'Quiz not found.' });
      return;
    }
    const gapDiagnoses = await repo.getGapDiagnoses(req.user!.id, quiz.subject, req.token);
    res.json({ quiz, gapDiagnoses });
  });

  // ============================================================================
  // 7. GAP ANALYSIS REPORT ENDPOINTS
  // ============================================================================
  router.get('/analysis/report', requireAuth, async (req: AuthedRequest, res: Response) => {
    const subject = req.query.subject as string | undefined;
    const diagnoses = await recalculateUserGapDiagnoses(req.user!.id, subject, req.token);
    res.json({ diagnoses });
  });

  router.post('/analysis/generate', requireAuth, async (req: AuthedRequest, res: Response) => {
    const subject = req.body?.subject as string | undefined;
    const diagnoses = await recalculateUserGapDiagnoses(req.user!.id, subject, req.token);
    res.json({ diagnoses });
  });

  // ============================================================================
  // 8. PERSONALIZED REVISION PLANNER ENDPOINTS
  // ============================================================================
  router.get('/revision/plan', requireAuth, async (req: AuthedRequest, res: Response) => {
    const plans = await repo.getRevisionPlans(req.user!.id, undefined, req.token);
    res.json({
      activePlan: plans[0] || null,
      historicalPlans: plans.slice(1),
    });
  });

  router.post('/revision/generate', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const {
        subject = 'Biology',
        examDate,
        daysAvailable = 5,
        dailyHours = 2,
        prioritySubjects = ['Biology'],
      } = req.body || {};

      const result = await revisionPlannerService.generateRevisionPlan({
        userId,
        subject,
        examDate,
        daysAvailable: Number(daysAvailable) || 5,
        dailyHours: Number(dailyHours) || 2,
        prioritySubjects: Array.isArray(prioritySubjects) ? prioritySubjects : [subject],
        token: req.token,
      });

      res.status(201).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to generate revision plan.' });
    }
  });

  router.put('/revision/tasks/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    const completed = Boolean(req.body?.completed);
    const updatedPlan = await repo.updateRevisionTaskStatus(
      req.user!.id,
      req.params.id,
      completed,
      req.token
    );
    if (!updatedPlan) {
      res.status(404).json({ error: 'Revision task not found.' });
      return;
    }
    res.json({ activePlan: updatedPlan });
  });

  // ============================================================================
  // 9. DASHBOARD & PROGRESS ANALYTICS ENDPOINTS
  // ============================================================================
  router.get('/analytics/dashboard', requireAuth, async (req: AuthedRequest, res: Response) => {
    const userId = req.user!.id;
    const materials = await repo.getMaterials(userId, undefined, req.token);
    const topics = await repo.getTopics(userId, undefined, req.token);
    const quizzes = (await repo.getQuizzes(userId, undefined, req.token)).filter(
      (q) => q.status === 'Completed'
    );
    const diagnoses = await recalculateUserGapDiagnoses(userId, undefined, req.token);
    const plans = await repo.getRevisionPlans(userId, undefined, req.token);

    const subjects = Array.from(
      new Set([...materials.map((m) => m.subject), ...topics.map((t) => t.subject)])
    );

    const weakTopics = diagnoses.filter((d) => d.status === 'Weak');
    const mediumTopics = diagnoses.filter((d) => d.status === 'Medium');
    const strongTopics = diagnoses.filter((d) => d.status === 'Strong');
    const insufficientTopics = diagnoses.filter((d) => d.status === 'Insufficient evidence');

    const avgDiagnosticScore =
      quizzes.length > 0
        ? Math.round(quizzes.reduce((acc, q) => acc + q.accuracyPercent, 0) / quizzes.length)
        : 0;

    // Calculate completed study hours from completed revision tasks + quiz durations
    let completedMinutes = 0;
    for (const plan of plans) {
      for (const task of plan.tasks) {
        if (task.completed) completedMinutes += task.durationMinutes;
      }
    }
    const quizMinutes = Math.round(
      quizzes.reduce((acc, q) => acc + (q.durationSeconds || 300), 0) / 60
    );
    const studyHoursCompleted = Number(((completedMinutes + quizMinutes) / 60).toFixed(1));

    const activePlan = plans[0] || null;
    const incompleteTasks = activePlan ? activePlan.tasks.filter((t) => !t.completed).slice(0, 5) : [];

    const previousAttempt = quizzes.length >= 2 ? quizzes[quizzes.length - 2] : null;
    const latestAttempt = quizzes.length >= 1 ? quizzes[quizzes.length - 1] : null;

    const topPriorityGap = diagnoses[0] || null;
    const recommendedNextStep = topPriorityGap
      ? {
          topicName: topPriorityGap.topicName,
          subject: topPriorityGap.subject,
          status: topPriorityGap.status,
          accuracyPercent: topPriorityGap.accuracyPercent,
          reason: sanitizeDashes(
            `Target ${topPriorityGap.topicName} (${topPriorityGap.status}, ${topPriorityGap.accuracyPercent}% accuracy) as your highest-yield revision priority.`
          ),
          action: topPriorityGap.recommendedAction,
        }
      : {
          topicName: 'Cellular Energetics',
          subject: 'Biology',
          status: 'Weak',
          accuracyPercent: 40,
          reason: 'Complete your first diagnostic assessment to identify high-yield knowledge gaps.',
          action: 'Start a 5-question diagnostic quiz.',
        };

    res.json({
      summary: {
        totalSubjects: subjects.length || 1,
        materialsCount: materials.length,
        totalTopics: topics.length,
        diagnosticQuizzesTaken: quizzes.length,
        avgDiagnosticScore,
        studyHoursCompleted,
        weakCount: weakTopics.length,
        mediumCount: mediumTopics.length,
        strongCount: strongTopics.length,
        insufficientCount: insufficientTopics.length,
      },
      gapDiagnoses: diagnoses,
      activeRevisionPlan: activePlan,
      upcomingTasks: incompleteTasks,
      latestQuizAttempt: latestAttempt,
      scoreComparison: {
        previousAccuracy: previousAttempt?.accuracyPercent ?? null,
        latestAccuracy: latestAttempt?.accuracyPercent ?? null,
        deltaPercent:
          previousAttempt && latestAttempt
            ? latestAttempt.accuracyPercent - previousAttempt.accuracyPercent
            : 0,
      },
      recommendedNextStep,
    });
  });

  router.get('/analytics/progress', requireAuth, async (req: AuthedRequest, res: Response) => {
    const userId = req.user!.id;
    const subjectFilter = req.query.subject as string | undefined;
    const quizzes = (await repo.getQuizzes(userId, subjectFilter, req.token)).filter(
      (q) => q.status === 'Completed'
    );
    const diagnoses = await recalculateUserGapDiagnoses(userId, subjectFilter, req.token);
    const plans = await repo.getRevisionPlans(userId, undefined, req.token);

    const activePlan = plans[0];
    const totalTasks = activePlan ? activePlan.tasks.length : 0;
    const completedTasks = activePlan ? activePlan.tasks.filter((t) => t.completed).length : 0;
    const revisionCompletionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Build per-topic trajectory across attempts
    const topicTrajectories: Array<{
      topicName: string;
      subject: string;
      attempts: Array<{ attemptNumber: number; quizTitle: string; date: string; accuracyPercent: number }>;
      initialStatus: string;
      currentStatus: string;
      currentAccuracy: number;
      deltaPercent: number;
    }> = [];

    for (const diag of diagnoses) {
      const attemptPoints: Array<{
        attemptNumber: number;
        quizTitle: string;
        date: string;
        accuracyPercent: number;
      }> = [];

      quizzes.forEach((qz, idx) => {
        const topicAns = qz.answers.filter(
          (a) => a.topic.toLowerCase() === diag.topicName.toLowerCase()
        );
        if (topicAns.length > 0) {
          const perf = computeTopicPerformance(topicAns);
          attemptPoints.push({
            attemptNumber: idx + 1,
            quizTitle: qz.title,
            date: qz.completedAt || qz.createdAt,
            accuracyPercent: perf.accuracyPercent,
          });
        }
      });

      topicTrajectories.push({
        topicName: diag.topicName,
        subject: diag.subject,
        attempts: attemptPoints,
        initialStatus: diag.previousStatus || diag.status,
        currentStatus: diag.status,
        currentAccuracy: diag.accuracyPercent,
        deltaPercent: diag.trendDelta,
      });
    }

    res.json({
      attemptHistory: quizzes.map((q, idx) => ({
        attemptNumber: idx + 1,
        id: q.id,
        title: q.title,
        subject: q.subject,
        accuracyPercent: q.accuracyPercent,
        totalScore: q.totalScore,
        maxScore: q.maxScore,
        durationSeconds: q.durationSeconds,
        completedAt: q.completedAt || q.createdAt,
      })),
      topicTrajectories,
      revisionCompletionRate,
      completedTasks,
      totalTasks,
      improvedTopics: diagnoses.filter((d) => d.trendDelta > 0),
      declinedTopics: diagnoses.filter((d) => d.trendDelta < 0),
    });
  });

  // Mount API routes on both /api and root so both /api/auth/login and /auth/login work seamlessly
  app.use('/api', router);
  app.use('/', router);

  return app;
}

export async function startServer() {
  const app = await createExpressApp();
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GapFinder AI server running on http://localhost:${PORT}`);
  });

  return app;
}

// Only start standalone HTTP server when executed directly as entrypoint (e.g. npm start / npm run dev)
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js')) &&
  !process.env.VERCEL &&
  !process.env.AWS_LAMBDA_FUNCTION_NAME;

if (isDirectExecution) {
  startServer();
}
