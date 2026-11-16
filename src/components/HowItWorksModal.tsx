import React from 'react';
import {
  Activity,
  Brain,
  CheckCircle2,
  Database,
  FileSearch,
  FileUp,
  Layers,
  RefreshCw,
  Sparkles,
  Target,
  X,
} from 'lucide-react';

interface HowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PIPELINE_STEPS = [
  {
    step: '01',
    title: 'Material Ingestion',
    role: 'Ingestion Layer',
    description:
      'Student uploads syllabi, textbook chapters, lecture notes, and past examination papers (PDF or TXT). Files are validated and isolated per student account.',
    icon: FileUp,
  },
  {
    step: '02',
    title: 'Semantic Chunking',
    role: 'Document Parser',
    description:
      'Documents are segmented into meaningful passages while preserving exact source metadata: Document Name, Page Number, Chapter, Section, and Topic.',
    icon: Layers,
  },
  {
    step: '03',
    title: 'Vector Embedding',
    role: 'Groq RAG Embedding',
    description:
      'Each chunk is converted into a high-dimensional semantic vector using Groq RAG Embeddings and stored in the persistent SQLite vector index.',
    icon: Database,
  },
  {
    step: '04',
    title: 'RAG Semantic Retrieval',
    role: 'Retrieval Layer (No Hallucination)',
    description:
      'When generating a quiz or answering a question, the retrieval engine searches only the student uploaded material and returns top-matching source chunks with metadata.',
    icon: FileSearch,
  },
  {
    step: '05',
    title: 'Grounded Generation',
    role: 'LLM Generation Layer',
    description:
      'Groq LLM (llama-3.3-70b-versatile) generates diagnostic questions and explanations strictly from the retrieved passages, attaching clickable page and section citations to every item.',
    icon: Sparkles,
  },
  {
    step: '06',
    title: 'Semantic Answer Evaluation',
    role: 'Assessment Layer',
    description:
      'Objective and short-answer responses are evaluated against textbook evidence, awarding partial credit where appropriate and explaining specific misconceptions.',
    icon: CheckCircle2,
  },
  {
    step: '07',
    title: 'Knowledge Gap Diagnosis',
    role: 'Deterministic Scoring Engine',
    description:
      'Performance is aggregated by topic and subtopic using transparent rules: 0-49% Weak, 50-74% Medium, 75-100% Strong, or Insufficient evidence (<2 questions).',
    icon: Activity,
  },
  {
    step: '08',
    title: 'Prioritized Revision Planning',
    role: 'Planning Engine',
    description:
      'Topics are ranked by gap severity, past-paper exam frequency, syllabus weight, and prerequisite dependencies to build a daily schedule.',
    icon: Target,
  },
  {
    step: '09',
    title: 'Adaptive Re-Testing Loop',
    role: 'Continuous Improvement',
    description:
      'Every new diagnostic quiz recalculates topic mastery, identifies newly improved areas, and generates an updated revision plan with a clear change log.',
    icon: RefreshCw,
  },
];

export const HowItWorksModal: React.FC<HowItWorksModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="how-it-works-title"
    >
      <div className="my-8 w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-950 text-white">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <h2 id="how-it-works-title" className="text-lg font-bold text-slate-900">
                How GapFinder AI Works
              </h2>
              <p className="text-xs text-slate-600">
                Transparent 9-stage RAG retrieval, deterministic gap scoring, and adaptive revision architecture
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close How GapFinder AI Works modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          {PIPELINE_STEPS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-mono font-bold text-indigo-700">STEP {item.step}</span>
                    <span>{item.role}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-indigo-600 shrink-0" />
                    <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-900 p-4 text-white">
          <h3 className="text-sm font-bold">
            Architectural Separation of Responsibilities
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-4 text-xs sm:grid-cols-5">
            <div>
              <div className="font-semibold text-indigo-300">1. RAG Retrieval</div>
              <p className="mt-1 text-slate-300">
                Finds relevant textbook passages and page numbers; never generates answers itself.
              </p>
            </div>
            <div>
              <div className="font-semibold text-indigo-300">2. LLM Generation</div>
              <p className="mt-1 text-slate-300">
                Produces grounded questions and explanations strictly from retrieved evidence.
              </p>
            </div>
            <div>
              <div className="font-semibold text-indigo-300">3. Answer Evaluation</div>
              <p className="mt-1 text-slate-300">
                Measures student understanding with semantic grading and partial marks.
              </p>
            </div>
            <div>
              <div className="font-semibold text-indigo-300">4. Gap Analysis</div>
              <p className="mt-1 text-slate-300">
                Calculates Weak (0-49%), Medium (50-74%), Strong (75-100%) from real attempt data.
              </p>
            </div>
            <div>
              <div className="font-semibold text-indigo-300">5. Adaptive Planning</div>
              <p className="mt-1 text-slate-300">
                Converts diagnosis + past-paper frequency into prioritized daily tasks.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
