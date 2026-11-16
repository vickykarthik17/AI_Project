import React, { useEffect, useState } from 'react';
import { ArrowUpRight, CheckCircle2, TrendingDown, TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest } from '../api';
import { TopicGapDiagnosis } from '../types';

interface TopicTrajectory {
  topicName: string;
  subject: string;
  attempts: Array<{
    attemptNumber: number;
    quizTitle: string;
    date: string;
    accuracyPercent: number;
  }>;
  initialStatus: string;
  currentStatus: string;
  currentAccuracy: number;
  deltaPercent: number;
}

interface ProgressData {
  attemptHistory: Array<{
    attemptNumber: number;
    id: string;
    title: string;
    subject: string;
    accuracyPercent: number;
    totalScore: number;
    maxScore: number;
    durationSeconds: number;
    completedAt: string;
  }>;
  topicTrajectories: TopicTrajectory[];
  revisionCompletionRate: number;
  completedTasks: number;
  totalTasks: number;
  improvedTopics: TopicGapDiagnosis[];
  declinedTopics: TopicGapDiagnosis[];
}

export const ProgressAnalyticsView: React.FC = () => {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [topicFilter, setTopicFilter] = useState<string>('All');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiRequest<ProgressData>('/analytics/progress');
        setData(res);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading || !data) {
    return <div className="h-80 rounded-xl border border-slate-200 bg-white animate-pulse" />;
  }

  const filteredTrajectories =
    topicFilter === 'All'
      ? data.topicTrajectories
      : data.topicTrajectories.filter((t) => t.topicName === topicFilter);

  const chartData = data.attemptHistory.map((a) => ({
    name: `Attempt ${a.attemptNumber}`,
    title: a.title,
    accuracy: a.accuracyPercent,
    date: new Date(a.completedAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
  }));

  return (
    <div className="space-y-6">
      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <span className="text-xs text-slate-500 block">Total Diagnostic Attempts</span>
          <span className="mt-1 block text-2xl font-extrabold text-slate-900 font-mono tabular-nums">
            {data.attemptHistory.length}
          </span>
          <span className="mt-1 block text-xs text-slate-500">Historical attempts preserved</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <span className="text-xs text-slate-500 block">Overall Score Trajectory</span>
          <span className="mt-1 block text-2xl font-extrabold text-emerald-600 font-mono tabular-nums">
            {data.attemptHistory.length >= 2
              ? `${data.attemptHistory[0].accuracyPercent}% → ${
                  data.attemptHistory[data.attemptHistory.length - 1].accuracyPercent
                }%`
              : `${data.attemptHistory[0]?.accuracyPercent || 0}%`}
          </span>
          <span className="mt-1 block text-xs text-slate-500">Baseline to Latest Attempt</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <span className="text-xs text-slate-500 block">Revision Completion Rate</span>
          <span className="mt-1 block text-2xl font-extrabold text-indigo-700 font-mono tabular-nums">
            {data.revisionCompletionRate}%
          </span>
          <span className="mt-1 block text-xs text-slate-500 font-mono tabular-nums">
            {data.completedTasks} of {data.totalTasks} tasks completed
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <span className="text-xs text-slate-500 block">Topics Improved</span>
          <span className="mt-1 block text-2xl font-extrabold text-emerald-600 font-mono tabular-nums">
            {data.improvedTopics.length}
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            {data.declinedTopics.length} needing immediate review
          </span>
        </div>
      </div>

      {/* Overall Score Improvement Chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-bold text-slate-900">
          Historical Diagnostic Score Progression
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Tracks every completed diagnostic assessment without overwriting historical records
        </p>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 24, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#0F172A', fontWeight: 600 }} />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11, fill: '#475569' }}
              />
              <Tooltip
                formatter={(v: any, _n: any, props: any) => [
                  `${v}% (${props.payload.title})`,
                  'Accuracy',
                ]}
                contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
              />
              <Line
                type="monotone"
                dataKey="accuracy"
                stroke="#4F46E5"
                strokeWidth={3}
                dot={{ r: 6, fill: '#4F46E5' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Topic-Level Accuracy Trends Across Attempts */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Topic-Level Accuracy Trajectories & Status Transitions
            </h3>
            <p className="text-xs text-slate-500">
              Tracks how each syllabus topic evolved across Attempt 1, Attempt 2, and Attempt 3+
            </p>
          </div>

          <select
            aria-label="Filter by topic"
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
          >
            <option value="All">All Syllabus Topics</option>
            {data.topicTrajectories.map((t) => (
              <option key={t.topicName} value={t.topicName}>
                {t.topicName}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTrajectories.map((traj) => (
            <div
              key={traj.topicName}
              className="rounded-lg border border-slate-200 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{traj.topicName}</h4>
                  <span className="text-xs text-slate-500">
                    Status Transition: <strong>{traj.initialStatus}</strong> →{' '}
                    <strong
                      className={
                        traj.currentStatus === 'Weak'
                          ? 'text-red-600'
                          : traj.currentStatus === 'Medium'
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      }
                    >
                      {traj.currentStatus}
                    </strong>
                  </span>
                </div>

                <div className="text-right font-mono tabular-nums">
                  <span className="text-base font-extrabold text-slate-900 block">
                    {traj.currentAccuracy}%
                  </span>
                  <span
                    className={`inline-flex items-center gap-0.5 text-xs font-bold ${
                      traj.deltaPercent >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {traj.deltaPercent >= 0 ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    {traj.deltaPercent >= 0 ? '+' : ''}
                    {traj.deltaPercent}%
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs font-mono tabular-nums">
                {traj.attempts.map((att) => (
                  <div
                    key={att.attemptNumber}
                    className="rounded bg-slate-50 px-2.5 py-1 border border-slate-200"
                  >
                    Attempt {att.attemptNumber}: <strong>{att.accuracyPercent}%</strong>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
