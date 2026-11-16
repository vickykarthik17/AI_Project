# GapFinder AI - Comprehensive Documentation

Welcome to the complete documentation for GapFinder AI. This guide explains how the platform works, the thinking behind its design, and how every technical component fits together to help students master their subjects.

---

## 1. What is GapFinder AI?

Most traditional learning platforms evaluate students with a simple percentage score: "You got 70%." While this number tells a student how much they scored, it does not tell them *why* they lost marks, *which* fundamental concepts they missed, or *what* exact steps they should take today to fix those gaps before exam day.

GapFinder AI transforms this experience. Instead of treating test scores as a final verdict, it acts as an intelligent diagnostic partner:

- It reads real textbooks, syllabi, and past exam papers uploaded by students.
- It generates diagnostic quizzes with questions grounded in verified textbook passages.
- It grades student responses using a combination of deterministic rules (for objective questions) and semantic AI evaluation (for short answers).
- It runs a deterministic gap analysis engine to classify topic mastery (Weak, Medium, Strong, or Insufficient Evidence) without letting AI hallucinate grades.
- It builds an adaptive, day-by-day revision schedule that reorganizes itself as the student improves.
- It provides an interactive AI Study Assistant with live streaming responses that cite the exact textbook page, chapter, and section for every claim.

---

## 2. The Student Learning Journey

The student workflow in GapFinder AI follows six continuous phases:

1. **Upload Study Materials**: The student uploads their course syllabus, textbook chapters, class notes, or past exam papers (PDF or text).
2. **Review Syllabus & Topic Map**: The system identifies the curriculum structure, topics, subtopics, and prerequisites, showing an interactive visual topic map.
3. **Take a Diagnostic Quiz**: The student selects a subject, chooses specific topics or difficulty levels, and completes a timed assessment with one question presented at a time.
4. **Inspect the Knowledge Gap Report**: After submission, the engine reveals which concepts are solid and which need urgent attention, accompanied by exact citations and mistake explanations.
5. **Follow the Dynamic Revision Plan**: The platform creates a prioritized daily study plan tailored to the student's exam date and available hours.
6. **Chat with the AI Study Assistant**: Whenever a concept feels tricky, the student asks the assistant, which explains difficult ideas, reviews past mistakes, and streams grounded answers token by token.

---

## 3. Core Features in Detail

### A. Document Ingestion and Smart Chunking

When a student uploads a study document, the system processes it through a multi-stage ingestion pipeline:

- **Validation**: Checks file formats (.pdf, .txt, .md), enforces size limits (up to 25MB), and computes a SHA-256 fingerprint to prevent redundant processing.
- **Text Extraction**: Reads text page by page to maintain exact 1-based page numbers. It strips out non-printable control characters, normalizes whitespace, and preserves clean structure.
- **Smart Chunking**: Rather than splitting text at arbitrary character boundaries, the chunker detects section headings, chapters, and units. It creates chunks between 120 and 220 words with a 20-word overlap to keep context intact.
- **Embedding Generation**: Every chunk is converted into a 64-dimensional vector using Google Gemini Embedding 2 (`text-embedding-004`).
- **Vector Indexing**: Chunks are stored in the database with their embedding vector, document title, page number, chapter, and section metadata.

### B. Retrieval-Augmented Generation (RAG)

GapFinder AI guarantees that every quiz question and AI explanation is grounded in the student's actual study material:

- When a quiz is generated or a question is asked in the assistant, the system creates an embedding of the query.
- It performs a cosine similarity search against stored document chunks using pgvector (or local vector math in SQLite mode).
- Chunks that pass the relevance threshold (minimum cosine similarity of 0.60) are supplied as grounded context.
- If no chunks pass the threshold, the system explicitly tells the student that the uploaded materials do not contain sufficient evidence, preventing hallucinated answers.

### C. Diagnostic Assessment Engine

Students can configure diagnostic quizzes based on their immediate study needs:

- **Configurable Parameters**: Subject, specific topics, difficulty level (Easy, Medium, Hard), question count, and time duration.
- **Supported Question Formats**:
  - Multiple Choice Questions (MCQs)
  - True or False
  - Fill in the Blanks
  - Semantic Short Answers
- **Complete Question Metadata**: Every question contains a unique identifier, question prompt, difficulty, maximum marks, correct answer, explanatory rubric, and exact source references (document name, page number, chapter, and section).
- **Exam-Condition UI**: Questions appear one at a time with a countdown timer, previous/next buttons, a question jump palette, mark-for-review flags, and automatic submission when time expires. Answers and explanations are concealed until the test is submitted.

### D. Core Intelligence Engine & Semantic Answer Evaluation

A key design principle of GapFinder AI is that **AI never arbitrarily assigns grades or classifications**. The evaluation combines two complementary layers:

