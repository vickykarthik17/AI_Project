import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import {
  ChatMessage,
  DiagnosticQuiz,
  DocumentChunk,
  PastPaperQuestion,
  QuizQuestion,
  QuizSubmissionAnswer,
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

export const DEMO_STUDENT_UUID = '00000000-0000-0000-0000-000000000001';
export const DEMO_STUDENT_EMAIL = 'demo@gapfinder.ai';
export const DEMO_STUDENT_PASSWORD = 'Demo@123';
export const STORAGE_BUCKET_MATERIALS = 'study-materials';

/**
 * Checks if Supabase credentials are configured in the environment.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) return false;
  if (url.includes('placeholder') || url.includes('your-project-id') || key.includes('your-supabase-')) {
    return false;
  }
  return true;
}

export function toUuid(id: string): string {
  if (!id) return crypto.randomUUID();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return id.toLowerCase();
  }
  if (id === DEMO_USER_ID) {
    return DEMO_STUDENT_UUID;
  }
  const hash = crypto.createHash('sha256').update(id).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Creates an admin Supabase client with the service role key.
 * This client is NEVER exposed to the frontend/browser.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  const url = process.env.SUPABASE_URL!.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)!.trim();

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Creates a user-scoped Supabase client initialized with the student's JWT access token.
 * Queries issued with this client enforce Supabase Row Level Security (RLS) policies.
 */
export function getUserScopedSupabaseClient(token?: string): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  const url = process.env.SUPABASE_URL!.trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!.trim();

  const options: any = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  };

  if (token) {
    options.global = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

  return createClient(url, anonKey, options);
}

// ============================================================================
// Supabase Authentication Service
// ============================================================================
export const supabaseAuthService = {
  async register(name: string, email: string, password: string): Promise<{ token: string; user: User }> {
    const admin = getSupabaseAdmin();
    if (!admin) throw new Error('Supabase is not configured.');

    // 1. Sign up via Supabase Auth
    const { data, error } = await admin.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { name: name.trim() },
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.user) {
      throw new Error('Registration failed: no user returned.');
    }

    const studentId = data.user.id;

    // 2. Ensure public.students profile exists
    const { error: profileError } = await admin
      .from('students')
      .upsert({
        id: studentId,
        email: email.trim(),
        name: name.trim(),
        target_exam: 'AP / National Advanced Biology Examination',
        exam_date: '2026-11-18',
        daily_hours: 2.0,
        is_demo: email.trim().toLowerCase() === DEMO_STUDENT_EMAIL,
        updated_at: new Date().toISOString(),
      });

    if (profileError) {
      console.warn('Warning: profile upsert error on signup:', profileError.message);
    }

    // 3. Obtain session token (sign in immediately)
    const { data: signInData, error: signInError } = await admin.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError || !signInData.session) {
      // If email confirmation is required, create an admin session
      const token = data.session?.access_token || 'supabase_registered_session';
      return {
        token,
        user: {
          id: studentId,
          name: name.trim(),
          email: email.trim(),
          targetExam: 'AP / National Advanced Biology Examination',
          examDate: '2026-11-18',
          dailyHours: 2.0,
          isDemo: false,
          createdAt: data.user.created_at || new Date().toISOString(),
        },
      };
    }

    const user: User = {
      id: studentId,
      name: name.trim(),
      email: email.trim(),
      targetExam: 'AP / National Advanced Biology Examination',
      examDate: '2026-11-18',
      dailyHours: 2.0,
      isDemo: email.trim().toLowerCase() === DEMO_STUDENT_EMAIL,
      createdAt: data.user.created_at || new Date().toISOString(),
    };

    return { token: signInData.session.access_token, user };
  },

  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const admin = getSupabaseAdmin();
    if (!admin) throw new Error('Supabase is not configured.');

    const cleanEmail = email.trim().toLowerCase();

    // Check if demo account and seed if not present
    if (cleanEmail === DEMO_STUDENT_EMAIL) {
      await seedSupabaseDemoAccount(false);
    }

    const { data, error } = await admin.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error || !data.user || !data.session) {
      throw new Error(error?.message || 'Invalid email or password.');
    }

    // Fetch student profile from public.students
    const { data: studentRecord } = await admin
      .from('students')
      .select('*')
      .eq('id', data.user.id)
      .single();

    const user: User = {
      id: data.user.id,
      name: studentRecord?.name || data.user.user_metadata?.name || 'Student',
      email: data.user.email || cleanEmail,
      targetExam: studentRecord?.target_exam || 'AP / National Advanced Biology Examination',
      examDate: studentRecord?.exam_date || '2026-11-18',
      dailyHours: Number(studentRecord?.daily_hours || 2.0),
      isDemo: Boolean(studentRecord?.is_demo || cleanEmail === DEMO_STUDENT_EMAIL),
      createdAt: studentRecord?.created_at || data.user.created_at || new Date().toISOString(),
    };

    return { token: data.session.access_token, user };
  },

  async getUser(token: string): Promise<User | null> {
    const client = getUserScopedSupabaseClient(token) || getSupabaseAdmin();
    if (!client) return null;

    try {
      const { data: authData, error: authErr } = await client.auth.getUser(token);
      if (authErr || !authData.user) return null;

      const admin = getSupabaseAdmin() || client;
      const { data: studentRecord } = await admin
        .from('students')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      return {
        id: authData.user.id,
        name: studentRecord?.name || authData.user.user_metadata?.name || 'Student',
        email: authData.user.email || '',
        targetExam: studentRecord?.target_exam || 'AP / National Advanced Biology Examination',
        examDate: studentRecord?.exam_date || '2026-11-18',
        dailyHours: Number(studentRecord?.daily_hours || 2.0),
        isDemo: Boolean(studentRecord?.is_demo),
        createdAt: studentRecord?.created_at || authData.user.created_at || new Date().toISOString(),
      };
    } catch {
      return null;
    }
  },

  async logout(token: string): Promise<void> {
    const client = getUserScopedSupabaseClient(token);
    if (client) {
      try {
        await client.auth.signOut();
      } catch {
        // Ignore signout network error
      }
    }
  },

  async updateProfile(userId: string, data: Partial<User>, token?: string): Promise<User> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) throw new Error('Supabase client unavailable.');

    const updates: any = {
      updated_at: new Date().toISOString(),
    };
    if (data.name !== undefined) updates.name = data.name;
    if (data.targetExam !== undefined) updates.target_exam = data.targetExam;
    if (data.examDate !== undefined) updates.exam_date = data.examDate;
    if (data.dailyHours !== undefined) updates.daily_hours = data.dailyHours;

    const { data: updated, error } = await client
      .from('students')
      .update(updates)
      .eq('id', userId)
      .select('*')
      .single();

    if (error || !updated) {
      throw new Error(error?.message || 'Failed to update student profile.');
    }

    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      targetExam: updated.target_exam,
      examDate: updated.exam_date,
      dailyHours: Number(updated.daily_hours),
      isDemo: Boolean(updated.is_demo),
      createdAt: updated.created_at,
    };
  },
};

