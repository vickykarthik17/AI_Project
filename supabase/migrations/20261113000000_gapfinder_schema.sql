-- ============================================================================
-- GapFinder AI: Complete Supabase PostgreSQL Schema with RLS and pgvector
-- ============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. Create All 15 Required Relational Tables

-- Table 1: students (links to auth.users)
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    target_exam TEXT DEFAULT 'AP / National Advanced Biology Examination',
    exam_date DATE DEFAULT '2026-11-18',
    daily_hours NUMERIC(4, 1) DEFAULT 2.0,
    is_demo BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table 2: subjects
CREATE TABLE IF NOT EXISTS public.subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_student_subject UNIQUE (student_id, name)
);

-- Table 3: documents (study materials)
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    subject_name TEXT NOT NULL DEFAULT 'Biology',
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT,
    content_hash TEXT,
    doc_type TEXT NOT NULL CHECK (doc_type IN ('Syllabus', 'Textbook', 'Study Notes', 'Past Paper', 'Plain Text')),
    file_size BIGINT NOT NULL DEFAULT 0,
    page_count INTEGER NOT NULL DEFAULT 1,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('Uploaded', 'Extracting', 'Chunking', 'Embedding', 'Indexed', 'Processing', 'Ready', 'Failed')),
    error_message TEXT,
    is_sample BOOLEAN DEFAULT false,
    uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- Table 4: document_chunks
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    subject_name TEXT NOT NULL DEFAULT 'Biology',
    document_name TEXT NOT NULL,
    page_number INTEGER NOT NULL DEFAULT 1,
    chapter TEXT NOT NULL,
    section TEXT NOT NULL,
    topic TEXT NOT NULL,
    content TEXT NOT NULL,
    extracted_text TEXT,
    embedding vector(64),
    chunk_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table 5: topics (syllabus nodes)
CREATE TABLE IF NOT EXISTS public.topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    subject_name TEXT NOT NULL DEFAULT 'Biology',
    unit_name TEXT NOT NULL,
    chapter_name TEXT NOT NULL,
    topic_name TEXT NOT NULL,
    important_concepts JSONB DEFAULT '[]'::jsonb,
    prerequisites JSONB DEFAULT '[]'::jsonb,
    syllabus_weight INTEGER NOT NULL DEFAULT 7 CHECK (syllabus_weight BETWEEN 1 AND 10),
    past_paper_frequency INTEGER NOT NULL DEFAULT 0,
    is_sample BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table 6: subtopics
CREATE TABLE IF NOT EXISTS public.subtopics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table 7: past_paper_questions
CREATE TABLE IF NOT EXISTS public.past_paper_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    source_document TEXT NOT NULL,
    page_number INTEGER NOT NULL DEFAULT 1,
    subject_name TEXT NOT NULL DEFAULT 'Biology',
    topic_name TEXT NOT NULL,
    subtopic_name TEXT NOT NULL,
    question_text TEXT NOT NULL,
    year TEXT,
    marks INTEGER,
    question_type TEXT NOT NULL DEFAULT 'ShortAnswer',
    needs_review BOOLEAN DEFAULT false,
    mapping_confidence TEXT DEFAULT 'High',
    validation_evidence TEXT,
    is_sample BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table 8: quizzes
CREATE TABLE IF NOT EXISTS public.quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    subject_name TEXT NOT NULL DEFAULT 'Biology',
    selected_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard', 'Mixed')),
    time_limit_minutes INTEGER NOT NULL DEFAULT 15,
    status TEXT NOT NULL CHECK (status IN ('InProgress', 'Completed')),
    total_score NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    max_score NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    accuracy_percent INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    is_sample BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- Table 9: quiz_questions
CREATE TABLE IF NOT EXISTS public.quiz_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    topic_name TEXT NOT NULL,
    subtopic_name TEXT NOT NULL,
    question_type TEXT NOT NULL CHECK (question_type IN ('MCQ', 'TrueFalse', 'FillBlank', 'ShortAnswer')),
    difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    question_text TEXT NOT NULL,
    options JSONB,
    correct_answer TEXT NOT NULL,
    max_marks NUMERIC(4, 1) NOT NULL DEFAULT 1.0,
    explanation TEXT NOT NULL,
    citation_chunk_id TEXT,
    citation_document TEXT,
    citation_chapter TEXT,
    citation_page INTEGER,
    citation_section TEXT,
    citation_excerpt TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table 10: student_answers
CREATE TABLE IF NOT EXISTS public.student_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    topic_name TEXT NOT NULL,
    subtopic_name TEXT NOT NULL,
    student_response TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT false,
    marks_earned NUMERIC(4, 1) NOT NULL DEFAULT 0.0,
    max_marks NUMERIC(4, 1) NOT NULL DEFAULT 1.0,
    evaluation_explanation TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table 11: topic_performance