1. **Deterministic Grading for Objective Questions**:
   - MCQs, True/False, and Fill-in-the-Blank answers are evaluated with deterministic normalization (trimming whitespace, case normalization, and exact string matching).
   - This ensures 100% mathematical consistency without token costs or model latency.

2. **Semantic Rubric Evaluation for Short Answers**:
   - When a student writes a descriptive answer, the system sends the question prompt, reference answer, student answer, and textbook evidence to Groq (`llama-3.3-70b-versatile`) via the Vercel AI SDK.
   - The model returns a structured JSON payload validated against a strict Zod schema:
     - `correctness`: Boolean flag indicating conceptual correctness.
     - `awarded_marks`: Exact marks earned between 0 and maximum marks.
     - `missing_concepts`: Key conceptual elements omitted by the student.
     - `explanation`: Constructive feedback explaining the score.
     - `evidence_used`: Direct quotes from the textbook supporting the grading.

### E. Deterministic Knowledge Gap Diagnosis

After each completed quiz, the engine updates the student's topic performance:

- **Performance Thresholds**:
  - `Weak`: 0% to 49% accuracy
  - `Medium`: 50% to 74% accuracy
  - `Strong`: 75% to 100% accuracy
  - `Insufficient Evidence`: Assigned when a student has answered fewer than 2 questions on a topic, prompting them to take a deeper quiz.
- **Confidence Scoring**: Combines sample size, question difficulty weightings, and consistency across multiple attempts.
- **Error Pattern Tracking**: Identifies recurring misconceptions and trends across historical quiz attempts.
- **Actionable Advice**: For every topic, the report outlines the current status, accuracy percentage, attempted questions, correct vs. incorrect answers, detected misconceptions, and clear corrective steps.

### F. Dynamic Revision Planner

Once weaknesses are diagnosed, the platform generates a personalized daily revision schedule:

- **Inputs**: Target examination date, total available study days, daily study hours, and subject priorities.
- **Prioritization Formula**:
  - Weakness Severity (Weak topics receive highest priority)
  - Past Exam Question Frequency (Topics that appear often in real exams receive elevated weight)
  - Topic Prerequisites (Foundational concepts are scheduled before advanced dependent topics)
  - Available Study Time
- **Daily Activities**: Each day features clear, actionable tasks including concept reviews, practice question sets, and misconception corrections with estimated completion times.
- **Adaptive Updates**: When a student takes a new quiz and shows improvement (for example, moving from 35% Weak to 68% Medium in Cellular Respiration), the planner recalculates priorities, leaves completed tasks intact, and shifts remaining study hours toward remaining weak areas.

### G. Interactive AI Study Assistant

The study assistant is a grounded companion that works alongside the student:

- **Grounded Chat**: Answers are derived strictly from the student's uploaded textbooks and notes.
- **Streaming Responses**: Token-by-token streaming powered by the Vercel AI SDK and Server-Sent Events (SSE), providing immediate responsiveness with a live Stop button.
- **Source Citation Cards**: Every grounded response displays expandable cards showing the exact source document, chapter, section, and page number.
- **Safe AI Tool Calling**: The assistant can call internal tools to help the student:
  - `searchUploadedDocuments`: Searches the student's indexed materials.
  - `fetchTopicPerformance`: Retrieves their latest topic scores and weakness levels.
  - `fetchPreviousMistakes`: Pulls specific questions the student got wrong in past quizzes.
  - All tools are strictly session-scoped to the authenticated student ID.
- **Contextual Shortcuts**: One-click actions to explain weakest topics, generate practice questions, review past mistakes, and test weak areas.

---

## 4. Technical Architecture

GapFinder AI is built on a clean modern stack with clear separation of concerns:

```
[ Frontend: React 19 + TypeScript + Tailwind CSS ]
                       │
             HTTP / SSE Stream
                       │
                       ▼
[ Backend API: Express.js / Vercel Serverless Function ]
   ├── Authentication & Session Validation
   ├── Vercel AI SDK Integration (ai, @ai-sdk/groq, zod)
   ├── Ingestion & PDF Parser Service
   ├── Deterministic Core Intelligence Engine
   └── RAG Retrieval Coordinator
           │                           │
           ▼                           ▼
[ Groq Cloud LPU ]          [ Database Layer ]
 llama-3.3-70b-versatile    - Primary: Supabase PostgreSQL (pgvector + RLS)
 Fast Inference Engine      - Fallback: Local SQLite with vector cosine search
```

### Key Libraries and Versions
- **Frontend**: React 19, Vite, Tailwind CSS, Lucide React, Recharts.
- **AI Framework**: Vercel AI SDK v7 (`ai`, `@ai-sdk/groq`, `zod`).
- **Embeddings**: Google Gemini Embedding 2 (`@google/genai`, `text-embedding-004`).
- **Database Clients**: `@supabase/supabase-js`, `better-sqlite3`.
- **Server**: Express 4, `tsx` for high-performance TypeScript runtime execution.

