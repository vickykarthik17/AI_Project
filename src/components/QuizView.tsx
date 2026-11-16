import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Flag,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { apiRequest } from '../api';
import {
  Citation,
  DiagnosticQuiz,
  DifficultyLevel,
  QuestionType,
  TopicNode,
} from '../types';

interface QuizViewProps {
  initialTopicOrQuizId?: string;
  onInspectCitation: (citation: Citation) => void;
  onNavigate: (tab: string, context?: string) => void;
}

export const QuizView: React.FC<QuizViewProps> = ({
  initialTopicOrQuizId,
  onInspectCitation,
  onNavigate,
}) => {
  const [topics, setTopics] = useState<TopicNode[]>([]);
  const [pastQuizzes, setPastQuizzes] = useState<DiagnosticQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generator config state
  const [subject, setSubject] = useState('Biology');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [questionCount, setQuestionCount] = useState(5);
  const [difficulty, setDifficulty] = useState<DifficultyLevel | 'Mixed'>('Mixed');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(15);
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([
    'MCQ',
    'TrueFalse',
    'FillBlank',
    'ShortAnswer',
  ]);

  // Active assessment runner state
  const [activeQuiz, setActiveQuiz] = useState<DiagnosticQuiz | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const loadQuizData = async () => {
    setLoading(true);
    try {
      const [tRes, qRes] = await Promise.all([
        apiRequest<{ topics: TopicNode[] }>('/topics'),
        apiRequest<{ quizzes: DiagnosticQuiz[] }>('/quiz'),
      ]);
      setTopics(tRes.topics);
      setPastQuizzes(qRes.quizzes);

      if (initialTopicOrQuizId?.startsWith('review:')) {
        const targetId = initialTopicOrQuizId.replace('review:', '');
        const found = qRes.quizzes.find((q) => q.id === targetId);
        if (found) {
          startOrResumeQuiz(found);
        }
      } else if (initialTopicOrQuizId) {
        setSelectedTopics([initialTopicOrQuizId]);
      } else {
        setSelectedTopics(tRes.topics.map((t) => t.topicName));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load quiz module.');
    } finally {
      setLoading(false);
    }
  };

  const startOrResumeQuiz = (quiz: DiagnosticQuiz) => {
    setActiveQuiz(quiz);
    setCurrentIndex(0);
    setShowSubmitConfirm(false);

    if (quiz.status === 'InProgress') {
      const savedDraft = localStorage.getItem(`gapfinder_draft_${quiz.id}`);
      let restoredAnswers: Record<string, string> = {};
      let restoredTime = quiz.timeLimitMinutes * 60;

      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (parsed.answers) restoredAnswers = parsed.answers;
          if (typeof parsed.remainingSeconds === 'number' && parsed.remainingSeconds > 0) {
            restoredTime = parsed.remainingSeconds;
          }
        } catch {}
      } else if (quiz.answers && quiz.answers.length > 0) {
        for (const ans of quiz.answers) {
          if (ans.studentResponse && ans.studentResponse !== '(Unanswered)') {
            restoredAnswers[ans.questionId] = ans.studentResponse;
          }
        }
      }

      setUserAnswers(restoredAnswers);
      setMarkedForReview({});
      setRemainingSeconds(restoredTime);
    }
  };

  useEffect(() => {
    loadQuizData();
  }, [initialTopicOrQuizId]);

  // Persist draft answers to localStorage whenever user answers or remaining time changes
  useEffect(() => {
    if (!activeQuiz || activeQuiz.status !== 'InProgress') return;
    localStorage.setItem(
      `gapfinder_draft_${activeQuiz.id}`,
      JSON.stringify({ answers: userAnswers, remainingSeconds })
    );
  }, [userAnswers, remainingSeconds, activeQuiz]);

  // Countdown timer for active InProgress quiz
  useEffect(() => {
    if (!activeQuiz || activeQuiz.status !== 'InProgress' || remainingSeconds <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleFinalSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeQuiz, remainingSeconds]);

  const toggleTopicSelection = (topicName: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topicName) ? prev.filter((t) => t !== topicName) : [...prev, topicName]
    );
  };

  const toggleQuestionType = (qType: QuestionType) => {
    setQuestionTypes((prev) => {
      if (prev.includes(qType)) {
        return prev.length > 1 ? prev.filter((t) => t !== qType) : prev;
      }
      return [...prev, qType];
    });
  };

  const handleGenerateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (selectedTopics.length === 0) {
      setError('Please select at least one syllabus topic to assess.');
      return;
    }

    setGenerating(true);
    try {
      const res = await apiRequest<{ quiz: DiagnosticQuiz }>('/quiz/generate', {
        method: 'POST',
        body: JSON.stringify({
          subject,
          topics: selectedTopics,
          questionCount,
          difficulty,
          timeLimitMinutes,
          questionTypes,
        }),
      });

      startOrResumeQuiz(res.quiz);
    } catch (err: any) {
      setError(err.message || 'Could not generate diagnostic quiz.');
    } finally {
      setGenerating(false);
    }
  };

  const handleFinalSubmit = async (autoExpired: boolean = false) => {
    if (!activeQuiz || submitting) return;
    setSubmitting(true);
    setShowSubmitConfirm(false);
    try {
      const totalAllowed = activeQuiz.timeLimitMinutes * 60;
      const elapsed = autoExpired ? totalAllowed : Math.max(15, totalAllowed - remainingSeconds);

      const res = await apiRequest<{ quiz: DiagnosticQuiz }>(`/quiz/${activeQuiz.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          answers: userAnswers,
          durationSeconds: elapsed,
        }),
      });

      localStorage.removeItem(`gapfinder_draft_${activeQuiz.id}`);
      setActiveQuiz(res.quiz);
      const qRes = await apiRequest<{ quizzes: DiagnosticQuiz[] }>('/quiz');
      setPastQuizzes(qRes.quizzes);
    } catch (err: any) {
      setError(err.message || 'Failed to submit quiz.');
      if (err.quiz) {
        setActiveQuiz(err.quiz);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  // ============================================================================
  // VIEW 1: INTERACTIVE EXAMINATION RUNNER (InProgress)
  // ============================================================================
  if (activeQuiz && activeQuiz.status === 'InProgress') {
    const currentQuestion = activeQuiz.questions[currentIndex];
    const totalQuestions = activeQuiz.questions.length;
    const answeredCount = Object.values(userAnswers).filter((v) => v && v.trim().length > 0).length;
    const isMarked = Boolean(markedForReview[currentQuestion.id]);

    return (
      <div className="space-y-6">
        {/* Top Assessment Bar */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-indigo-600">
              Grounded Diagnostic Assessment in Progress · Answers Hidden Until Submission
            </div>
            <h2 className="text-base font-bold text-slate-900 mt-0.5">{activeQuiz.title}</h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-mono font-bold text-slate-900 tabular-nums">
              <Clock className="h-4 w-4 text-indigo-600" />
              <span>Time Left: {formatTimer(remainingSeconds)}</span>
            </div>

            <button
              type="button"
              onClick={() => setShowSubmitConfirm(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 cursor-pointer"
            >
              Submit Assessment
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Question Card */}
          <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 text-xs text-slate-500">
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                Question {currentIndex + 1} of {totalQuestions}
              </span>
              <span>
                Topic: <strong className="text-slate-800">{currentQuestion.topic}</strong> ·{' '}
                {currentQuestion.subtopic} · Difficulty: {currentQuestion.difficulty} (
                {currentQuestion.maxMarks} {currentQuestion.maxMarks > 1 ? 'marks' : 'mark'})
              </span>
            </div>

            <div className="text-base font-semibold text-slate-900 leading-relaxed">
              {currentQuestion.questionText}
            </div>

            {/* Answer Input by Question Type */}
            <div className="space-y-3">
              {(currentQuestion.questionType === 'MCQ' ||
                currentQuestion.questionType === 'TrueFalse') &&
                (currentQuestion.options || ['True', 'False']).map((option, idx) => {
                  const selected = userAnswers[currentQuestion.id] === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() =>
                        setUserAnswers((prev) => ({ ...prev, [currentQuestion.id]: option }))
                      }
                      className={`w-full text-left rounded-lg border p-4 text-sm transition-colors flex items-start gap-3 cursor-pointer ${
                        selected
                          ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 font-semibold'
                          : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <span className="font-mono text-xs font-bold text-slate-400 mt-0.5">
                        {String.fromCharCode(65 + idx)}.
                      </span>
                      <span>{option}</span>
                    </button>
                  );
                })}

              {currentQuestion.questionType === 'FillBlank' && (
                <div>
                  <label
                    htmlFor="quiz-fill-blank"
                    className="block text-xs font-semibold text-slate-700 mb-2"
                  >
                    Type the missing term or concept:
                  </label>
                  <input
                    id="quiz-fill-blank"
                    type="text"
                    value={userAnswers[currentQuestion.id] || ''}
                    onChange={(e) =>
                      setUserAnswers((prev) => ({
                        ...prev,
                        [currentQuestion.id]: e.target.value,
                      }))
                    }
                    placeholder="Enter exact biological or technical term..."
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
              )}

              {currentQuestion.questionType === 'ShortAnswer' && (
                <div>
                  <label
                    htmlFor="quiz-short-answer"
                    className="block text-xs font-semibold text-slate-700 mb-2"
                  >
                    Write your structured explanation (evaluated semantically by Groq with partial marks):
                  </label>
                  <textarea
                    id="quiz-short-answer"
                    rows={4}
                    value={userAnswers[currentQuestion.id] || ''}
                    onChange={(e) =>
                      setUserAnswers((prev) => ({
                        ...prev,
                        [currentQuestion.id]: e.target.value,
                      }))
                    }
                    placeholder="Explain the mechanism clearly using concepts from your study material..."
                    className="w-full rounded-lg border border-slate-300 p-3.5 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Bottom Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() =>
                  setMarkedForReview((prev) => ({
                    ...prev,
                    [currentQuestion.id]: !prev[currentQuestion.id],
                  }))
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold cursor-pointer ${
                  isMarked
                    ? 'border-amber-400 bg-amber-50 text-amber-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Flag className="h-3.5 w-3.5" />
                {isMarked ? 'Marked for Review' : 'Mark for Review'}
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Previous
                </button>

                {currentIndex < totalQuestions - 1 ? (
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1))}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#0F172A] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                  >
                    Next Question
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSubmitConfirm(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                  >
                    Finish & Submit Quiz
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Question Navigation Palette */}
          <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Question Navigator</h3>
              <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                Answered: {answeredCount} / {totalQuestions}
              </p>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {activeQuiz.questions.map((q, idx) => {
                const hasAns = Boolean(userAnswers[q.id]?.trim());
                const rev = Boolean(markedForReview[q.id]);
                const isCurrent = idx === currentIndex;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    aria-label={`Go to Question ${idx + 1}`}
                    className={`h-10 rounded-lg font-mono text-xs font-bold border transition-colors cursor-pointer ${
                      isCurrent
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : rev
                        ? 'border-amber-400 bg-amber-50 text-amber-800'
                        : hasAns
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs text-slate-600">
              <div className="flex items-center justify-between">
                <span>Answered</span>
                <span className="font-mono font-semibold text-emerald-700">{answeredCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Unanswered</span>
                <span className="font-mono font-semibold text-slate-700">
                  {totalQuestions - answeredCount}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Marked for Review</span>
                <span className="font-mono font-semibold text-amber-700">
                  {Object.values(markedForReview).filter(Boolean).length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Confirmation Modal */}
        {showSubmitConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
              <h3 className="text-base font-bold text-slate-900">
                Confirm Diagnostic Assessment Submission
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                You have answered <strong>{answeredCount}</strong> out of{' '}
                <strong>{totalQuestions}</strong> questions. Submitting will evaluate your
                responses, attach textbook citations, and update your Knowledge Gap Report and
                Revision Plan.
              </p>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirm(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Return to Quiz
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleFinalSubmit(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  {submitting ? 'Evaluating Answers...' : 'Confirm & Evaluate Answers'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // VIEW 2: POST-SUBMISSION DIAGNOSTIC RESULTS & SOURCE CITATIONS
  // ============================================================================
  if (activeQuiz && activeQuiz.status === 'Completed') {
    const correctCount = activeQuiz.answers.filter((a) => a.isCorrect).length;
    const unansweredCount = activeQuiz.answers.filter(
      (a) => a.studentResponse === '(Unanswered)'
    ).length;
    const incorrectCount = activeQuiz.answers.length - correctCount - unansweredCount;

    // Group performance by topic
    const byTopic: Record<string, { earned: number; max: number; count: number }> = {};
    for (const ans of activeQuiz.answers) {
      const current = byTopic[ans.topic] || { earned: 0, max: 0, count: 0 };
      current.earned += ans.marksEarned;
      current.max += ans.maxMarks;
      current.count += 1;
      byTopic[ans.topic] = current;
    }

    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="text-xs font-semibold text-indigo-600">
                Diagnostic Assessment Evaluation Complete
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">{activeQuiz.title}</h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setActiveQuiz(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Configure New Quiz
              </button>
              <button
                type="button"
                onClick={() => onNavigate('gaps')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 cursor-pointer"
              >
                Inspect Updated Gap Analysis Report
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Summary KPI Strip */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-lg bg-slate-50 p-4 border border-slate-200">
              <span className="text-xs text-slate-500 block">Total Diagnostic Score</span>
              <span className="mt-1 block text-2xl font-extrabold text-slate-900 font-mono tabular-nums">
                {activeQuiz.totalScore} / {activeQuiz.maxScore} ({activeQuiz.accuracyPercent}%)
              </span>
            </div>
            <div className="rounded-lg bg-emerald-50/60 p-4 border border-emerald-200">
              <span className="text-xs text-emerald-800 block">Correct Answers</span>
              <span className="mt-1 block text-2xl font-extrabold text-emerald-700 font-mono tabular-nums">
                {correctCount}
              </span>
            </div>
            <div className="rounded-lg bg-red-50/60 p-4 border border-red-200">
              <span className="text-xs text-red-800 block">Incorrect Answers</span>
              <span className="mt-1 block text-2xl font-extrabold text-red-600 font-mono tabular-nums">
                {incorrectCount}
              </span>
            </div>
            <div className="rounded-lg bg-slate-50 p-4 border border-slate-200">
              <span className="text-xs text-slate-500 block">Unanswered Questions</span>
              <span className="mt-1 block text-2xl font-extrabold text-slate-700 font-mono tabular-nums">
                {unansweredCount}
              </span>
            </div>
          </div>

          {/* Topic-wise Breakdown inside Quiz */}
          <div className="mt-5">
            <h3 className="text-xs font-bold text-slate-700 mb-2">
              Topic-Wise Performance in This Assessment
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {Object.entries(byTopic).map(([tName, stats]) => {
                const pct = Math.round((stats.earned / Math.max(1, stats.max)) * 100);
                return (
                  <div
                    key={tName}
                    className="rounded-lg border border-slate-200 p-3 text-xs flex items-center justify-between"
                  >
                    <span className="font-semibold text-slate-800 truncate pr-2">{tName}</span>
                    <span
                      className={`font-mono font-bold tabular-nums ${
                        pct < 50
                          ? 'text-red-600'
                          : pct < 75
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Question-by-Question Evaluation & Verifiable Citations */}
        <div className="space-y-4">
          {activeQuiz.questions.map((q, idx) => {
            const ans = activeQuiz.answers.find((a) => a.questionId === q.id);
            const isCorrect = Boolean(ans?.isCorrect);
            return (
              <div
                key={q.id}
                className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    {isCorrect ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                    )}
                    <span className="font-bold text-slate-900">
                      Question {idx + 1} · {q.topic} ({q.subtopic})
                    </span>
                    <span className="text-slate-500">· Difficulty: {q.difficulty}</span>
                  </div>

                  <span
                    className={`font-mono font-bold tabular-nums ${
                      isCorrect ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    Marks Earned: {ans?.marksEarned ?? 0} / {q.maxMarks}
                  </span>
                </div>

                <p className="text-sm font-semibold text-slate-900">{q.questionText}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div
                    className={`rounded-lg p-3 border ${
                      isCorrect
                        ? 'border-emerald-200 bg-emerald-50/50 text-emerald-950'
                        : 'border-red-200 bg-red-50/50 text-red-950'
                    }`}
                  >
                    <span className="font-semibold block mb-1">Your Response:</span>
                    <span>{ans?.studentResponse || '(Unanswered)'}</span>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-900">
                    <span className="font-semibold block mb-1 text-slate-600">
                      Reference Answer:
                    </span>
                    <span>{q.correctAnswer}</span>
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 p-3.5 text-xs text-slate-700 leading-relaxed border border-slate-200/80">
                  <strong className="text-slate-900">Diagnostic Evaluation:</strong>{' '}
                  {ans?.evaluationExplanation || q.explanation}
                </div>

                {/* Clickable Source Citation */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-500">
                  <span>
                    Source: <strong className="text-slate-800">{q.citation.documentName}</strong> ·{' '}
                    {q.citation.chapter} · Page {q.citation.pageNumber} · Section:{' '}
                    {q.citation.section}
                  </span>
                  <button
                    type="button"
                    onClick={() => onInspectCitation(q.citation)}
                    className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline cursor-pointer"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Inspect Source Excerpt
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ============================================================================
  // VIEW 3: QUIZ CONFIGURATION & PAST ASSESSMENTS LIST
  // ============================================================================
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 7 Cols: Quiz Generator Config */}
      <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Configure Grounded Diagnostic Quiz
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Retrieves relevant passages from your uploaded study material using RAG and generates
            verifiable diagnostic questions
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleGenerateQuiz} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="quiz-subject"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Subject
              </label>
              <input
                id="quiz-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor="quiz-count"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Number of Questions
              </label>
              <select
                id="quiz-count"
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value={3}>3 Questions (Quick Check)</option>
                <option value={5}>5 Questions (Standard Diagnostic)</option>
                <option value={8}>8 Questions (Comprehensive)</option>
                <option value={10}>10 Questions (Full Exam Simulation)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="quiz-time"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Time Limit (Minutes)
              </label>
              <select
                id="quiz-time"
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value={5}>5 Minutes</option>
                <option value={10}>10 Minutes</option>
                <option value={15}>15 Minutes</option>
                <option value={20}>20 Minutes</option>
                <option value={30}>30 Minutes</option>
                <option value={45}>45 Minutes</option>
                <option value={60}>60 Minutes</option>
              </select>
            </div>
          </div>

          {/* Difficulty Selection */}
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-1.5">
              Difficulty Level
            </span>
            <div className="grid grid-cols-4 gap-2">
              {(['Mixed', 'Easy', 'Medium', 'Hard'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setDifficulty(lvl)}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    difficulty === lvl
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Question Types Selection */}
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-1.5">
              Question Formats
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { id: 'MCQ', label: 'Multiple Choice' },
                  { id: 'TrueFalse', label: 'True / False' },
                  { id: 'FillBlank', label: 'Fill in the Blank' },
                  { id: 'ShortAnswer', label: 'Short Answer' },
                ] as const
              ).map((qt) => {
                const active = questionTypes.includes(qt.id);
                return (
                  <button
                    key={qt.id}
                    type="button"
                    onClick={() => toggleQuestionType(qt.id)}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      active
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {qt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Topic Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-700">
                Select Topics to Assess ({selectedTopics.length} selected)
              </span>
              <button
                type="button"
                onClick={() =>
                  setSelectedTopics(
                    selectedTopics.length === topics.length ? [] : topics.map((t) => t.topicName)
                  )
                }
                className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
              >
                {selectedTopics.length === topics.length ? 'Clear All' : 'Select Entire Syllabus'}
              </button>
            </div>

            {topics.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
                No syllabus topics found. Please upload study materials in "My Study Materials" first to generate diagnostic quiz questions.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {topics.map((t) => {
                  const checked = selectedTopics.includes(t.topicName);
                  return (
                    <label
                      key={t.id}
                      className={`flex items-center justify-between rounded-lg border p-3 text-xs cursor-pointer transition-colors ${
                        checked
                          ? 'border-indigo-600 bg-indigo-50/50 text-slate-900 font-semibold'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTopicSelection(t.topicName)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                        />
                        <span>{t.topicName}</span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500">
                        {t.pastPaperFrequency} past Qs
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={generating || loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Retrieving Source Passages & Generating Grounded Quiz...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Start Grounded Diagnostic Quiz
              </>
            )}
          </button>
        </form>
      </div>

      {/* Right 5 Cols: Completed Quiz History & Instant Inspection */}
      <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Diagnostic Assessments History ({pastQuizzes.length})
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Resume ongoing assessments or click completed ones to inspect question evaluations, partial marks, and textbook citations
          </p>
        </div>

        <div className="space-y-3">
          {pastQuizzes.map((qz) => {
            const isInProgress = qz.status === 'InProgress';
            return (
              <div
                key={qz.id}
                className={`rounded-lg border p-4 transition-colors space-y-2 ${
                  isInProgress
                    ? 'border-indigo-300 bg-indigo-50/40 hover:bg-indigo-50/60'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">{qz.title}</span>
                    <span className="text-[11px] text-slate-500">
                      {qz.questions.length} Questions · {qz.difficulty} Difficulty
                      {qz.isSample ? ' · Sample Data' : ''}
                      {isInProgress ? ' · Assessment In Progress' : ''}
                    </span>
                  </div>
                  {isInProgress ? (
                    <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                      In Progress
                    </span>
                  ) : (
                    <span
                      className={`font-mono text-sm font-extrabold tabular-nums ${
                        qz.accuracyPercent < 50
                          ? 'text-red-600'
                          : qz.accuracyPercent < 75
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {qz.accuracyPercent}%
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  {isInProgress ? (
                    <span className="text-slate-500 font-mono text-[11px]">
                      {qz.timeLimitMinutes} min time limit
                    </span>
                  ) : (
                    <span className="text-slate-500 font-mono tabular-nums">
                      Score: {qz.totalScore} / {qz.maxScore}
                    </span>
                  )}
                  {isInProgress ? (
                    <button
                      type="button"
                      onClick={() => startOrResumeQuiz(qz)}
                      className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Resume Assessment
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveQuiz(qz)}
                      className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Inspect Evaluation & Citations
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