CREATE TABLE IF NOT EXISTS public.topic_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
    topic_name TEXT NOT NULL,
    questions_attempted INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    incorrect_count INTEGER NOT NULL DEFAULT 0,
    accuracy_percent INTEGER NOT NULL DEFAULT 0,
    repeated_mistakes_count INTEGER NOT NULL DEFAULT 0,
    hard_or_medium_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_student_topic_performance UNIQUE (student_id, topic_name)
);

-- Table 12: gap_reports
CREATE TABLE IF NOT EXISTS public.gap_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    subject_name TEXT NOT NULL DEFAULT 'Biology',
    topic_name TEXT NOT NULL,
    unit_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Weak', 'Medium', 'Strong', 'Insufficient evidence')),
    accuracy_percent INTEGER NOT NULL DEFAULT 0,
    questions_attempted INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    incorrect_count INTEGER NOT NULL DEFAULT 0,
    confidence_level TEXT NOT NULL CHECK (confidence_level IN ('Low', 'Medium', 'High')),
    repeated_mistakes_count INTEGER NOT NULL DEFAULT 0,
    trend_delta INTEGER NOT NULL DEFAULT 0,
    previous_status TEXT,
    common_mistakes_reason TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    past_paper_frequency INTEGER NOT NULL DEFAULT 0,
    priority_score INTEGER NOT NULL DEFAULT 0 CHECK (priority_score BETWEEN 0 AND 100),
    citations JSONB DEFAULT '[]'::jsonb,
    is_sample BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_student_gap_report UNIQUE (student_id, topic_name)
);

-- Table 13: revision_plans
CREATE TABLE IF NOT EXISTS public.revision_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    subject_name TEXT NOT NULL DEFAULT 'Biology',
    exam_date DATE NOT NULL,
    days_available INTEGER NOT NULL DEFAULT 5,
    daily_hours NUMERIC(4, 1) NOT NULL DEFAULT 2.0,
    priority_subjects JSONB DEFAULT '[]'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    change_summary JSONB DEFAULT '[]'::jsonb,
    is_sample BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table 14: revision_tasks
