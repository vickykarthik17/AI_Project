import React, { useEffect, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Target,
} from 'lucide-react';
import { apiRequest } from '../api';
import { RevisionPlan, RevisionTask } from '../types';

interface RevisionPlannerViewProps {
  onNavigate: (tab: string, contextTopic?: string) => void;
}

export const RevisionPlannerView: React.FC<RevisionPlannerViewProps> = ({ onNavigate }) => {
  const [activePlan, setActivePlan] = useState<RevisionPlan | null>(null);
  const [historicalPlans, setHistoricalPlans] = useState<RevisionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Planner Input Form State
  const [examDate, setExamDate] = useState('2026-11-18');
  const [daysAvailable, setDaysAvailable] = useState(5);
  const [dailyHours, setDailyHours] = useState(2);
  const [prioritySubject, setPrioritySubject] = useState('Biology');
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | 'All'>('All');

  const loadPlans = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        activePlan: RevisionPlan | null;
        historicalPlans: RevisionPlan[];
      }>('/revision/plan');
      setActivePlan(res.activePlan);
      setHistoricalPlans(res.historicalPlans || []);
      if (res.activePlan) {
        setExamDate(res.activePlan.examDate);
        setDaysAvailable(res.activePlan.daysAvailable);
        setDailyHours(res.activePlan.dailyHours);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const handleGeneratePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await apiRequest<{
        activePlan: RevisionPlan;
        historicalPlans: RevisionPlan[];
      }>('/revision/generate', {
        method: 'POST',
        body: JSON.stringify({
          subject: prioritySubject,
          examDate,
          daysAvailable,
          dailyHours,
          prioritySubjects: [prioritySubject],
        }),
      });
      setActivePlan(res.activePlan);
      setHistoricalPlans(res.historicalPlans || []);
      setSelectedDayFilter('All');
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleTask = async (task: RevisionTask) => {
    const res = await apiRequest<{ activePlan: RevisionPlan }>(`/revision/tasks/${task.id}`, {
      method: 'PUT',
      body: JSON.stringify({ completed: !task.completed }),
    });
    setActivePlan(res.activePlan);
  };

  const tasks = activePlan?.tasks || [];
  const completedCount = tasks.filter((t) => t.completed).length;
  const completionPct = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  const daysList = Array.from(new Set(tasks.map((t) => t.dayNumber))).sort((a, b) => a - b);
  const visibleDays =
    selectedDayFilter === 'All'
      ? daysList
      : daysList.filter((d) => d === selectedDayFilter);

  return (
    <div className="space-y-6">
      {/* Adaptive Plan Generator Form */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Personalized & Adaptive Revision Planner
            </h2>
            <p className="text-xs text-slate-500">
              Prioritizes topics by: 1. Knowledge gap severity · 2. Past-paper frequency · 3. Syllabus weight · 4. Available time · 5. Prerequisites
            </p>
          </div>

          {activePlan && (
            <div className="text-right font-mono text-xs tabular-nums">
              <span className="font-bold text-indigo-700 block">
                Plan Version v{activePlan.version}
              </span>
              <span className="text-slate-500">
                Completed: {completedCount}/{tasks.length} tasks ({completionPct}%)
              </span>
            </div>
          )}
        </div>

        <form
          onSubmit={handleGeneratePlan}
          className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end"
        >
          <div>
            <label htmlFor="rev-exam-date" className="block text-xs font-semibold text-slate-700 mb-1">
              Target Examination Date
            </label>
            <input
              id="rev-exam-date"
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="rev-days" className="block text-xs font-semibold text-slate-700 mb-1">
              Days Available Before Exam
            </label>
            <input
              id="rev-days"
              type="number"
              min={1}
              max={14}
              value={daysAvailable}
              onChange={(e) => setDaysAvailable(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 font-mono"
            />
          </div>

          <div>
            <label htmlFor="rev-hours" className="block text-xs font-semibold text-slate-700 mb-1">
              Daily Study Hours
            </label>
            <input
              id="rev-hours"
              type="number"
              min={0.5}
              max={10}
              step={0.5}
              value={dailyHours}
              onChange={(e) => setDailyHours(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 font-mono"
            />
          </div>

          <div>
            <label htmlFor="rev-subject" className="block text-xs font-semibold text-slate-700 mb-1">
              Priority Subject
            </label>
            <input
              id="rev-subject"
              type="text"
              value={prioritySubject}
              onChange={(e) => setPrioritySubject(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
            />
          </div>

          <button
            type="submit"
            disabled={generating}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer h-[34px]"
          >
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Reprioritizing...
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                Generate / Update Plan
              </>
            )}
          </button>
        </form>
      </div>

      {/* What Changed Between Previous and Updated Revision Plans */}
      {activePlan && activePlan.changeSummary.length > 0 && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-950 p-5 text-white">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              Adaptive Plan Change Log (What Changed in Plan v{activePlan.version})
            </span>
            {historicalPlans.length > 0 && (
              <span className="text-xs font-mono text-indigo-300 flex items-center gap-1">
                <History className="h-3.5 w-3.5" />
                {historicalPlans.length} historical plan version(s) preserved
              </span>
            )}
          </div>
          <ul className="space-y-1.5 text-xs text-indigo-100">
            {activePlan.changeSummary.map((line, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Day Filter Tabs */}
      {daysList.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setSelectedDayFilter('All')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                selectedDayFilter === 'All'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All {daysList.length} Days
            </button>
            {daysList.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDayFilter(d)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  selectedDayFilter === d
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Day {d}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onNavigate('quiz')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F172A] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
          >
            <Play className="h-3.5 w-3.5" />
            Take Re-Test Quiz to Trigger Adaptive Plan Update
          </button>
        </div>
      )}

      {/* Structured Daily Schedule */}
      {loading ? (
        <div className="h-64 rounded-xl border border-slate-200 bg-white animate-pulse" />
      ) : !activePlan || tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center space-y-3">
          <Calendar className="h-10 w-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No Active Revision Plan</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Choose your target exam date and daily study hours in the form above, then click "Generate Adaptive Revision Plan" to build your prioritized daily schedule.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {visibleDays.map((dayNum) => {
            const dayTasks = tasks.filter((t) => t.dayNumber === dayNum);
            const totalDayMins = dayTasks.reduce((acc, t) => acc + t.durationMinutes, 0);
            const dateLabel = dayTasks[0]?.dateLabel || `Day ${dayNum}`;

            return (
              <div
                key={dayNum}
                className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Calendar className="h-4 w-4 text-indigo-600" />
                    <h3 className="text-base font-bold text-slate-900">{dateLabel}</h3>
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-600 tabular-nums">
                    Total Daily Allocation: {totalDayMins} minutes ({(totalDayMins / 60).toFixed(1)}h)
                  </span>
                </div>

                <div className="space-y-3">
                  {dayTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`rounded-lg border p-4 transition-colors ${
                        task.completed
                          ? 'border-emerald-200 bg-emerald-50/30'
                          : 'border-slate-200 bg-white hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <input
                          id={`plan-task-${task.id}`}
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => handleToggleTask(task)}
                          aria-label={`Mark "${task.title}" as completed`}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />

                        <div className="flex-1 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label
                              htmlFor={`plan-task-${task.id}`}
                              className={`text-sm font-bold cursor-pointer ${
                                task.completed
                                  ? 'line-through text-slate-500'
                                  : 'text-slate-900'
                              }`}
                            >
                              {task.title}
                            </label>

                            <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                              <span className="inline-flex items-center gap-1 text-slate-600">
                                <Clock className="h-3.5 w-3.5 text-indigo-600" />
                                {task.durationMinutes} min
                              </span>
                              <span
                                className={`font-bold ${
                                  task.priorityLevel === 'Critical'
                                    ? 'text-red-600'
                                    : task.priorityLevel === 'High'
                                    ? 'text-amber-600'
                                    : 'text-indigo-600'
                                }`}
                              >
                                Priority: {task.priorityLevel}
                              </span>
                            </div>
                          </div>

                          <div className="text-xs text-slate-500">
                            <strong className="text-slate-700">Why Scheduled:</strong>{' '}
                            {task.reasonForInclusion}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                            <div className="rounded-md bg-slate-50 p-2.5 border border-slate-200/70">
                              <span className="font-semibold text-slate-800 block mb-1">
                                Learning Objectives:
                              </span>
                              <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                                {task.learningObjectives.map((obj, i) => (
                                  <li key={i}>{obj}</li>
                                ))}
                              </ul>
                            </div>

                            <div className="rounded-md bg-slate-50 p-2.5 border border-slate-200/70">
                              <span className="font-semibold text-slate-800 block mb-1">
                                Targeted Practice Prompts:
                              </span>
                              <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                                {task.practicePrompts.map((pr, i) => (
                                  <li key={i}>{pr}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
