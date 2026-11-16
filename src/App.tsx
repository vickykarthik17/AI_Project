import React, { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Brain,
  CalendarCheck,
  ClipboardCheck,
  FolderTree,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareCode,
  Settings,
  X,
} from 'lucide-react';
import { apiRequest, getStoredToken, setStoredToken } from './api';
import { AuthScreen } from './components/AuthScreen';
import { CitationModal } from './components/CitationModal';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GapAnalysisView } from './components/GapAnalysisView';
import { HowItWorksModal } from './components/HowItWorksModal';
import { MaterialsView } from './components/MaterialsView';
import { ProfileSettingsView } from './components/ProfileSettingsView';
import { ProgressAnalyticsView } from './components/ProgressAnalyticsView';
import { QuizView } from './components/QuizView';
import { RevisionPlannerView } from './components/RevisionPlannerView';
import { StudyAssistantView } from './components/StudyAssistantView';
import { TopicMapView } from './components/TopicMapView';
import { Citation, User } from './types';

type NavTab =
  | 'dashboard'
  | 'materials'
  | 'topics'
  | 'quiz'
  | 'gaps'
  | 'revision'
  | 'assistant'
  | 'progress'
  | 'settings';

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: React.ComponentType<any> }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'materials', label: 'My Study Materials', icon: BookOpen },
  { id: 'topics', label: 'Topic Map', icon: FolderTree },
  { id: 'quiz', label: 'Diagnostic Quiz', icon: ClipboardCheck },
  { id: 'gaps', label: 'Gap Analysis', icon: Activity },
  { id: 'revision', label: 'Revision Planner', icon: CalendarCheck },
  { id: 'assistant', label: 'AI Study Assistant', icon: MessageSquareCode },
  { id: 'progress', label: 'Progress Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Profile and Settings', icon: Settings },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const getInitialTab = (): NavTab => {
    const hash = window.location.hash.replace(/^#\/?/, '') as NavTab;
    return NAV_ITEMS.some((i) => i.id === hash) ? hash : 'dashboard';
  };

  const [activeTab, setActiveTab] = useState<NavTab>(getInitialTab);
  const [navContext, setNavContext] = useState<string | undefined>(undefined);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Modals
  const [inspectedCitation, setInspectedCitation] = useState<Citation | null>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '') as NavTab;
      if (NAV_ITEMS.some((i) => i.id === hash)) {
        setActiveTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const initSession = async () => {
      const params = new URLSearchParams(window.location.search);
      const autostart = params.get('autostart') === '1';
      const token = getStoredToken();

      if (token) {
        try {
          const res = await apiRequest<{ user: User }>('/auth/me');
          setUser(res.user);
          setAuthChecking(false);
          return;
        } catch {
          setStoredToken(null);
        }
      }

      if (autostart) {
        try {
          const res = await apiRequest<{ token: string; user: User }>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email: 'demo@gapfinder.ai', password: 'Demo@123' }),
          });
          setStoredToken(res.token);
          setUser(res.user);
        } catch {
          // Fall back to login screen
        }
      }

      setAuthChecking(false);
    };

    initSession();
  }, []);

  const handleNavigate = (tab: string, context?: string) => {
    setActiveTab(tab as NavTab);
    setNavContext(context);
    setMobileNavOpen(false);
    window.location.hash = tab;
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout network error
    }
    setStoredToken(null);
    setUser(null);
    setActiveTab('dashboard');
    window.location.hash = '';
  };

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] text-slate-600 text-sm font-medium">
        Loading GapFinder AI Diagnostic Workspace...
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={(u) => setUser(u)} />;
  }

  const currentNavLabel =
    NAV_ITEMS.find((i) => i.id === activeTab)?.label || 'Dashboard';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex">
      {/* Desktop Sidebar Navigation (260px) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0F172A] text-white border-r border-slate-800">
        <div className="flex items-center gap-2.5 px-6 py-5 border-b border-slate-800">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shrink-0">
            <Brain className="h-4 w-4" />
          </span>
          <span className="text-base font-extrabold tracking-tight text-white whitespace-nowrap">
            GapFinder AI
          </span>
        </div>

        <nav
          aria-label="Main Sidebar Navigation"
          className="flex-1 px-3 py-4 space-y-1 overflow-y-auto"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3">
          <div className="rounded-lg bg-slate-900 p-3 text-xs">
            <div className="font-bold text-white truncate">{user.name}</div>
            <div className="text-[11px] text-slate-400 truncate font-mono">{user.email}</div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-64 max-w-xs bg-[#0F172A] text-white flex flex-col z-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <span className="text-base font-extrabold text-white">GapFinder AI</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation menu"
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigate(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold ${
                      active ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* SaaS Top Header Contract: Breadcrumb on Left, Primary Actions on Right */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="text-xs font-medium text-slate-500 truncate">
              <span>GapFinder AI</span>
              <span className="mx-2">/</span>
              <span className="font-bold text-slate-900">{currentNavLabel}</span>
              {user.isDemo && (
                <span className="ml-2 text-indigo-600 font-semibold">
                  · Demo Biology Workspace
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowHowItWorks(true)}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <HelpCircle className="h-3.5 w-3.5 text-indigo-600" />
              Pipeline Architecture
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          <ErrorBoundary>
            {activeTab === 'dashboard' && (
            <DashboardView
              onNavigate={handleNavigate}
              onInspectCitation={(c) => setInspectedCitation(c)}
              onOpenHowItWorks={() => setShowHowItWorks(true)}
            />
          )}

          {activeTab === 'materials' && <MaterialsView />}

          {activeTab === 'topics' && <TopicMapView />}

          {activeTab === 'quiz' && (
            <QuizView
              initialTopicOrQuizId={navContext}
              onInspectCitation={(c) => setInspectedCitation(c)}
              onNavigate={handleNavigate}
            />
          )}

          {activeTab === 'gaps' && (
            <GapAnalysisView
              onInspectCitation={(c) => setInspectedCitation(c)}
              onNavigate={handleNavigate}
            />
          )}

          {activeTab === 'revision' && (
            <RevisionPlannerView onNavigate={handleNavigate} />
          )}

          {activeTab === 'assistant' && (
            <StudyAssistantView
              initialTopicContext={navContext}
              onInspectCitation={(c) => setInspectedCitation(c)}
            />
          )}

          {activeTab === 'progress' && <ProgressAnalyticsView />}

          {activeTab === 'settings' && (
            <ProfileSettingsView
              user={user}
              onUserUpdated={(u) => setUser(u)}
              onOpenHowItWorks={() => setShowHowItWorks(true)}
            />
          )}
          </ErrorBoundary>
        </main>
      </div>

      <CitationModal
        citation={inspectedCitation}
        onClose={() => setInspectedCitation(null)}
      />

      <HowItWorksModal
        isOpen={showHowItWorks}
        onClose={() => setShowHowItWorks(false)}
      />
    </div>
  );
}
