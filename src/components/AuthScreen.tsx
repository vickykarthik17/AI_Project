import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  Brain,
  CheckCircle2,
  HelpCircle,
  Lock,
  Mail,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import { apiRequest, setStoredToken } from '../api';
import { User } from '../types';
import { HowItWorksModal } from './HowItWorksModal';

interface AuthScreenProps {
  onAuthenticated: (user: User) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register' && !name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload =
        mode === 'login'
          ? { email: email.trim(), password }
          : { name: name.trim(), email: email.trim(), password };

      const res = await apiRequest<{ token: string; user: User }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setStoredToken(res.token);
      onAuthenticated(res.user);
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError(null);
    setEmail('demo@gapfinder.ai');
    setPassword('Demo@123');
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'demo@gapfinder.ai', password: 'Demo@123' }),
      });
      setStoredToken(res.token);
      onAuthenticated(res.user);
    } catch (err: any) {
      setError(err.message || 'Demo login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      {/* Top Bar Contract: 3 zones */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-200 bg-white">
        <a
          href="/"
          className="text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 flex items-center gap-2.5"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F172A] text-white">
            <Brain className="h-4 w-4 text-indigo-400" />
          </span>
          <span>GapFinder AI</span>
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setShowHowItWorks(true)}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Architecture
          </button>
          <a
            href="#workflow"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Diagnostic Workflow
          </a>
          <a
            href="#grounding"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            RAG Grounding
          </a>
          <a
            href="#demo-access"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Demo Access
          </a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0"
          >
            Launch Demo Account
          </button>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl px-6 py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left column: Value Proposition & Diagnostic Cycle */}
        <div className="lg:col-span-7 space-y-8">
          <div className="space-y-4">
            <div className="text-xs font-semibold text-indigo-700">
              Intelligent Learning Diagnosis Platform · RAG-Grounded Assessment Engine
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.12]">
              Find What the Student Doesn't Know.
            </h1>
            <p className="text-base text-slate-600 max-w-2xl leading-relaxed">
              GapFinder AI is not a generic study chatbot. It indexes your actual syllabus,
              textbook chapters, and past examination papers to administer grounded diagnostic
              assessments, pinpoint subtopic misconceptions, and build adaptive daily revision
              plans.
            </p>
          </div>

          {/* Central Workflow Loop */}
          <div id="workflow" className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-900">
                Closed-Loop Diagnostic Workflow
              </span>
              <button
                type="button"
                onClick={() => setShowHowItWorks(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                How GapFinder AI Works
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center">
              {[
                { step: '1. UPLOAD', desc: 'Syllabus & PDFs' },
                { step: '2. ANALYZE', desc: 'Topic Map & RAG' },
                { step: '3. TEST', desc: 'Grounded Quiz' },
                { step: '4. DIAGNOSE', desc: 'Gap Detection' },
                { step: '5. PLAN', desc: 'Daily Schedule' },
                { step: '6. RE-TEST', desc: 'Verify Mastery' },
                { step: '7. IMPROVE', desc: 'Track Delta' },
              ].map((item) => (
                <div
                  key={item.step}
                  className="rounded-lg bg-slate-50 p-2.5 border border-slate-200/80"
                >
                  <div className="text-[11px] font-bold text-indigo-950 font-mono whitespace-nowrap">
                    {item.step}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 whitespace-nowrap">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Key Capabilities */}
          <div id="grounding" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
                <BookOpenCheck className="h-4 w-4 text-indigo-600 shrink-0" />
                Verifiable RAG Source Citations
              </div>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Every generated quiz question, gap diagnosis, and study explanation cites the exact
                document, chapter, page number, and section. Click any citation to inspect the
                verbatim source passage.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
                <Sparkles className="h-4 w-4 text-indigo-600 shrink-0" />
                Explainable Knowledge Gap Engine
              </div>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Classifies topics into Weak (0-49%), Medium (50-74%), Strong (75-100%), or
                Insufficient evidence based on accuracy, difficulty weighting, and repeated
                subtopic mistakes.
              </p>
            </div>
          </div>
        </div>

        {/* Right column: Login / Registration Card + Prominent Demo Account Box */}
        <div className="lg:col-span-5 space-y-5">
          {/* Demo Credentials Card for Judges */}
          <div
            id="demo-access"
            className="rounded-xl border border-indigo-200 bg-indigo-950 p-5 text-white shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-mono text-indigo-300">
                  INSTANT JUDGE & EVALUATOR ACCESS
                </span>
                <h2 className="mt-1 text-base font-bold text-white">
                  Explore Pre-Seeded Biology Demo Account
                </h2>
                <p className="mt-1 text-xs text-indigo-200 leading-relaxed">
                  Includes indexed Biology syllabus, textbook chapters, 2022-2025 past paper
                  questions, 3 historical quiz attempts, topic gap report, and a 5-day adaptive
                  revision plan.
                </p>
              </div>
            </div>

            <div className="mt-3.5 grid grid-cols-2 gap-2 rounded-lg bg-indigo-900/70 p-3 text-xs font-mono border border-indigo-800">
              <div>
                <span className="text-indigo-300 block text-[11px]">Email</span>
                <span className="font-semibold text-white">demo@gapfinder.ai</span>
              </div>
              <div>
                <span className="text-indigo-300 block text-[11px]">Password</span>
                <span className="font-semibold text-white">Demo@123</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={loading}
              className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-xs font-bold text-indigo-950 hover:bg-indigo-50 transition-colors cursor-pointer"
            >
              <span>Sign In with Demo Account (1-Click)</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {/* Standard Login / Register Form */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-5">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
                  mode === 'login'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Student Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
                  mode === 'register'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create Student Account
              </button>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label
                    htmlFor="auth-name"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      id="auth-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Priya Nair"
                      className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Student Email Address
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="demo@gapfinder.ai"
                    className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#0F172A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading
                  ? 'Authenticating...'
                  : mode === 'login'
                  ? 'Sign In to Dashboard'
                  : 'Register & Start Diagnosis'}
              </button>
            </form>

            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Per-student SQLite data isolation
              </span>
              <span>Scrypt password hashing</span>
            </div>
          </div>
        </div>
      </main>

      <HowItWorksModal isOpen={showHowItWorks} onClose={() => setShowHowItWorks(false)} />
    </div>
  );
};