---

## 5. Database Schema & Entities

The database comprises 15 relational tables designed for security, integrity, and scalability:

1. `students`: User accounts linked directly to Supabase Auth (`auth.users`).
2. `subjects`: Academic subjects tracked for each student (such as Biology, Chemistry, Mathematics).
3. `documents`: Uploaded study materials with processing status, page count, and storage path.
4. `document_chunks`: Extracted text sections with 64-dimensional vector embeddings and chapter/section metadata.
5. `topics`: Curriculum topics with weightings, prerequisites, and past-exam frequency.
6. `subtopics`: Granular sub-concepts attached to parent topics.
7. `past_paper_questions`: Real past examination questions mapped to curriculum topics.
8. `quizzes`: Generated diagnostic tests with configurations, duration, and status.
9. `quiz_questions`: Individual questions tied to a quiz with answer options, rubrics, and source citations.
10. `student_answers`: Submitted answers, awarded marks, evaluation explanations, and missing concepts.
11. `topic_performance`: Aggregated accuracy rates, question counts, and mistake patterns per topic.
12. `gap_reports`: High-level diagnostic reports with classification (Weak, Medium, Strong, Insufficient Evidence).
13. `revision_plans`: Master revision plans linked to exam targets and available study time.
14. `revision_tasks`: Daily actionable study tasks with completion checkboxes and duration estimates.
15. `progress_history`: Historical snapshots of student progress over time across successive quizzes.

---

## 6. Security and Student Privacy

- **Row Level Security (RLS)**: When running with Supabase PostgreSQL, all tables enforce policies ensuring that `auth.uid() = student_id`. A student can never view, edit, or delete another student's materials, quizzes, or scores.
- **Service Role Protection**: The administrative `SUPABASE_SERVICE_ROLE_KEY` is kept strictly on the backend server for migrations and provisioning. It is never sent to the client browser.
- **Input Sanitization & Context Disarming**: Text retrieved from uploaded documents is disarmed before injection into AI prompts to prevent prompt injection attacks.
- **Isolated AI Tools**: Model tools strictly enforce session student ID checks, preventing the model from querying data across tenant boundaries.

---

## 7. Environment Configuration

The application is configured using environment variables. Create a `.env.local` or `.env` file in the project root:

```bash
# Groq AI Inference
GROQ_API_KEY="gsk_your_groq_api_key_here"
GROQ_MODEL="llama-3.3-70b-versatile"

# Google Gemini Embeddings (Optional, enables live Gemini vector generation)
GEMINI_API_KEY="AIzaSy_your_gemini_api_key_here"

# Supabase PostgreSQL (Optional, falls back to local SQLite if omitted)
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"

# Server Port
PORT=3000
```

> **Note on Storage Modes**: If Supabase credentials are not supplied, GapFinder AI automatically activates its local SQLite database (`gapfinder.db`) with full vector search and demo data. You can start developing immediately without configuring cloud services.

---

## 8. Getting Started Locally

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Automated Verification Tests
```bash
npm test
```
The test suite validates RAG retrieval, ingestion logic, mathematical scoring, short-answer evaluations, revision planning, and Vercel AI SDK integration across 55 tests.

### 3. Verify TypeScript Types
```bash
npm run lint
```

### 4. Start the Development Server
```bash
npm run dev
```

Open `http://localhost:3000` in your browser. You can click the demo credentials on the login screen to sign in instantly as `demo@gapfinder.ai` with pre-loaded study materials, diagnostic quizzes, and gap reports.

---

## 9. Production Build and Deployment

### Standard Node.js Production Build
```bash
npm run build
npm start
```

### Deploying to Vercel
GapFinder AI includes built-in Vercel serverless support:
- `vercel.json`: Routes all API calls to the serverless entrypoint and serves the Vite frontend bundle.
- `api/index.ts`: The serverless handler wrapping the Express application for Vercel functions.

To deploy:
1. Push your repository to GitHub.
2. Import the project into Vercel.
3. Add your environment variables (`GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`) in the Vercel project settings.
4. Deploy with one click.

---

## 10. Summary of Key Benefits

- **Transparency**: Every diagnosis explains the evidence and reasoning behind the rating.
- **Speed**: Powered by Groq LPU hardware, generating quizzes and evaluation feedback in seconds.
- **Reliability**: Deterministic math handles classifications and objective grades, eliminating AI hallucination.
- **Adaptability**: Revision plans automatically adjust as students learn and improve.
- **Grounding**: All questions, citations, and assistant answers link directly back to verified study materials.
