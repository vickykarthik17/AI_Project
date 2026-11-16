import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Clock,
  FileCheck2,
  HelpCircle,
  Play,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest } from '../api';
import { Citation, DiagnosticQuiz, RevisionTask, TopicGapDiagnosis } from '../types';

interface DashboardViewProps {
  onNavigate: (tab: string, contextTopic?: string) => void;
  onInspectCitation: (citation: Citation) => void;
  onOpenHowItWorks: () => void;
}

interface DashboardData {
  overview: {
    totalSubjects: number;
    topicsAssessed: number;
    totalTopics: number;
    weakCount: number;
    mediumCount: number;
    strongCount: number;
    insufficientCount: number;
    avgDiagnosticScore: number;
    studyHoursCompleted: number;
  };
  diagnoses: TopicGapDiagnosis[];
  topWeakTopics: TopicGapDiagnosis[];
  incompleteTasks: RevisionTask[];
  recentQuizzes: DiagnosticQuiz[];
  improvementComparison: {
    previousAttempt: { id: string; title: string; accuracyPercent: number; completedAt?: string } | null;
    latestAttempt: { id: string; title: string; accuracyPercent: number; completedAt?: string } | null;
    deltaPercent: number;
  };
  recommendedNextStep: {
    topicName: string;
    subject: string;
    status: string;
    accuracyPercent: number;
    reason: string;
    action: string;
  } | null;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onInspectCitation,
  onOpenHowItWorks,
}) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<DashboardData>('/analytics/dashboard');
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleToggleTask = async (taskId: string, currentCompleted: boolean) => {
    try {
      await apiRequest(`/revision/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: !currentCompleted }),
      });
      await loadDashboard();
    } catch (err: any) {
      setError(err.message || 'Could not update task status.');
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-24 rounded-xl border border-slate-200 bg-white p-4 animate-pulse" />
          ))}
        </div>
        <div className="h-80 rounded-xl border border-slate-200 bg-white p-6 animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        <p className="font-semibold">Error loading student dashboard</p>
        <p className="mt-1">{error}</p>
        <button
          type="button"
          onClick={loadDashboard}
          className="mt-3 rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  const {
    overview,
    diagnoses,
    incompleteTasks,
    recentQuizzes,
    improvementComparison,
    recommendedNextStep,
  } = data;

  const statusColor = (status: string) => {
    if (status === 'Weak') return '#DC2626';
    if (status === 'Medium') return '#D97706';
    if (status === 'Strong') return '#16A34A';
    return '#64748B';
  };

  const attemptChartData = [...recentQuizzes]
    .reverse()
    .map((q, idx) => ({
      name: `Attempt ${idx + 1}`,
      title: q.title,
      score: q.accuracyPercent,
    }));

  return (
    <div className="space-y-6">
      {/* Workflow Header Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-slate-500">
            Active Diagnostic Loop · UPLOAD → ANALYZE → TEST → DIAGNOSE → PLAN → RE-TEST → IMPROVE
          </div>
          <h2 className="mt-1 text-xl font-bold text-slate-900">
            Student Learning Diagnosis Overview
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenHowItWorks}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <HelpCircle className="h-3.5 w-3.5 text-indigo-600" />
            How GapFinder AI Works
          </button>
          <button
            type="button"
            onClick={() => onNavigate('quiz')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="h-3.5 w-3.5" />
            Take Diagnostic Quiz
          </button>
        </div>
      </div>

      {/* 6 Overview Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-medium text-slate-500 block">Total Subjects</span>
          <span className="mt-2 block text-2xl font-extrabold text-slate-900 font-mono tabular-nums">
            {overview.totalSubjects}
          </span>
          <span className="mt-1 block text-xs text-slate-500">Biology active</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-medium text-slate-500 block">Topics Assessed</span>
          <span className="mt-2 block text-2xl font-extrabold text-slate-900 font-mono tabular-nums">
            {overview.topicsAssessed} / {overview.totalTopics}
          </span>
          <span className="mt-1 block text-xs text-slate-500">100% syllabus mapped</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-medium text-red-700 block">Weak Topics (0-49%)</span>
          <span className="mt-2 block text-2xl font-extrabold text-red-600 font-mono tabular-nums">
            {overview.weakCount}
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            {overview.mediumCount} Medium (50-74%)
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-medium text-emerald-700 block">Strong Topics (75%+)</span>
          <span className="mt-2 block text-2xl font-extrabold text-emerald-600 font-mono tabular-nums">
            {overview.strongCount}
          </span>
          <span className="mt-1 block text-xs text-slate-500">Verified mastery</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-medium text-slate-500 block">Avg Diagnostic Score</span>
          <span className="mt-2 block text-2xl font-extrabold text-slate-900 font-mono tabular-nums">
            {overview.avgDiagnosticScore}%
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            Across {recentQuizzes.length} attempts
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-medium text-slate-500 block">Study Hours Completed</span>
          <span className="mt-2 block text-2xl font-extrabold text-indigo-700 font-mono tabular-nums">
            {overview.studyHoursCompleted}h
          </span>
          <span className="mt-1 block text-xs text-slate-500">Revision + Quizzes</span>
        </div>
      </div>

      {/* Recommended Next Step + Improvement Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {recommendedNextStep && (
          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-[#0F172A] p-6 text-white flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs text-indigo-300">
                <span className="font-semibold flex items-center gap-1.5">
                  <Target className="h-4 w-4 text-indigo-400" />
                  Recommended Next Step
                </span>
                <span className="font-mono tabular-nums">
                  Current Status: {recommendedNextStep.status} ({recommendedNextStep.accuracyPercent}%)
                </span>
              </div>
              <h3 className="mt-2 text-xl font-bold text-white">
                Revise {recommendedNextStep.topicName} ({recommendedNextStep.subject})
              </h3>
              <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                <strong className="text-white">Diagnosis Reason:</strong> {recommendedNextStep.reason}
              </p>
              <p className="mt-2 text-xs text-indigo-200 leading-relaxed">
                <strong className="text-white">Action Plan:</strong> {recommendedNextStep.action}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('quiz', recommendedNextStep.topicName)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-400 cursor-pointer"
              >
                Re-Test {recommendedNextStep.topicName}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('assistant', recommendedNextStep.topicName)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                Explain Weakest Topic with RAG
              </button>
            </div>
          </div>
        )}

        {/* Your Improvement Comparison */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                Your Improvement
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('progress')}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Full Progress Analytics
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Comparison between your previous and latest diagnostic assessments
            </p>

            {improvementComparison.latestAttempt ? (
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200">
                  <span className="text-xs text-slate-500 block">Previous Attempt</span>
                  <span className="mt-1 block text-xl font-bold text-slate-800 font-mono tabular-nums">
                    {improvementComparison.previousAttempt
                      ? `${improvementComparison.previousAttempt.accuracyPercent}%`
                      : 'N/A'}
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-500 truncate">
                    {improvementComparison.previousAttempt?.title || 'First baseline quiz'}
                  </span>
                </div>

                <div className="rounded-lg bg-emerald-50/60 p-3.5 border border-emerald-200">
                  <span className="text-xs text-emerald-800 block">Latest Attempt</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-xl font-bold text-emerald-700 font-mono tabular-nums">
                      {improvementComparison.latestAttempt.accuracyPercent}%
                    </span>
                    {improvementComparison.previousAttempt && (
                      <span className="text-xs font-mono font-bold text-emerald-700 tabular-nums">
                        {improvementComparison.deltaPercent >= 0 ? '+' : ''}
                        {improvementComparison.deltaPercent}%
                      </span>
                    )}
                  </div>
                  <span className="mt-1 block text-[11px] text-emerald-800 truncate">
                    {improvementComparison.latestAttempt.title}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg bg-slate-50 p-4 text-xs text-slate-600">
                Complete your first diagnostic quiz to measure baseline accuracy and improvement.
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Weak topics: {overview.weakCount}</span>
            <span>·</span>
            <span>Medium topics: {overview.mediumCount}</span>
            <span>·</span>
            <span>Strong topics: {overview.strongCount}</span>
          </div>
        </div>
      </div>

      {/* Visualizations Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Topic-wise Knowledge Distribution Chart */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Topic-Wise Knowledge Diagnosis Breakdown
              </h3>
              <p className="text-xs text-slate-500">
                Red: Weak (0-49%) · Amber: Medium (50-74%) · Green: Strong (75-100%)
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('gaps')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              Inspect Gap Report
            </button>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={diagnoses}
                layout="vertical"
                margin={{ top: 5, right: 24, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: '#475569' }}
                />
                <YAxis
                  type="category"
                  dataKey="topicName"
                  width={125}
                  tick={{ fontSize: 12, fill: '#0F172A', fontWeight: 600 }}
                />
                <Tooltip
                  formatter={(value: any, _name: any, props: any) => [
                    `${value}% (${props.payload.status})`,
                    'Diagnostic Accuracy',
                  ]}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="accuracyPercent" radius={[0, 6, 6, 0]} barSize={22}>
                  {diagnoses.map((entry) => (
                    <Cell key={entry.id} fill={statusColor(entry.status)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Performance Over Multiple Quiz Attempts */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Performance Across Quiz Attempts
              </h3>
              <p className="text-xs text-slate-500">
                Diagnostic accuracy trajectory over time
              </p>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={attemptChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: '#475569' }}
                />
                <Tooltip
                  formatter={(value: any) => [`${value}%`, 'Overall Score']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#4F46E5"
                  strokeWidth={2.5}
                  dot={{ r: 5, fill: '#4F46E5' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom 3 Sections: Your Knowledge Gaps, Continue Learning, Recent Assessments */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Your Knowledge Gaps */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Your Knowledge Gaps
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('gaps')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              View All ({diagnoses.length})
            </button>
          </div>

          <div className="space-y-3">
            {diagnoses.slice(0, 4).map((gap) => (
              <div
                key={gap.id}
                className="rounded-lg border border-slate-200 p-3.5 hover:bg-slate-50/70 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900">{gap.topicName}</span>
                  <span
                    className={`text-xs font-mono font-bold tabular-nums ${
                      gap.status === 'Weak'
                        ? 'text-red-600'
                        : gap.status === 'Medium'
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {gap.status} · {gap.accuracyPercent}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600 line-clamp-2">
                  {gap.commonMistakesReason}
                </p>
                <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                  <span>
                    Evidence: {gap.questionsAttempted} Qs ({gap.incorrectCount} incorrect) · Confidence: {gap.confidenceLevel}
                  </span>
                  {gap.citations[0] && (
                    <button
                      type="button"
                      onClick={() => onInspectCitation(gap.citations[0])}
                      className="font-semibold text-indigo-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <BookOpen className="h-3 w-3" />
                      Page {gap.citations[0].pageNumber}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Continue Learning (Incomplete Revision Tasks) */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-600" />
              Continue Learning
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('revision')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              Revision Planner
            </button>
          </div>

          <div className="space-y-3">
            {incompleteTasks.length === 0 ? (
              <div className="rounded-lg bg-emerald-50 p-4 text-xs text-emerald-800">
                All scheduled revision tasks are complete! Generate a new adaptive plan or take a
                re-test quiz.
              </div>
            ) : (
              incompleteTasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-lg border border-slate-200 p-3 flex items-start gap-3"
                >
                  <input
                    id={`dash-task-${task.id}`}
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => handleToggleTask(task.id, task.completed)}
                    aria-label={`Mark "${task.title}" as completed`}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <label
                      htmlFor={`dash-task-${task.id}`}
                      className="text-xs font-bold text-slate-900 block cursor-pointer"
                    >
                      {task.title}
                    </label>
                    <div className="mt-1 text-[11px] text-slate-500 font-mono tabular-nums">
                      {task.dateLabel} · {task.durationMinutes} min · Priority: {task.priorityLevel}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Assessments */}
        <div className="lg:col-span-3 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-indigo-600" />
              Recent Assessments
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('quiz')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              New Quiz
            </button>
          </div>

          <div className="space-y-3">
            {recentQuizzes.map((qz) => (
              <div
                key={qz.id}
                className="rounded-lg border border-slate-200 p-3 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 line-clamp-1">
                    {qz.title}
                  </span>
                  <span
                    className={`text-xs font-mono font-bold tabular-nums shrink-0 ${
                      qz.accuracyPercent < 50
                        ? 'text-red-600'
                        : qz.accuracyPercent < 75
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {qz.accuracyPercent}%
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-mono tabular-nums">
                    Score: {qz.totalScore}/{qz.maxScore}
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigate('quiz', `review:${qz.id}`)}
                    className="font-semibold text-indigo-600 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                  >
                    Inspect
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