// ============================================================================
// Supabase File Storage Service ('study-materials' bucket)
// ============================================================================
export const supabaseStorageService = {
  async ensureBucketExists(): Promise<void> {
    const admin = getSupabaseAdmin();
    if (!admin) return;

    try {
      const { data: buckets } = await admin.storage.listBuckets();
      const exists = buckets?.some((b) => b.name === STORAGE_BUCKET_MATERIALS);
      if (!exists) {
        await admin.storage.createBucket(STORAGE_BUCKET_MATERIALS, {
          public: false,
          fileSizeLimit: 20 * 1024 * 1024,
        });
      }
    } catch (e: any) {
      console.warn('Storage bucket check warning:', e.message);
    }
  },

  async uploadMaterial(
    userId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
    token?: string
  ): Promise<{ path: string; publicUrl?: string }> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) throw new Error('Supabase Storage unavailable.');

    await this.ensureBucketExists();

    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${userId}/${Date.now()}_${sanitizedName}`;

    const { data, error } = await client.storage
      .from(STORAGE_BUCKET_MATERIALS)
      .upload(storagePath, buffer, {
        contentType: mimeType || 'application/octet-stream',
        upsert: true,
      });

    if (error) {
      throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }

    return { path: data.path };
  },

  async downloadMaterial(filePath: string, token?: string): Promise<Buffer | null> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return null;

    const { data, error } = await client.storage
      .from(STORAGE_BUCKET_MATERIALS)
      .download(filePath);

    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  },
};

// ============================================================================
// Supabase Database Repository (All 15 Relational Tables)
// ============================================================================
export const supabaseDbRepo = {
  // 1. Subjects
  async getOrCreateSubject(userId: string, subjectName: string, token?: string): Promise<string> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) throw new Error('Supabase client unavailable.');

    const { data: existing } = await client
      .from('subjects')
      .select('id')
      .eq('student_id', userId)
      .ilike('name', subjectName)
      .maybeSingle();

    if (existing?.id) return existing.id;

    const { data: created, error } = await client
      .from('subjects')
      .insert({
        student_id: userId,
        name: subjectName,
      })
      .select('id')
      .single();

    if (error || !created) {
      // Fallback: return deterministic UUID
      return toUuid(`subject_${userId}_${subjectName}`);
    }
    return created.id;
  },

  // 2. Documents (Study Materials)
  async getMaterials(userId: string, subjectFilter?: string, token?: string): Promise<StudyMaterial[]> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return [];

    let query = client.from('documents').select('*').eq('student_id', userId);
    if (subjectFilter && subjectFilter !== 'all') {
      query = query.ilike('subject_name', subjectFilter);
    }
    query = query.order('uploaded_at', { ascending: false });

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((d) => ({
      id: d.id,
      userId: d.student_id,
      title: d.title,
      fileName: d.file_name,
      subject: d.subject_name,
      docType: d.doc_type,
      fileSize: Number(d.file_size),
      pageCount: d.page_count,
      chunkCount: d.chunk_count,
      status: d.status,
      errorMessage: d.error_message || undefined,
      isSample: Boolean(d.is_sample),
      uploadedAt: d.uploaded_at,
    }));
  },

  async getMaterialById(id: string, userId: string, token?: string): Promise<StudyMaterial | null> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return null;

    const targetUuid = toUuid(id);
    const { data } = await client
      .from('documents')
      .select('*')
      .or(`id.eq.${targetUuid},id.eq.${id}`)
      .eq('student_id', userId)
      .maybeSingle();

    if (!data) return null;
    return {
      id: data.id,
      userId: data.student_id,
      title: data.title,
      fileName: data.file_name,
      subject: data.subject_name,
      docType: data.doc_type,
      fileSize: Number(data.file_size),
      pageCount: data.page_count,
      chunkCount: data.chunk_count,
      status: data.status,
      errorMessage: data.error_message || undefined,
      isSample: Boolean(data.is_sample),
      uploadedAt: data.uploaded_at,
    };
  },

  async createMaterial(material: StudyMaterial, token?: string): Promise<void> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return;

    const subjectId = await this.getOrCreateSubject(material.userId, material.subject, token);
    const docUuid = toUuid(material.id);

    await client.from('documents').upsert({
      id: docUuid,
      student_id: material.userId,
      subject_id: subjectId,
      subject_name: material.subject,
      title: material.title,
      file_name: material.fileName,
      file_path: material.fileName,
      doc_type: material.docType,
      file_size: material.fileSize,
      page_count: material.pageCount,
      chunk_count: material.chunkCount,
      status: material.status,
      error_message: material.errorMessage || null,
      is_sample: Boolean(material.isSample),
      uploaded_at: material.uploadedAt || new Date().toISOString(),
    });
  },

  async updateMaterial(
    id: string,
    userId: string,
    updates: Partial<StudyMaterial>,
    token?: string
  ): Promise<void> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return;

    const targetUuid = toUuid(id);
    const patch: any = {};
    if (updates.status !== undefined) patch.status = updates.status;
    if (updates.errorMessage !== undefined) patch.error_message = updates.errorMessage;
    if (updates.chunkCount !== undefined) patch.chunk_count = updates.chunkCount;
    if (updates.pageCount !== undefined) patch.page_count = updates.pageCount;

    await client
      .from('documents')
      .update(patch)
      .or(`id.eq.${targetUuid},id.eq.${id}`)
      .eq('student_id', userId);
  },

  async deleteMaterial(id: string, userId: string, token?: string): Promise<void> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return;

    const targetUuid = toUuid(id);
    await client
      .from('documents')
      .delete()
      .or(`id.eq.${targetUuid},id.eq.${id}`)
      .eq('student_id', userId);
  },

  // 3. Document Chunks & pgvector
  async saveChunks(chunks: DocumentChunk[], userId: string, token?: string): Promise<void> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client || chunks.length === 0) return;

    const subjectId = await this.getOrCreateSubject(userId, chunks[0].subject || 'Biology', token);

    const rows = chunks.map((c) => ({
      id: toUuid(c.id),
      document_id: toUuid(c.materialId),
      student_id: userId,
      subject_id: subjectId,
      subject_name: c.subject,
      document_name: c.documentName,
      page_number: c.pageNumber,
      chapter: c.chapter,
      section: c.section,
      topic: c.topic,
      content: sanitizeDashes(c.content),
      embedding: c.embedding && c.embedding.length > 0 ? c.embedding : null,
      chunk_index: c.chunkIndex,
    }));

    // Upsert in batches of 25 to respect payload limits
    for (let i = 0; i < rows.length; i += 25) {
      const slice = rows.slice(i, i + 25);
      await client.from('document_chunks').upsert(slice);
    }
  },

  async getChunks(
    userId: string,
    subjectFilter?: string,
    materialId?: string,
    token?: string
  ): Promise<DocumentChunk[]> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return [];

    let query = client.from('document_chunks').select('*').eq('student_id', userId);
    if (subjectFilter && subjectFilter !== 'all') {
      query = query.ilike('subject_name', subjectFilter);
    }
    if (materialId) {
      const docUuid = toUuid(materialId);
      query = query.or(`document_id.eq.${docUuid},document_id.eq.${materialId}`);
    }
    query = query.order('chunk_index', { ascending: true });

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      materialId: row.document_id,
      userId: row.student_id,
      subject: row.subject_name,
      documentName: row.document_name,
      pageNumber: row.page_number,
      chapter: row.chapter,
      section: row.section,
      topic: row.topic,
      content: row.content,
      embedding: Array.isArray(row.embedding)
        ? row.embedding
        : typeof row.embedding === 'string'
        ? JSON.parse(row.embedding)
        : [],
      chunkIndex: row.chunk_index,
    }));
  },

  // 4. Topics and Subtopics
  async getTopics(userId: string, subjectFilter?: string, token?: string): Promise<TopicNode[]> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return [];

    let query = client.from('topics').select('*, subtopics(name)').eq('student_id', userId);
    if (subjectFilter && subjectFilter !== 'all') {
      query = query.ilike('subject_name', subjectFilter);
    }
    query = query.order('created_at', { ascending: true });

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((t) => ({
      id: t.id,
      userId: t.student_id,
      subject: t.subject_name,
      unitName: t.unit_name,
      chapterName: t.chapter_name,
      topicName: t.topic_name,
      subtopics: Array.isArray(t.subtopics) ? t.subtopics.map((s: any) => s.name) : [],
      importantConcepts: Array.isArray(t.important_concepts) ? t.important_concepts : [],
      prerequisites: Array.isArray(t.prerequisites) ? t.prerequisites : [],
      syllabusWeight: t.syllabus_weight,
      pastPaperFrequency: t.past_paper_frequency,
      isSample: Boolean(t.is_sample),
    }));
  },

  async saveTopics(
    topics: TopicNode[],
    userId: string,
    subjectFilter?: string,
    token?: string
  ): Promise<void> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client || topics.length === 0) return;

    const subjectId = await this.getOrCreateSubject(userId, subjectFilter || topics[0].subject || 'Biology', token);

    for (const t of topics) {
      const topicUuid = toUuid(t.id);
      await client.from('topics').upsert({
        id: topicUuid,
        student_id: userId,
        subject_id: subjectId,
        subject_name: t.subject || 'Biology',
        unit_name: t.unitName,
        chapter_name: t.chapterName,
        topic_name: t.topicName,
        important_concepts: t.importantConcepts,
        prerequisites: t.prerequisites,
        syllabus_weight: t.syllabusWeight,
        past_paper_frequency: t.pastPaperFrequency,
        is_sample: Boolean(t.isSample),
      });

      // Save subtopics
      if (t.subtopics && t.subtopics.length > 0) {
        // Remove existing subtopics for clean refresh
        await client.from('subtopics').delete().eq('topic_id', topicUuid);
        const subRows = t.subtopics.map((name) => ({
          topic_id: topicUuid,
          student_id: userId,
          name,
        }));
        await client.from('subtopics').insert(subRows);
      }
    }
  },

  async deleteTopic(id: string, userId: string, token?: string): Promise<void> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return;

    const targetUuid = toUuid(id);
    await client
      .from('topics')
      .delete()
      .or(`id.eq.${targetUuid},id.eq.${id}`)
      .eq('student_id', userId);
  },

  // 5. Past Paper Questions
  async getPastPaperQuestions(
    userId: string,
    subjectFilter?: string,
    token?: string
  ): Promise<PastPaperQuestion[]> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return [];

    let query = client.from('past_paper_questions').select('*').eq('student_id', userId);
    if (subjectFilter && subjectFilter !== 'all') {
      query = query.ilike('subject_name', subjectFilter);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((q) => ({
      id: q.id,
      userId: q.student_id,
      materialId: q.document_id || '',
      sourceDocument: q.source_document,
      pageNumber: q.page_number,
      subject: q.subject_name,
      topic: q.topic_name,
      subtopic: q.subtopic_name,
      questionText: q.question_text,
      year: q.year,
      marks: q.marks,
      questionType: q.question_type,
      needsReview: Boolean(q.needs_review),
      mappingConfidence: q.mapping_confidence || (q.needs_review ? 'Uncertain' : 'High'),
      validationEvidence: q.validation_evidence || undefined,
      isSample: Boolean(q.is_sample),
    }));
  },

  async savePastPaperQuestions(
    questions: PastPaperQuestion[],
    userId: string,
    token?: string
  ): Promise<void> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client || questions.length === 0) return;

    const rows = questions.map((q) => ({
      id: toUuid(q.id),
      student_id: userId,
      document_id: q.materialId ? toUuid(q.materialId) : null,
      source_document: q.sourceDocument,
      page_number: q.pageNumber,
      subject_name: q.subject,
      topic_name: q.topic,
      subtopic_name: q.subtopic,
      question_text: q.questionText,
      year: q.year,
      marks: q.marks,
      question_type: q.questionType,
      needs_review: Boolean(q.needsReview),
      mapping_confidence: q.mappingConfidence || 'High',
      validation_evidence: q.validationEvidence || null,
      is_sample: Boolean(q.isSample),
    }));

    for (let i = 0; i < rows.length; i += 25) {
      await client.from('past_paper_questions').upsert(rows.slice(i, i + 25));
    }
  },

  async updatePastPaperQuestion(
    userId: string,
    id: string,
    updates: Partial<PastPaperQuestion>,
    token?: string
  ): Promise<void> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return;

    const targetUuid = toUuid(id);
    const patch: any = {};
    if (updates.topic !== undefined) patch.topic_name = updates.topic;
    if (updates.subtopic !== undefined) patch.subtopic_name = updates.subtopic;
    if (updates.questionText !== undefined) patch.question_text = updates.questionText;
    if (updates.year !== undefined) patch.year = updates.year;
    if (updates.marks !== undefined) patch.marks = updates.marks;
    if (updates.questionType !== undefined) patch.question_type = updates.questionType;
    if (updates.needsReview !== undefined) patch.needs_review = updates.needsReview;
    if (updates.mappingConfidence !== undefined) patch.mapping_confidence = updates.mappingConfidence;
    if (updates.validationEvidence !== undefined) patch.validation_evidence = updates.validationEvidence;

    await client
      .from('past_paper_questions')
      .update(patch)
      .or(`id.eq.${targetUuid},id.eq.${id}`)
      .eq('student_id', userId);
  },

  async deletePastPaperQuestion(userId: string, id: string, token?: string): Promise<void> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return;

    const targetUuid = toUuid(id);
    await client
      .from('past_paper_questions')
      .delete()
      .or(`id.eq.${targetUuid},id.eq.${id}`)
      .eq('student_id', userId);
  },

  // 6. Quizzes, Quiz Questions, Student Answers (Preserving All Previous Attempts)
  async getQuizzes(userId: string, subjectFilter?: string, token?: string): Promise<DiagnosticQuiz[]> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return [];

    let query = client
      .from('quizzes')
      .select('*, quiz_questions(*), student_answers(*)')
      .eq('student_id', userId);

    if (subjectFilter && subjectFilter !== 'all') {
      query = query.ilike('subject_name', subjectFilter);
    }
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((qz) => {
      const questions: QuizQuestion[] = (qz.quiz_questions || []).map((q: any) => ({
        id: q.id,
        quizId: q.quiz_id,
        topic: q.topic_name,
        subtopic: q.subtopic_name,
        questionType: q.question_type,
        difficulty: q.difficulty,
        questionText: q.question_text,
        options: Array.isArray(q.options) ? q.options : undefined,
        correctAnswer: q.correct_answer,
        maxMarks: Number(q.max_marks),
        explanation: q.explanation,
        citation: {
          chunkId: q.citation_chunk_id || '',
          documentName: q.citation_document || '',
          chapter: q.citation_chapter || '',
          pageNumber: q.citation_page || 1,
          section: q.citation_section || '',
          excerpt: q.citation_excerpt || '',
        },
      }));

      const answers: QuizSubmissionAnswer[] = (qz.student_answers || []).map((a: any) => ({
        questionId: a.question_id || a.id,
        topic: a.topic_name,
        subtopic: a.subtopic_name,
        studentResponse: a.student_response,
        correctAnswer: a.correct_answer,
        isCorrect: Boolean(a.is_correct),
        marksEarned: Number(a.marks_earned),
        maxMarks: Number(a.max_marks),
        evaluationExplanation: a.evaluation_explanation,
        difficulty: a.difficulty,
        citation: {
          chunkId: '',
          documentName: '',
          chapter: '',
          pageNumber: 1,
          section: '',
          excerpt: '',
        },
      }));

      return {
        id: qz.id,
        userId: qz.student_id,
        title: qz.title,
        subject: qz.subject_name,
        selectedTopics: Array.isArray(qz.selected_topics) ? qz.selected_topics : [],
        difficulty: qz.difficulty,
        timeLimitMinutes: qz.time_limit_minutes,
        status: qz.status,
        questions,
        answers,
        totalScore: Number(qz.total_score),
        maxScore: Number(qz.max_score),
        accuracyPercent: qz.accuracy_percent,
        durationSeconds: qz.duration_seconds,
        isSample: Boolean(qz.is_sample),
        createdAt: qz.created_at,
        completedAt: qz.completed_at || undefined,
      };
    });
  },

  async getQuizById(id: string, userId: string, token?: string): Promise<DiagnosticQuiz | null> {
    const quizzes = await this.getQuizzes(userId, undefined, token);
    const targetUuid = toUuid(id);
    return quizzes.find((q) => q.id === targetUuid || q.id === id) || null;
  },

  async saveQuiz(quiz: DiagnosticQuiz, token?: string): Promise<void> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return;

    const quizUuid = toUuid(quiz.id);
    const subjectId = await this.getOrCreateSubject(quiz.userId, quiz.subject || 'Biology', token);

    // 1. Save or update quiz header
    await client.from('quizzes').upsert({
      id: quizUuid,
      student_id: quiz.userId,
      subject_id: subjectId,
      title: quiz.title,
      subject_name: quiz.subject,
      selected_topics: quiz.selectedTopics,
      difficulty: quiz.difficulty,
      time_limit_minutes: quiz.timeLimitMinutes,
      status: quiz.status,
      total_score: quiz.totalScore,
      max_score: quiz.maxScore,
      accuracy_percent: quiz.accuracyPercent,
      duration_seconds: quiz.durationSeconds,
      is_sample: Boolean(quiz.isSample),
      created_at: quiz.createdAt || new Date().toISOString(),
      completed_at: quiz.completedAt || (quiz.status === 'Completed' ? new Date().toISOString() : null),
    });

    // 2. Save quiz questions
    if (quiz.questions && quiz.questions.length > 0) {
      const qRows = quiz.questions.map((q) => ({
        id: toUuid(q.id),
        quiz_id: quizUuid,
        topic_name: q.topic,
        subtopic_name: q.subtopic,
        question_type: q.questionType,
        difficulty: q.difficulty,
        question_text: q.questionText,
        options: q.options || null,
        correct_answer: q.correctAnswer,
        max_marks: q.maxMarks,
        explanation: q.explanation,
        citation_chunk_id: q.citation?.chunkId || null,
        citation_document: q.citation?.documentName || null,
        citation_chapter: q.citation?.chapter || null,
        citation_page: q.citation?.pageNumber || null,
        citation_section: q.citation?.section || null,
        citation_excerpt: q.citation?.excerpt || null,
      }));
      await client.from('quiz_questions').upsert(qRows);
    }

    // 3. Save student answers (preserving attempt details)
    if (quiz.answers && quiz.answers.length > 0) {
      const aRows = quiz.answers.map((a) => ({
        id: toUuid(`ans_${quizUuid}_${a.questionId}`),
        quiz_id: quizUuid,
        question_id: toUuid(a.questionId),
        student_id: quiz.userId,
        topic_name: a.topic,
        subtopic_name: a.subtopic,
        student_response: a.studentResponse,
        correct_answer: a.correctAnswer,
        is_correct: a.isCorrect,
        marks_earned: a.marksEarned,
        max_marks: a.maxMarks,
        evaluation_explanation: a.evaluationExplanation,
        difficulty: a.difficulty,
      }));
      await client.from('student_answers').upsert(aRows);
    }

    // 4. Record progress history if completed
    if (quiz.status === 'Completed') {
      const attemptCount = (await this.getQuizzes(quiz.userId, undefined, token)).length;
      await client.from('progress_history').insert({
        student_id: quiz.userId,
        quiz_id: quizUuid,
        attempt_number: attemptCount || 1,
        quiz_title: quiz.title,
        subject_name: quiz.subject,
        accuracy_percent: quiz.accuracyPercent,
        total_score: quiz.totalScore,
        max_score: quiz.maxScore,
        duration_seconds: quiz.durationSeconds,
        completed_at: quiz.completedAt || new Date().toISOString(),
      });
    }
  },

  // 7. Knowledge Gap Reports
  async getGapReports(
    userId: string,
    subjectFilter?: string,
    token?: string
  ): Promise<TopicGapDiagnosis[]> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return [];

    let query = client.from('gap_reports').select('*').eq('student_id', userId);
    if (subjectFilter && subjectFilter !== 'all') {
      query = query.ilike('subject_name', subjectFilter);
    }
    query = query.order('priority_score', { ascending: false });

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((g) => ({
      id: g.id,
      userId: g.student_id,
      subject: g.subject_name,
      topicName: g.topic_name,
      unitName: g.unit_name,
      status: g.status,
      accuracyPercent: g.accuracy_percent,
      questionsAttempted: g.questions_attempted,
      correctCount: g.correct_count,
      incorrectCount: g.incorrect_count,
      confidenceLevel: g.confidence_level,
      repeatedMistakesCount: g.repeated_mistakes_count,
      trendDelta: g.trend_delta,
      previousStatus: g.previous_status || undefined,
      commonMistakesReason: g.common_mistakes_reason,
      recommendedAction: g.recommended_action,
      pastPaperFrequency: g.past_paper_frequency,
      priorityScore: g.priority_score,
      citations: Array.isArray(g.citations) ? g.citations : [],
      isSample: Boolean(g.is_sample),
      updatedAt: g.updated_at,
    }));
  },

  async saveGapReports(
    diagnoses: TopicGapDiagnosis[],
    userId: string,
    subjectFilter?: string,
    token?: string
  ): Promise<void> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client || diagnoses.length === 0) return;

    const rows = diagnoses.map((g) => ({
      id: toUuid(g.id),
      student_id: userId,
      subject_name: g.subject || subjectFilter || 'Biology',
      topic_name: g.topicName,
      unit_name: g.unitName,
      status: g.status,
      accuracy_percent: g.accuracyPercent,
      questions_attempted: g.questionsAttempted,
      correct_count: g.correctCount,
      incorrect_count: g.incorrectCount,
      confidence_level: g.confidenceLevel,
      repeated_mistakes_count: g.repeatedMistakesCount,
      trend_delta: g.trendDelta,
      previous_status: g.previousStatus || null,
      common_mistakes_reason: sanitizeDashes(g.commonMistakesReason),
      recommended_action: sanitizeDashes(g.recommendedAction),
      past_paper_frequency: g.pastPaperFrequency,
      priority_score: g.priorityScore,
      citations: g.citations || [],
      is_sample: Boolean(g.isSample),
      updated_at: new Date().toISOString(),
    }));

    for (const row of rows) {
      await client.from('gap_reports').upsert(row, { onConflict: 'student_id,topic_name' });
    }
  },

  // 8. Revision Plans & Tasks
  async getRevisionPlans(
    userId: string,
    subjectFilter?: string,
    token?: string
  ): Promise<RevisionPlan[]> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return [];

    let query = client
      .from('revision_plans')
      .select('*, revision_tasks(*)')
      .eq('student_id', userId);

    if (subjectFilter && subjectFilter !== 'all') {
      query = query.ilike('subject_name', subjectFilter);
    }
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error || !data || data.length === 0) return [];

    return data.map((planRecord: any) => {
      const tasks: RevisionTask[] = (planRecord.revision_tasks || [])
        .map((t: any) => ({
          id: t.id,
          planId: t.plan_id,
          userId: t.student_id,
          dayNumber: t.day_number,
          dateLabel: t.date_label,
          topicName: t.topic_name,
          subject: t.subject_name,
          taskType: t.task_type,
          title: t.title,
          durationMinutes: t.duration_minutes,
          priorityLevel: t.priority_level,
          learningObjectives: Array.isArray(t.learning_objectives) ? t.learning_objectives : [],
          practicePrompts: Array.isArray(t.practice_prompts) ? t.practice_prompts : [],
          completed: Boolean(t.completed),
          reasonForInclusion: t.reason_for_inclusion,
        }))
        .sort((a: RevisionTask, b: RevisionTask) => a.dayNumber - b.dayNumber);

      return {
        id: planRecord.id,
        userId: planRecord.student_id,
        subject: planRecord.subject_name,
        examDate: planRecord.exam_date,
        daysAvailable: planRecord.days_available,
        dailyHours: Number(planRecord.daily_hours),
        prioritySubjects: Array.isArray(planRecord.priority_subjects) ? planRecord.priority_subjects : [],
        version: planRecord.version,
        changeSummary: Array.isArray(planRecord.change_summary) ? planRecord.change_summary : [],
        tasks,
        isSample: Boolean(planRecord.is_sample),
        createdAt: planRecord.created_at,
      };
    });
  },

  async getRevisionPlan(userId: string, subjectFilter?: string, token?: string): Promise<RevisionPlan | null> {
    const plans = await this.getRevisionPlans(userId, subjectFilter, token);
    return plans[0] || null;
  },

  async saveRevisionPlan(plan: RevisionPlan, token?: string): Promise<void> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return;

    const planUuid = toUuid(plan.id);

    // 1. Save revision plan header
    await client.from('revision_plans').upsert({
      id: planUuid,
      student_id: plan.userId,
      subject_name: plan.subject,
      exam_date: plan.examDate,
      days_available: plan.daysAvailable,
      daily_hours: plan.dailyHours,
      priority_subjects: plan.prioritySubjects,
      version: plan.version,
      change_summary: plan.changeSummary,
      is_sample: Boolean(plan.isSample),
      created_at: plan.createdAt || new Date().toISOString(),
    });

    // 2. Save revision tasks
    if (plan.tasks && plan.tasks.length > 0) {
      await client.from('revision_tasks').delete().eq('plan_id', planUuid);

      const taskRows = plan.tasks.map((t) => ({
        id: toUuid(t.id),
        plan_id: planUuid,
        student_id: plan.userId,
        day_number: t.dayNumber,
        date_label: t.dateLabel,
        topic_name: t.topicName,
        subject_name: t.subject || plan.subject,
        task_type: t.taskType,
        title: t.title,
        duration_minutes: t.durationMinutes,
        priority_level: t.priorityLevel,
        learningObjectives: t.learningObjectives,
        practicePrompts: t.practicePrompts,
        completed: Boolean(t.completed),
        reason_for_inclusion: sanitizeDashes(t.reasonForInclusion),
      }));

      for (let i = 0; i < taskRows.length; i += 25) {
        await client.from('revision_tasks').insert(taskRows.slice(i, i + 25));
      }
    }
  },

  async updateRevisionTaskCompletion(
    taskId: string,
    planId: string,
    userId: string,
    completed: boolean,
    token?: string
  ): Promise<void> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return;

    const taskUuid = toUuid(taskId);
    await client
      .from('revision_tasks')
      .update({ completed })
      .or(`id.eq.${taskUuid},id.eq.${taskId}`)
      .eq('student_id', userId);
  },

  // 9. Progress History
  async getProgressHistory(userId: string, subjectFilter?: string, token?: string): Promise<any[]> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return [];

    let query = client.from('progress_history').select('*').eq('student_id', userId);
    if (subjectFilter && subjectFilter !== 'all') {
      query = query.ilike('subject_name', subjectFilter);
    }
    query = query.order('completed_at', { ascending: true });

    const { data } = await query;
    return data || [];
  },

  // 10. AI Study Assistant Chat Memory
  async getChatMessages(userId: string, token?: string): Promise<ChatMessage[]> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return [];

    const studentUuid = toUuid(userId);
    const { data, error } = await client
      .from('chat_messages')
      .select('*')
      .eq('student_id', studentUuid)
      .order('created_at', { ascending: true });

    if (error || !data) return [];

    return data.map((r: any) => ({
      id: r.id,
      userId: r.student_id,
      role: r.role as 'user' | 'assistant',
      content: sanitizeDashes(r.content),
      citations: Array.isArray(r.citations) ? r.citations : JSON.parse(r.citations || '[]'),
      grounded: Boolean(r.grounded),
      intent: r.intent || undefined,
      debugTelemetry: r.debug_telemetry || undefined,
      createdAt: r.created_at,
    }));
  },

  async saveChatMessage(message: ChatMessage, userId: string, token?: string): Promise<void> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return;

    const studentUuid = toUuid(userId);
    await client.from('chat_messages').upsert({
      id: toUuid(message.id),
      student_id: studentUuid,
      role: message.role,
      content: sanitizeDashes(message.content),
      citations: message.citations || [],
      grounded: message.grounded,
      intent: message.intent || null,
      debug_telemetry: message.debugTelemetry || null,
      created_at: message.createdAt || new Date().toISOString(),
    });
  },

  async clearChatMessages(userId: string, token?: string): Promise<void> {
    const client = (token ? getUserScopedSupabaseClient(token) : null) || getSupabaseAdmin();
    if (!client) return;

    const studentUuid = toUuid(userId);
    await client.from('chat_messages').delete().eq('student_id', studentUuid);
  },
};

// ============================================================================
// Auto-Provisioning & Seeding Supabase Demo Account
// ============================================================================
export async function seedSupabaseDemoAccount(forceReset: boolean = false): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  try {
    // 1. Check if demo user exists in auth.users
    const { data: usersList } = await admin.auth.admin.listUsers();
    let demoAuthUser = usersList?.users?.find(
      (u) => u.email?.toLowerCase() === DEMO_STUDENT_EMAIL
    );

    if (!demoAuthUser) {
      // Create demo user via Admin API
      const { data: created, error } = await admin.auth.admin.createUser({
        id: DEMO_STUDENT_UUID,
        email: DEMO_STUDENT_EMAIL,
        password: DEMO_STUDENT_PASSWORD,
        email_confirm: true,
        user_metadata: { name: 'Demo Student' },
      });
      if (error) {
        console.warn('Notice: Could not create demo auth user via Admin API:', error.message);
      } else {
        demoAuthUser = created.user;
      }
    }

    const studentId = demoAuthUser?.id || DEMO_STUDENT_UUID;

    // 2. Ensure students profile exists
    await admin.from('students').upsert({
      id: studentId,
      email: DEMO_STUDENT_EMAIL,
      name: 'Demo Student',
      target_exam: 'AP / National Advanced Biology Examination',
      exam_date: '2026-11-18',
      daily_hours: 2.0,
      is_demo: true,
    });

    // Check if sample data already seeded
    const { data: existingDocs } = await admin
      .from('documents')
      .select('id')
      .eq('student_id', studentId)
      .limit(1);

    if (existingDocs && existingDocs.length > 0 && !forceReset) {
      return;
    }

    console.log('Seeding Supabase with sample biology curriculum and diagnostic data for demo student...');

    // 3. Subject
    const subjectId = await supabaseDbRepo.getOrCreateSubject(studentId, 'Biology');

    // 4. Documents
    for (const m of SAMPLE_MATERIALS) {
      await supabaseDbRepo.createMaterial({ ...m, userId: studentId });
    }

    // 5. Document Chunks with Vector Embeddings
    await supabaseDbRepo.saveChunks(
      SAMPLE_CHUNKS.map((c) => ({ ...c, userId: studentId })),
      studentId
    );

    // 6. Topics and Subtopics
    await supabaseDbRepo.saveTopics(
      SAMPLE_TOPICS.map((t) => ({ ...t, userId: studentId })),
      studentId,
      'Biology'
    );

    // 7. Past Paper Questions
    await supabaseDbRepo.savePastPaperQuestions(
      SAMPLE_PAST_PAPER_QUESTIONS.map((pp) => ({ ...pp, userId: studentId })),
      studentId
    );

    // 8. Quizzes & Historical Attempts
    for (const qz of SAMPLE_QUIZZES) {
      await supabaseDbRepo.saveQuiz({ ...qz, userId: studentId });
    }

    // 9. Gap Reports
    await supabaseDbRepo.saveGapReports(
      SAMPLE_GAP_DIAGNOSES.map((g) => ({ ...g, userId: studentId })),
      studentId,
      'Biology'
    );

    // 10. Revision Plan & Tasks
    await supabaseDbRepo.saveRevisionPlan({
      ...SAMPLE_REVISION_PLAN,
      userId: studentId,
      tasks: SAMPLE_REVISION_PLAN.tasks.map((t) => ({ ...t, userId: studentId })),
    });

    console.log('Successfully completed Supabase demo account seeding.');
  } catch (err: any) {
    console.warn('Notice: Supabase demo account seeding caught error:', err.message);
  }
}

