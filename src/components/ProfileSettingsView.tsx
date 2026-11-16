import React, { useState } from 'react';
import { CheckCircle2, Database, HelpCircle, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../api';
import { User } from '../types';

interface ProfileSettingsViewProps {
  user: User;
  onUserUpdated: (user: User) => void;
  onOpenHowItWorks: () => void;
}

export const ProfileSettingsView: React.FC<ProfileSettingsViewProps> = ({
  user,
  onUserUpdated,
  onOpenHowItWorks,
}) => {
  const [name, setName] = useState(user.name);
  const [targetExam, setTargetExam] = useState(
    user.targetExam || 'National Advanced Biology Examination'
  );
  const [examDate, setExamDate] = useState(user.examDate || '2026-11-18');
  const [dailyHours, setDailyHours] = useState(user.dailyHours || 2.0);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{ user: User }>('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ name, targetExam, examDate, dailyHours }),
      });
      onUserUpdated(res.user);
      setStatusMsg('Student profile and study preferences saved to SQLite database.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDemo = async () => {
    setResetting(true);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{ message: string }>('/auth/reset-demo', {
        method: 'POST',
      });
      setStatusMsg(res.message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Student Profile & Examination Preferences
          </h2>
          <p className="text-xs text-slate-500">
            Manage your target examination parameters and persistent account settings
          </p>
        </div>

        {statusMsg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label htmlFor="prof-name" className="block text-xs font-semibold text-slate-700 mb-1">
              Student Name
            </label>
            <input
              id="prof-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="prof-email" className="block text-xs font-semibold text-slate-700 mb-1">
              Account Email (Isolated Tenant Identifier)
            </label>
            <input
              id="prof-email"
              type="email"
              value={user.email}
              disabled
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 font-mono"
            />
          </div>

          <div>
            <label htmlFor="prof-exam" className="block text-xs font-semibold text-slate-700 mb-1">
              Target Examination
            </label>
            <input
              id="prof-exam"
              type="text"
              value={targetExam}
              onChange={(e) => setTargetExam(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="prof-date" className="block text-xs font-semibold text-slate-700 mb-1">
                Target Exam Date
              </label>
              <input
                id="prof-date"
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor="prof-hours"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Daily Study Hours Budget
              </label>
              <input
                id="prof-hours"
                type="number"
                step={0.5}
                min={0.5}
                max={12}
                value={dailyHours}
                onChange={(e) => setDailyHours(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 cursor-pointer"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving Preferences...' : 'Save Profile Settings'}
          </button>
        </form>
      </div>

      {/* Right Column: Architecture & Demo Data Reset */}
      <div className="lg:col-span-5 space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Security, Isolation & RAG Architecture
            </h3>
          </div>
          <ul className="space-y-2 text-xs text-slate-600">
            <li>· Server-side Groq LPU API & Groq RAG Embedding calls only (GROQ_API_KEY secure)</li>
            <li>· SQLite WAL persistent database with PostgreSQL-ready repository abstraction</li>
            <li>· Strict per-student query scoping and scrypt password hashing</li>
            <li>· Prompt-injection isolation tags around uploaded document chunks</li>
          </ul>
          <button
            type="button"
            onClick={onOpenHowItWorks}
            className="w-full mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 cursor-pointer"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            View 9-Stage AI Architecture Pipeline
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Judge & Evaluator Demo Data Controls
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Restore the pre-seeded Biology demonstration dataset (3 materials, 10 indexed chunks, 5
            syllabus topics, 7 past-paper questions, 3 quiz attempts, and 5-day revision plan) at
            any time.
          </p>
          <button
            type="button"
            onClick={handleResetDemo}
            disabled={resetting}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${resetting ? 'animate-spin' : ''}`} />
            {resetting ? 'Restoring Demo Data...' : 'Reset Demo Biology Dataset'}
          </button>
        </div>
      </div>
    </div>
  );
};