CREATE TABLE IF NOT EXISTS public.revision_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.revision_plans(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    date_label TEXT NOT NULL,
    topic_name TEXT NOT NULL,
    subject_name TEXT NOT NULL DEFAULT 'Biology',
    task_type TEXT NOT NULL CHECK (task_type IN ('Concept Revision', 'Practice Questions', 'Mistake Review')),
    title TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    priority_level TEXT NOT NULL CHECK (priority_level IN ('Critical', 'High', 'Medium', 'Review')),
    learning_objectives JSONB DEFAULT '[]'::jsonb,
    practice_prompts JSONB DEFAULT '[]'::jsonb,
    completed BOOLEAN NOT NULL DEFAULT false,
    reason_for_inclusion TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table 15: progress_history
CREATE TABLE IF NOT EXISTS public.progress_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    quiz_id UUID REFERENCES public.quizzes(id) ON DELETE SET NULL,
    attempt_number INTEGER NOT NULL,
    quiz_title TEXT NOT NULL,
    subject_name TEXT NOT NULL DEFAULT 'Biology',
    accuracy_percent INTEGER NOT NULL,
    total_score NUMERIC(6, 2) NOT NULL,
    max_score NUMERIC(6, 2) NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 3. High-Performance Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_subjects_student ON public.subjects(student_id);
CREATE INDEX IF NOT EXISTS idx_documents_student ON public.documents(student_id);
CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON public.documents(student_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_document_chunks_student ON public.document_chunks(student_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_doc ON public.document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_topics_student ON public.topics(student_id);
CREATE INDEX IF NOT EXISTS idx_subtopics_topic ON public.subtopics(topic_id);
CREATE INDEX IF NOT EXISTS idx_past_papers_student ON public.past_paper_questions(student_id);
CREATE INDEX IF NOT EXISTS idx_past_papers_topic ON public.past_paper_questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_student ON public.quizzes(student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON public.quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_student_answers_student ON public.student_answers(student_id);
CREATE INDEX IF NOT EXISTS idx_student_answers_quiz ON public.student_answers(quiz_id);
CREATE INDEX IF NOT EXISTS idx_gap_reports_student ON public.gap_reports(student_id);
CREATE INDEX IF NOT EXISTS idx_gap_reports_priority ON public.gap_reports(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_revision_plans_student ON public.revision_plans(student_id);
CREATE INDEX IF NOT EXISTS idx_revision_tasks_plan ON public.revision_tasks(plan_id);
CREATE INDEX IF NOT EXISTS idx_revision_tasks_student ON public.revision_tasks(student_id);
CREATE INDEX IF NOT EXISTS idx_progress_history_student ON public.progress_history(student_id);

-- Optional HNSW Vector Index for fast semantic chunk similarity
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding 
ON public.document_chunks USING hnsw (embedding vector_cosine_ops);

-- ============================================================================
-- 4. Enable Row Level Security (RLS) on All 15 Tables
-- ============================================================================
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.past_paper_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gap_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revision_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revision_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_history ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. Student Row Level Security (RLS) Policies
-- ============================================================================

-- students
CREATE POLICY "Students can view their own profile" 
ON public.students FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Students can update their own profile" 
ON public.students FOR UPDATE USING (auth.uid() = id);

-- subjects
CREATE POLICY "Students manage their own subjects" 
ON public.subjects FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

-- documents
CREATE POLICY "Students manage their own documents" 
ON public.documents FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

-- document_chunks
CREATE POLICY "Students manage their own chunks" 
ON public.document_chunks FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

-- topics
CREATE POLICY "Students manage their own topics" 
ON public.topics FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

-- subtopics
CREATE POLICY "Students manage their own subtopics" 
ON public.subtopics FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

-- past_paper_questions
CREATE POLICY "Students manage their own past paper questions" 
ON public.past_paper_questions FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

-- quizzes
CREATE POLICY "Students manage their own quizzes" 
ON public.quizzes FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

-- quiz_questions (accessible through parent quiz ownership)
CREATE POLICY "Students access quiz questions of their quizzes" 
ON public.quiz_questions FOR ALL USING (
    EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND q.student_id = auth.uid())
);

-- student_answers
CREATE POLICY "Students manage their own answers" 
ON public.student_answers FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

-- topic_performance
CREATE POLICY "Students manage their own performance" 
ON public.topic_performance FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

-- gap_reports
CREATE POLICY "Students manage their own gap reports" 
ON public.gap_reports FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

-- revision_plans
CREATE POLICY "Students manage their own revision plans" 
ON public.revision_plans FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

-- revision_tasks
CREATE POLICY "Students manage their own revision tasks" 
ON public.revision_tasks FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

-- progress_history
CREATE POLICY "Students manage their own progress history" 
ON public.progress_history FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

-- ============================================================================
-- 5. pgvector Semantic Similarity Search RPC Function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.match_document_chunks(
    query_embedding vector(64),
    match_threshold float DEFAULT 0.1,
    match_count int DEFAULT 5,
    filter_student_id uuid DEFAULT NULL,
    filter_subject text DEFAULT NULL,
    filter_document_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    document_id uuid,
    student_id uuid,
    subject_name text,
    document_name text,
    page_number int,
    chapter text,
    section text,
    topic text,
    content text,
    similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        c.id,
        c.document_id,
        c.student_id,
        c.subject_name,
        c.document_name,
        c.page_number,
        c.chapter,
        c.section,
        c.topic,
        c.content,
        ROUND((1 - (c.embedding <=> query_embedding))::numeric, 4)::float AS similarity
    FROM public.document_chunks c
    WHERE (filter_student_id IS NULL OR c.student_id = filter_student_id)
      AND (filter_subject IS NULL OR c.subject_name ILIKE filter_subject)
      AND (filter_document_id IS NULL OR c.document_id = filter_document_id)
      AND c.embedding IS NOT NULL
      AND (1 - (c.embedding <=> query_embedding)) >= match_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.match_document_chunks TO authenticated;

-- ============================================================================
-- 6. Trigger for Automatic Student Provisioning on Signup
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.students (id, email, name, is_demo)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        CASE WHEN new.email = 'demo@gapfinder.ai' THEN true ELSE false END
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 7. Supabase Storage: Bucket Creation & RLS for 'study-materials'
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('study-materials', 'study-materials', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Students can upload study material files to their own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'study-materials' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Students can view their own study material files"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'study-materials' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Students can delete their own study material files"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'study-materials' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================================
-- 8. Table 16: conversations (AI Study Assistant Sessions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT 'Biology',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_student ON public.conversations(student_id, updated_at DESC);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students can access own conversations"
    ON public.conversations FOR ALL
    USING (auth.uid() = student_id)
    WITH CHECK (auth.uid() = student_id);

-- ============================================================================
-- 9. Table 17: student_memories (Persistent Student Learning Insights)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.student_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    memory_key TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'assistant' CHECK (source IN ('assistant', 'quiz', 'manual')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_memories_student ON public.student_memories(student_id, created_at DESC);
ALTER TABLE public.student_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students can access own memories"
    ON public.student_memories FOR ALL
    USING (auth.uid() = student_id)
    WITH CHECK (auth.uid() = student_id);

-- ============================================================================
-- 10. Table 18: chat_messages (AI Study Assistant persistent memory)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    grounded BOOLEAN NOT NULL DEFAULT true,
    intent TEXT,
    debug_telemetry JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_student_time ON public.chat_messages(student_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON public.chat_messages(student_id, conversation_id, created_at ASC);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can access own chat messages"
    ON public.chat_messages FOR ALL
    USING (auth.uid() = student_id)
    WITH CHECK (auth.uid() = student_id);


