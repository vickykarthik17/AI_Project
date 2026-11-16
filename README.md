# GapFinder AI: Intelligent Learning Diagnosis Platform

GapFinder AI is a production-ready, full-stack educational diagnostic platform. It indexes authentic course syllabi, textbook chapters, and past examination papers to administer grounded diagnostic assessments, pinpoint subtopic misconceptions with explainable evidence, and generate adaptive daily revision schedules.

The platform is powered by Groq LPU inference (`llama-3.3-70b-versatile`), Google Gemini Embeddings (`text-embedding-004`), Vercel AI SDK, and a hybrid database layer supporting both zero-config SQLite and persistent Supabase PostgreSQL with `pgvector` and Row Level Security (RLS).

---

## Live Demo & Instant Access

- **Live Application**: [https://ai-project-ochre-three.vercel.app](https://ai-project-ochre-three.vercel.app)
- **1-Click Demo Evaluation**: Click the "Sign In with Demo Account (1-Click)" button on the home page.
- **Demo Credentials**:
  - **Email**: `demo@gapfinder.ai`
  - **Password**: `Demo@123`
- **Pre-Seeded Content**: Includes the complete AP Biology curriculum (3 indexed textbooks/papers, 16 topics and subtopics, 3 historical quiz attempts, and a 5-day adaptive revision plan).

---

## 1. What Makes GapFinder AI Different?

Traditional education platforms grade students with a flat percentage: "You scored 65%." That number tells a student how much they scored, but fails to answer three critical questions:
1. *Why* did they lose those marks?
2. *Which* foundational misconceptions caused repeated mistakes?
3. *What* exact study tasks should they complete today to fix those weaknesses before exam day?

GapFinder AI solves this by replacing flat scores with a closed-loop diagnostic learning engine:

- **Source-Grounded Questions**: Every quiz question is derived directly from verified textbook chunks. Questions cite the exact source document, chapter, section, and page number.
- **Dual-Layer Evaluation**: Objective questions (MCQs, True/False, Fill-in-the-Blank) are graded deterministically without token costs or latency. Descriptive short answers are evaluated by Groq AI against strict rubrics validated by Zod schemas.
- **Deterministic Knowledge Gap Diagnosis**: AI never fabricates grades or classifications. A deterministic engine computes topic accuracy, difficulty weighting, sample size confidence, and error trends into explainable categories: `Weak` (0-49%), `Medium` (50-74%), `Strong` (75-100%), or `Insufficient Evidence` (< 2 questions).
- **Dynamic Revision Planning**: Generates day-by-day revision tasks prioritized by weakness severity, real exam question frequency, and topic prerequisites. The plan dynamically shifts as the student improves.
- **AI Study Assistant with Conversation Memory**: Features token-by-token streaming, expandable verbatim source citation cards, and isolated per-student memory that tracks learning preferences and recurring struggles.

---

## 2. Key Engineering Highlights (For Evaluators & Recruiters)

| Category | Implementation Highlights |
| :--- | :--- |
| **Frontend Architecture** | React 19, TypeScript, Vite, Tailwind CSS, Lucide React, Recharts, and a custom React `ErrorBoundary` preventing blank-screen render failures. |
| **Backend & Runtime** | Express.js running on Node.js 22 LTS, bundled via esbuild into a self-contained serverless handler with instant cold-start response (< 15 ms). |
| **AI SDK & Models** | Vercel AI SDK (`ai`, `@ai-sdk/groq`, `zod`), Groq Cloud LPU (`llama-3.3-70b-versatile`), and Google Gemini Embedding 2 (`text-embedding-004`). |
| **Hybrid Database** | Dual-mode persistence: zero-config SQLite (with automatic fallback to a pure in-memory JavaScript engine) plus cloud Supabase PostgreSQL with `pgvector` and RLS. |
| **Serverless Reliability** | Stateless multi-container session authorization, headless DOM polyfills (`DOMMatrix`, `ImageData`, `Path2D`), and lazy dynamic module loading. |
| **Verification & QA** | 58 comprehensive automated tests covering RAG retrieval, ingestion, deterministic scoring, revision planning, and prompt-injection defenses. |

---

## 3. The 7-Step Closed-Loop Diagnostic Workflow

```
[ 1. UPLOAD ] ➔ [ 2. ANALYZE ] ➔ [ 3. TEST ] ➔ [ 4. DIAGNOSE ] ➔ [ 5. PLAN ] ➔ [ 6. RE-TEST ] ➔ [ 7. IMPROVE ]
  Syllabus &      Topic Map &       Grounded       Knowledge Gap     Adaptive Daily    Targeted 5-Q      Track Accuracy
  Textbooks       Past Papers       Quiz            Detection         Schedule          Mastery Check     Delta
```

1. **Upload Learning Materials**: The student uploads course syllabi, textbook chapters, class notes, or past examination papers (PDF, TXT, or MD format).
2. **Curriculum & Topic Map**: The system extracts units, chapters, topics, subtopics, and prerequisites, plotting them on an interactive visual tree with past-paper frequency counts.
3. **Take a Grounded Diagnostic Quiz**: The student configures a test by subject, topic, and difficulty. Questions appear one at a time with a countdown timer, question jump palette, and review flags.
4. **Inspect Knowledge Gap Report**: Following submission, the engine diagnoses mastery levels (`Weak`, `Medium`, `Strong`, or `Insufficient Evidence`) with clear explanations, recurring misconception tags, and textbook citations.
5. **Follow Adaptive Revision Plan**: The platform creates a prioritized daily study schedule matching the student's exam date and daily available study hours.
6. **Re-Test Specific Topics**: The student launches a targeted 5-question re-test focused exclusively on their weakest topics.
7. **Track Improvement & Trajectory**: When scores improve, the planner preserves completed work and shifts remaining hours toward other areas.

---

## 4. System Architecture in Detail

```
+-----------------------------------------------------------------------------------+
|                            REACT 19 SPA (VITE + TAILWIND)                         |
|  - AuthScreen (1-Click Demo)            - Topic Map View (Syllabus Hierarchy)     |
|  - Dashboard View (Overview Metrics)    - Diagnostic Quiz View (Exam Simulation)  |
|  - Knowledge Gap Report                 - Dynamic Revision Planner                |
|  - Grounded AI Study Assistant          - Progress Trajectory Analytics           |
+-----------------------------------------------------------------------------------+
                                          │
                                HTTP / SSE Stream
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
|               BACKEND API LAYER: EXPRESS.JS / VERCEL SERVERLESS                   |
|  - Normalized Body & URL Parser         - Headless DOMMatrix & Canvas Polyfills   |
|  - Stateless Session Authorization      - Vercel AI SDK Integration               |
|  - Deterministic Core Engine            - Ingestion & Smart Chunking Pipeline     |
|  - RAG Coordinator & Vector Search      - Dynamic Tool Execution                  |
+-----------------------------------------------------------------------------------+
                  │                                             │
                  ▼                                             ▼
+-----------------------------------+         +-------------------------------------+
|        AI INFERENCE ENGINES       |         |           DATA STORAGE LAYER        |
|  - Groq Cloud LPU                 |         |  - Primary: Zero-Config SQLite      |
|    (llama-3.3-70b-versatile)      |         |    (Native node:sqlite + pure JS)   |
|  - Google Gemini Embeddings       |         |  - Cloud Option: Supabase PostgreSQL|
|    (text-embedding-004, 64-dim)   |         |    (pgvector HNSW + RLS Policies)   |
+-----------------------------------+         +-------------------------------------+
```

### A. Document Ingestion and Headless PDF Processing
- **Validation**: Enforces file format constraints (.pdf, .txt, .md), validates file sizes up to 25 MB, and computes SHA-256 fingerprints to eliminate redundant processing.
- **Headless Compatibility**: Includes global polyfills for `DOMMatrix`, `ImageData`, and `Path2D` to prevent serverless container crashes in Linux Lambda environments.
- **Smart Semantic Chunking**: Detects chapter titles, section headers, and unit boundaries to create chunks between 120 and 220 words with a 20-word overlap.
- **Consistent Embeddings**: Every chunk is indexed with a 64-dimensional vector embedding for lightning-fast cosine similarity lookups.

### B. Retrieval-Augmented Generation (RAG) Pipeline
- **Strict Evidence Threshold**: Vector search queries require a minimum cosine similarity threshold of 0.60.
- **Hallucination Prevention**: If uploaded study materials do not contain relevant information, the system explicitly reports "Insufficient Evidence" rather than improvising.
- **Prompt Injection Defense**: Untrusted text extracted from user documents is sanitized before being passed into model prompts.

### C. Grounded Diagnostic Assessment Engine
- **Exam-Condition UI**: Features single-question pagination, countdown timers, marked-for-review flags, and automatic submission on expiration.
- **Deterministic vs. Semantic Grading**: Objective responses are evaluated deterministically in under 1 ms. Subjective short answers are evaluated by Groq AI against standard rubrics with structured Zod outputs.

### D. Adaptive Revision Planner
- **Prioritization Formula**: Ranks topics using an algorithmic score combining weakness severity (`Weak` topics score highest), real exam question frequency, and prerequisite chains.
- **Dynamic Reallocation**: As students re-test and improve, completed tasks are preserved while remaining study hours shift toward lingering gaps.

### E. AI Study Assistant with Conversation Memory
- **Streaming Responses**: Token-by-token streaming via the Vercel AI SDK and Server-Sent Events (SSE).
- **Verbatim Citations**: Cites document title, chapter, section, and page number for every claim.
- **Student Learning Memory**: Stores identified learning styles, mastered topics, and struggle points, strictly scoped to the authenticated student profile.

---

## 5. Security and Student Data Privacy

- **Per-Student SQLite Isolation**: All database operations include strict `WHERE user_id = ?` filters.
- **Row Level Security (RLS)**: When connected to Supabase PostgreSQL, all 15 relational tables enforce RLS policies verifying `auth.uid() = student_id`.
- **Credential Protection**: Administrative keys (`SUPABASE_SERVICE_ROLE_KEY`) are restricted to server-side operations and never exposed to client-side bundles.
- **Stateless Serverless Sessions**: Session tokens (`gf_sess_...`) resolve consistently across independent serverless Lambda containers, eliminating session dropouts.

---

## 6. Environment Configuration

Create a `.env` or `.env.local` file in your project root:

```bash
# Groq AI Inference (Required for live AI quiz generation and assistant streaming)
GROQ_API_KEY="gsk_your_groq_api_key_here"
GROQ_MODEL="llama-3.3-70b-versatile"

# Google Gemini Embeddings (Optional, enables live text-embedding-004 vector generation)
GEMINI_API_KEY="AIzaSy_your_gemini_api_key_here"

# Supabase PostgreSQL (Optional, automatically falls back to SQLite if omitted)
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"

# Server Port
PORT=3000
```

> **Zero-Config Default**: If Supabase or Gemini API keys are omitted, GapFinder AI seamlessly operates using its built-in SQLite engine and deterministic embedding generator. You can run and test the complete app immediately without configuring third-party accounts.

---

## 7. Running Locally

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Automated Test Suite (58 Tests)
```bash
npm test
```
The test suite validates the deterministic scoring engine, RAG retrieval, document ingestion, past paper intelligence, quiz evaluation, revision planning, AI SDK streaming, and conversation memory.

### 3. Verify TypeScript Types
```bash
npm run lint
```

### 4. Start the Development Server
```bash
npm run dev
```
Open your browser at `http://localhost:3000`.

---

## 8. Deployment Architecture (Vercel Serverless)

The application is structured for continuous deployment on Vercel:

- **Frontend**: Built via Vite into the `dist/` directory and served statically.
- **Backend**: `src/server/handler.ts` is bundled into `api/index.js` using esbuild with `--packages=external` and Node 22 LTS compatibility.
- **Routing Configuration (`vercel.json`)**:
  ```json
  {
    "buildCommand": "npm run build",
    "outputDirectory": "dist",
    "rewrites": [
      { "source": "/api/(.*)", "destination": "/api" },
      { "source": "/(.*)", "destination": "/index.html" }
    ]
  }
  ```

---

## 9. Technology Stack Summary

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide React, Recharts.
- **Backend**: Node.js 22 LTS, Express 4, esbuild, multer, pdf-parse.
- **AI Framework**: Vercel AI SDK v7 (`ai`, `@ai-sdk/groq`, `zod`).
- **AI Models**: Groq `llama-3.3-70b-versatile`, Google Gemini `text-embedding-004`.
- **Database**: Dual-engine support for SQLite (`node:sqlite` + pure JS store) and Supabase PostgreSQL (`pgvector` + RLS).
- **Hosting & CI/CD**: Vercel Serverless Functions + GitHub automated deployment.
