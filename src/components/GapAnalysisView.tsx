import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { apiRequest } from '../api';
import { Citation, KnowledgeStatus, TopicGapDiagnosis } from '../types';

interface GapAnalysisViewProps {
  onInspectCitation: (citation: Citation) => void;
  onNavigate: (tab: string, contextTopic?: string) => void;
}

export const GapAnalysisView: React.FC<GapAnalysisViewProps> = ({
  onInspectCitation,
  onNavigate,
}) => {
  const [diagnoses, setDiagnoses] = useState<TopicGapDiagnosis[]>([]);
  const [statusFilter, setStatusFilter] = useState<'All' | KnowledgeStatus>('All');
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  const loadGapReport = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ diagnoses: TopicGapDiagnosis[] }>('/analysis/report');
      setDiagnoses(res.diagnoses);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGapReport();
  }, []);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const res = await apiRequest<{ diagnoses: TopicGapDiagnosis[] }>('/analysis/generate', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setDiagnoses(res.diagnoses);
    } finally {
      setRecalculating(false);
    }
  };

  const filtered =
    statusFilter === 'All'
      ? diagnoses
      : diagnoses.filter((d) => d.status === statusFilter);

  const weakCount = diagnoses.filter((d) => d.status === 'Weak').length;
  const mediumCount = diagnoses.filter((d) => d.status === 'Medium').length;
  const strongCount = diagnoses.filter((d) => d.status === 'Strong').length;
  const insufficientCount = diagnoses.filter((d) => d.status === 'Insufficient evidence').length;

  return (
    <div className="space-y-6">
      {/* Primary Intelligence Layer Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="text-xs font-semibold text-indigo-600">
              Primary Diagnostic Output · Explainable Topic-Level Knowledge Classification
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">
              Topic-Level Knowledge Gap Report
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleRecalculate}
              disabled={recalculating}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${recalculating ? 'animate-spin' : ''}`} />
              Recalculate Diagnosis
            </button>
            <button
              type="button"
              onClick={() => onNavigate('revision')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 cursor-pointer"
            >
              Open Adaptive Revision Plan
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Transparent Classification Legend & Status Filter Tabs */}
        <div className="mt-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto max-w-full">
            {(
              [
                { id: 'All', label: `All Topics (${diagnoses.length})` },
                { id: 'Weak', label: `Weak 0-49% (${weakCount})` },
                { id: 'Medium', label: `Medium 50-74% (${mediumCount})` },
                { id: 'Strong', label: `Strong 75-100% (${strongCount})` },
                {
                  id: 'Insufficient evidence',
                  label: `Insufficient Evidence (${insufficientCount})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-500">
            Scoring Method: Difficulty-weighted accuracy + repeated subtopic mistake tracking
          </div>
        </div>
      </div>

      {/* Topic Diagnosis Cards */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-44 rounded-xl border border-slate-200 bg-white animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center space-y-3">
          <Activity className="h-10 w-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">
            {diagnoses.length === 0 ? 'No Knowledge Gaps Diagnosed Yet' : 'No Topics Matching Filter'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {diagnoses.length === 0
              ? 'Complete a Diagnostic Quiz to measure your topic accuracy, identify misconceptions, and generate explainable knowledge gap classifications.'
              : 'Try selecting a different filter tab above to view other topics.'}
          </p>
          {diagnoses.length === 0 && (
            <button
              type="button"
              onClick={() => onNavigate('quiz')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 cursor-pointer"
            >
              Take First Diagnostic Quiz
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((diag) => {
            const isWeak = diag.status === 'Weak';
            const isMedium = diag.status === 'Medium';
            const isStrong = diag.status === 'Strong';

            return (
              <div
                key={diag.id}
                className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <div className="text-xs text-slate-500">
                      {diag.subject} · {diag.unitName} · Priority Score: {diag.priorityScore}/100
                      {diag.isSample ? ' · Sample Data' : ''}
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <h3 className="text-lg font-bold text-slate-900">{diag.topicName}</h3>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-bold ${
                          isWeak
                            ? 'text-red-600'
                            : isMedium
                            ? 'text-amber-600'
                            : isStrong
                            ? 'text-emerald-600'
                            : 'text-slate-500'
                        }`}
                      >
                        {isWeak && <ShieldAlert className="h-4 w-4" />}
                        {isMedium && <AlertTriangle className="h-4 w-4" />}
                        {isStrong && <CheckCircle2 className="h-4 w-4" />}
                        {!isWeak && !isMedium && !isStrong && <HelpCircle className="h-4 w-4" />}
                        Status: {diag.status}
                      </span>
                    </div>
                  </div>

                  {/* Numeric Metrics */}
                  <div className="flex items-center gap-6 text-right font-mono tabular-nums">
                    <div>
                      <span className="block text-[11px] font-sans text-slate-500">Accuracy</span>
                      <span
                        className={`text-xl font-extrabold ${
                          isWeak
                            ? 'text-red-600'
                            : isMedium
                            ? 'text-amber-600'
                            : isStrong
                            ? 'text-emerald-600'
                            : 'text-slate-600'
                        }`}
                      >
                        {diag.accuracyPercent}%
                      </span>
                    </div>
                    <div>
                      <span className="block text-[11px] font-sans text-slate-500">Evidence</span>
                      <span className="text-sm font-bold text-slate-900">
                        {diag.questionsAttempted} Qs ({diag.correctCount}✓ / {diag.incorrectCount}✗)
                      </span>
                    </div>
                    <div>
                      <span className="block text-[11px] font-sans text-slate-500">Confidence</span>
                      <span className="text-sm font-bold text-indigo-700">
                        {diag.confidenceLevel}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Diagnosis Reason & Recommended Action */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-1">
                    <span className="font-bold text-slate-900 block">
                      Diagnosed Misconceptions & Error Pattern:
                    </span>
                    <p className="text-slate-700 leading-relaxed">{diag.commonMistakesReason}</p>
                  </div>

                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-4 space-y-1">
                    <span className="font-bold text-indigo-950 block">
                      Recommended Corrective Action:
                    </span>
                    <p className="text-indigo-900 leading-relaxed">{diag.recommendedAction}</p>
                  </div>
                </div>

                {/* Citations & Quick Actions */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-xs">
                  <div className="flex flex-wrap items-center gap-3 text-slate-500">
                    <span>Past-Paper Frequency: {diag.pastPaperFrequency} questions</span>
                    {diag.citations.map((cit) => (
                      <button
                        key={cit.chunkId}
                        type="button"
                        onClick={() => onInspectCitation(cit)}
                        className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline cursor-pointer"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        {cit.documentName} (Page {cit.pageNumber}, {cit.section})
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigate('assistant', diag.topicName)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                      Explain Topic
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('quiz', diag.topicName)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#0F172A] px-3.5 py-1.5 font-semibold text-white hover:bg-slate-800 cursor-pointer"
                    >
                      Re-Test {diag.topicName}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
