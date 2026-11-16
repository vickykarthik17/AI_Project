<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# GapFinder AI - Intelligent Learning Diagnosis Platform

GapFinder AI identifies student knowledge gaps through RAG-grounded assessments and generates adaptive multi-day revision schedules. Powered by ultra-fast Groq LPU inference (`llama-3.3-70b-versatile`) and a persistent **Supabase PostgreSQL** backend with **pgvector** and **Row Level Security (RLS)**.

---

## Architecture & Technology Stack

- **Document Ingestion Pipeline**: `PDF/Text Upload` → `Text Extraction` → `Cleaning` → `Chunking` → `Gemini Embeddings` → `Supabase PostgreSQL + pgvector`.
- **Embedding Model**: Google Gemini Embedding 2 (`text-embedding-004`) via official `@google/genai` API with consistent 64-dimensional output across document chunks and query vectors.
- **PDF Extraction**: Native page-preserving PDF extraction (with PyMuPDF/pdfplumber child-process support when Python is available).
- **LLM Reasoning**: [Groq API](https://groq.com) running `llama-3.3-70b-versatile` (fast inference for topic extraction, grounded quiz generation, and rubric-based answer evaluations).
- **Backend & Database**: [Supabase PostgreSQL](https://supabase.com) with `uuid-ossp`, `pgcrypto`, and `pgvector` (64-dimensional semantic embeddings).
- **Security & RLS**: All 15 relational tables enforce Row Level Security (`auth.uid() = student_id`).
- **File Storage**: Supabase Storage bucket (`study-materials`) with student folder isolation (`{auth.uid()}/{filename}`).
- **Authentication**: Supabase Auth (Email & Password, JWT Bearer tokens, automatic user profile provisioning).
- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide icons, Recharts.

---

## Document Ingestion Pipeline

The platform supports ingesting **Syllabus PDFs**, **Textbook PDFs**, **Study Notes**, **Past Examination Papers**, and **Plain Text/Markdown** files.

### Ingestion Lifecycle Stages
1. **Uploaded**: Validates MIME/extension (`.pdf`, `.txt`, `.md`), checks file size (max 25MB), checks PDF `%PDF-` signature, computes a SHA-256 content hash, prevents duplicate re-processing, and stores the raw file in the Supabase Storage `study-materials` bucket.
2. **Extracting**: Extracts text page-by-page, preserving exact 1-based page numbers. Removes non-printable control characters, normalizes dashes, and fixes line breaks.
3. **Chunking**: Identifies chapters, units, and sections (e.g. `Chapter 1: Cellular Biology`, `Section: Fluid Mosaic Model`). Splits text into 120-220 word chunks with 20-word contextual overlap.
4. **Embedding**: Calls official Google Gemini Embedding API (`text-embedding-004`) with configured output dimensionality (`EMBEDDING_DIMENSION = 64`) to match pgvector storage and search query vectors.
5. **Indexed**: Persists chunks into `public.document_chunks` with `vector(64)` embeddings, document metadata, page numbers, chapters, and sections.
6. **Failed**: Captures and records descriptive error states if any step encounters invalid inputs.

Every chunk stored contains:
- `student_id`
- `document_id`
- `chunk_id`
- `document_name`
- `page_number`
- `chapter`
- `section`
- `extracted_text`
- `embedding` (64-dim vector)

---

## Supabase PostgreSQL Relational Schema

GapFinder AI defines **15 relational database tables** with UUID primary keys, foreign keys with cascade deletion, and optimized indexes:

1. `public.students` - Student profiles linked to `auth.users(id)` via database triggers.
2. `public.subjects` - Subjects studied by the student (e.g., Biology).
3. `public.documents` - Uploaded study materials (syllabi, textbooks, past papers).
4. `public.document_chunks` - Extracted document chunks with `embedding vector(64)` and HNSW cosine index.
5. `public.topics` - Syllabus topics with weights, prerequisites, and past-paper appearance frequency.
6. `public.subtopics` - Granular subtopic concepts belonging to each syllabus topic.
7. `public.past_paper_questions` - Real exam questions extracted from past examination papers.
8. `public.quizzes` - Diagnostic assessments taken by the student.
9. `public.quiz_questions` - Grounded questions with exact textbook citations and explanations.
10. `public.student_answers` - Student responses, marks earned, and evaluation feedback.
11. `public.topic_performance` - Aggregated topic-level accuracy, attempts, and error trends.
12. `public.gap_reports` - Knowledge gap diagnoses (Weak, Medium, Strong, Insufficient evidence) with priority scores.
13. `public.revision_plans` - Multi-day revision plans tailored to exam deadlines.
14. `public.revision_tasks` - Daily concept, practice, and error review tasks with completion tracking.
15. `public.progress_history` - Historical progression metrics across consecutive quiz attempts.

---

## Getting Started

### Prerequisites

- Node.js 22+
- (Optional) Supabase project credentials (if connecting to a live Supabase instance).

### 1. Configure Environment Variables

Copy [.env.example](.env.example) to `.env.local` or `.env`:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Groq AI
GROQ_API_KEY="gsk_your_groq_api_key_here"
GROQ_MODEL="llama-3.3-70b-versatile"

# Supabase PostgreSQL (Optional - falls back to local SQLite if unset)
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"

PORT=3000
```

> [!IMPORTANT]
> `SUPABASE_SERVICE_ROLE_KEY` is used strictly on the server for administrative provisioning and is **never exposed to the browser or frontend client**.

### 2. Apply Supabase Database Migrations & Seed Data

In your Supabase project dashboard (SQL Editor) or via the Supabase CLI:

1. Execute the migration file:
   [supabase/migrations/20261113000000_gapfinder_schema.sql](file:///d:/AISchool/supabase/migrations/20261113000000_gapfinder_schema.sql)
2. Execute the seed script:
   [supabase/seed.sql](file:///d:/AISchool/supabase/seed.sql)

### 3. Demo Account Credentials

A pre-seeded demonstration account is available out of the box:

- **Email**: `demo@gapfinder.ai`
- **Password**: `Demo@123`
- Pre-populated with:
  - 3 Study Materials (AP Biology Syllabus, Textbook, Past Papers 2022-2025)
  - 10 Document Chunks with 64-dim pgvector embeddings
  - 5 Syllabus Topics & 20 Subtopics
  - 7 Past Paper Questions
  - 3 Historical Quiz Attempts (preserving baseline and progression checkpoints)
  - Knowledge Gap Diagnoses & 5-Day Revision Schedule

---

## Running the Application

```bash
# Install dependencies
npm install

# Run automated tests
npm test

# Run type check
npm run lint

# Start development server
npm run dev
```

Visit `http://localhost:3000` (or `http://localhost:3000?autostart=1` for instant demo access).

---

## Production Build

```bash
npm run build
npm start
```
