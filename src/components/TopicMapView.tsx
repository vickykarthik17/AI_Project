import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Edit3,
  ExternalLink,
  FileQuestion,
  FileText,
  Filter,
  FolderTree,
  HelpCircle,
  Layers,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest } from '../api';
import { PastPaperIntelligence, PastPaperQuestion, TopicNode } from '../types';

export const TopicMapView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'hierarchy' | 'pastPapers'>('hierarchy');
  const [topics, setTopics] = useState<TopicNode[]>([]);
  const [pastQuestions, setPastQuestions] = useState<PastPaperQuestion[]>([]);
  const [intelligence, setIntelligence] = useState<PastPaperIntelligence | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [analyzingPapers, setAnalyzingPapers] = useState(false);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopicFilter, setSelectedTopicFilter] = useState<string>('all');
  const [selectedYearFilter, setSelectedYearFilter] = useState<string>('all');
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(false);

  // Editing topic state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUnitName, setEditUnitName] = useState('');
  const [editChapterName, setEditChapterName] = useState('');
  const [editTopicName, setEditTopicName] = useState('');
  const [editSubtopics, setEditSubtopics] = useState('');
  const [editConcepts, setEditConcepts] = useState('');
  const [editPrerequisites, setEditPrerequisites] = useState('');
  const [editWeight, setEditWeight] = useState(7);

  // Add topic modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUnit, setNewUnit] = useState('Unit 1: Cellular Energetics & Metabolism');
  const [newChapter, setNewChapter] = useState('Chapter 1: Photosynthesis');
  const [newTopicName, setNewTopicName] = useState('');
  const [newSubtopics, setNewSubtopics] = useState('');
  const [newConcepts, setNewConcepts] = useState('');
  const [newPrerequisites, setNewPrerequisites] = useState('');
  const [newWeight, setNewWeight] = useState(8);

  // Question Review / Reassignment state
  const [reassigningQId, setReassigningQId] = useState<string | null>(null);
  const [reassignTopic, setReassignTopic] = useState('');
  const [reassignSubtopic, setReassignSubtopic] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [tRes, ppRes, intelRes] = await Promise.all([
        apiRequest<{ topics: TopicNode[] }>('/topics'),
        apiRequest<{ questions: PastPaperQuestion[] }>('/past-papers/questions'),
        apiRequest<PastPaperIntelligence>('/past-papers/intelligence').catch(() => null),
      ]);
      setTopics(tRes.topics);
      setPastQuestions(ppRes.questions);
      if (intelRes) {
        setIntelligence(intelRes);
      }

      const initialExpanded: Record<string, boolean> = {};
      tRes.topics.forEach((t) => {
        initialExpanded[t.id] = true;
      });
      setExpandedIds(initialExpanded);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRegenerateMap = async () => {
    setRegenerating(true);
    try {
      const res = await apiRequest<{ topics: TopicNode[] }>('/topics/generate', {
        method: 'POST',
        body: JSON.stringify({ subject: 'Biology' }),
      });
      setTopics(res.topics);
      await loadData();
    } finally {
      setRegenerating(false);
    }
  };

  const handleAnalyzePastPapers = async () => {
    setAnalyzingPapers(true);
    try {
      await apiRequest('/past-papers/analyze', {
        method: 'POST',
        body: JSON.stringify({ subject: 'Biology' }),
      });
      await loadData();
    } finally {
      setAnalyzingPapers(false);
    }
  };

  const startEditingTopic = (topic: TopicNode) => {
    setEditingId(topic.id);
    setEditUnitName(topic.unitName);
    setEditChapterName(topic.chapterName);
    setEditTopicName(topic.topicName);
    setEditSubtopics(topic.subtopics.join(', '));
    setEditConcepts(topic.importantConcepts.join(', '));
    setEditPrerequisites(topic.prerequisites.join(', '));
    setEditWeight(topic.syllabusWeight);
  };

  const handleSaveTopicEdit = async (topicId: string) => {
    const res = await apiRequest<{ topic: TopicNode }>(`/topics/${topicId}`, {
      method: 'PUT',
      body: JSON.stringify({
        unitName: editUnitName.trim(),
        chapterName: editChapterName.trim(),
        topicName: editTopicName.trim(),
        subtopics: editSubtopics
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        importantConcepts: editConcepts
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        prerequisites: editPrerequisites
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        syllabusWeight: Number(editWeight) || 7,
      }),
    });
    setTopics((prev) => prev.map((t) => (t.id === topicId ? res.topic : t)));
    setEditingId(null);
  };

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicName.trim()) return;

    const res = await apiRequest<{ topic: TopicNode }>('/topics', {
      method: 'POST',
      body: JSON.stringify({
        subject: 'Biology',
        unitName: newUnit.trim(),
        chapterName: newChapter.trim(),
        topicName: newTopicName.trim(),
        subtopics: newSubtopics
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        importantConcepts: newConcepts
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        prerequisites: newPrerequisites
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        syllabusWeight: Number(newWeight) || 8,
      }),
    });

    setTopics((prev) => [...prev, res.topic]);
    setExpandedIds((prev) => ({ ...prev, [res.topic.id]: true }));
    setNewTopicName('');
    setNewSubtopics('');
    setNewConcepts('');
    setNewPrerequisites('');
    setShowAddModal(false);
  };

  const handleDeleteTopic = async (topicId: string) => {
    if (!window.confirm('Are you sure you want to delete this syllabus topic?')) return;
    await apiRequest(`/topics/${topicId}`, { method: 'DELETE' });
    setTopics((prev) => prev.filter((t) => t.id !== topicId));
  };

  const handleReassignQuestion = async (qId: string) => {
    if (!reassignTopic) return;
    const res = await apiRequest<{ question: PastPaperQuestion }>(`/past-papers/questions/${qId}`, {
      method: 'PUT',
      body: JSON.stringify({
        topic: reassignTopic,
        subtopic: reassignSubtopic || undefined,
      }),
    });

    setPastQuestions((prev) => prev.map((q) => (q.id === qId ? res.question : q)));
    setReassigningQId(null);
    setReassignTopic('');
    setReassignSubtopic('');
    await loadData();
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!window.confirm('Delete this past examination question?')) return;
    await apiRequest(`/past-papers/questions/${qId}`, { method: 'DELETE' });
    setPastQuestions((prev) => prev.filter((q) => q.id !== qId));
    await loadData();
  };

  // Group topics into hierarchical Units -> Chapters -> Topics
  const hierarchicalUnits = React.useMemo(() => {
    const unitMap = new Map<string, Map<string, TopicNode[]>>();
    for (const t of topics) {
      const u = t.unitName || 'General Curriculum';
      const ch = t.chapterName || 'General Chapters';
      if (!unitMap.has(u)) unitMap.set(u, new Map());
      const chMap = unitMap.get(u)!;
      if (!chMap.has(ch)) chMap.set(ch, []);
      chMap.get(ch)!.push(t);
    }
    return Array.from(unitMap.entries()).map(([unitName, chMap]) => ({
      unitName,
      chapters: Array.from(chMap.entries()).map(([chapterName, topicList]) => ({
        chapterName,
        topics: topicList,
      })),
    }));
  }, [topics]);

  // Filtered Questions
  const filteredQuestions = pastQuestions.filter((q) => {
    if (onlyNeedsReview && !q.needsReview) return false;
    if (selectedTopicFilter !== 'all' && q.topic.toLowerCase() !== selectedTopicFilter.toLowerCase()) {
      return false;
    }
    if (selectedYearFilter !== 'all') {
      if (selectedYearFilter === 'unspecified') {
        if (q.year !== null) return false;
      } else if (q.year !== selectedYearFilter) {
        return false;
      }
    }
    if (searchQuery.trim()) {
      const qText = `${q.questionText} ${q.topic} ${q.subtopic} ${q.sourceDocument}`.toLowerCase();
      if (!qText.includes(searchQuery.toLowerCase().trim())) return false;
    }
    return true;
  });

  const distinctYears = Array.from(
    new Set(pastQuestions.map((q) => q.year).filter((y): y is string => Boolean(y)))
  ).sort((a, b) => b.localeCompare(a));

  const questionsNeedingReview = pastQuestions.filter((q) => q.needsReview);

  // Frequency Chart Data from Intelligence or Topics
  const freqChartData = [...(topics || [])]
    .sort((a, b) => b.pastPaperFrequency - a.pastPaperFrequency)
    .map((t) => ({
      topicName: t.topicName,
      appearances: t.pastPaperFrequency,
      weight: t.syllabusWeight,
    }));

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 mb-1">
            <FolderTree className="h-4 w-4" />
            <span>Curriculum Architecture & Examination Paper Intelligence</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Syllabus Map & Examination Paper Intelligence
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Subject → Units → Chapters → Main Topics · Validated against actual exam papers with Gemini & Groq
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Topic
          </button>
          <button
            type="button"
            onClick={handleRegenerateMap}
            disabled={regenerating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} />
            {regenerating ? 'Extracting Syllabus...' : 'Regenerate Syllabus Map'}
          </button>
          <button
            type="button"
            onClick={handleAnalyzePastPapers}
            disabled={analyzingPapers}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
          >
            <FileQuestion className={`h-3.5 w-3.5 ${analyzingPapers ? 'animate-spin' : ''}`} />
            {analyzingPapers ? 'Analyzing Papers...' : 'Analyze Past Papers'}
          </button>
        </div>
      </div>

      {/* Primary Tab Navigation */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-2">
        <button
          type="button"
          onClick={() => setActiveTab('hierarchy')}
          className={`inline-flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'hierarchy'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <FolderTree className="h-4 w-4" />
          <span>Hierarchical Syllabus Map ({topics.length} Topics)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pastPapers')}
          className={`inline-flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'pastPapers'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileQuestion className="h-4 w-4" />
          <span>Past Paper Intelligence & Exam Questions ({pastQuestions.length})</span>
          {questionsNeedingReview.length > 0 && (
            <span className="rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 ml-1">
              {questionsNeedingReview.length} Need Review
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: Hierarchical Syllabus Topic Map                                    */}
      {/* ========================================================================= */}
      {activeTab === 'hierarchy' && (
        <div className="space-y-6">
          {loading ? (
            <div className="h-64 rounded-xl border border-slate-200 bg-white p-6 animate-pulse" />
          ) : topics.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <FolderTree className="h-10 w-10 text-slate-400 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-800">No Syllabus Topics Found</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                Upload your syllabus PDF or textbook in "My Study Materials" to automatically extract hierarchical topics with Groq, or click "Add Topic" to manually build your syllabus.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {hierarchicalUnits.map((unit, uIdx) => (
                <div
                  key={unit.unitName}
                  className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm"
                >
                  {/* Unit Bar */}
                  <div className="bg-slate-50/90 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="rounded bg-indigo-100 text-indigo-800 font-mono text-[11px] font-bold px-2 py-0.5">
                        Unit {uIdx + 1}
                      </span>
                      <h3 className="text-sm font-bold text-slate-900">{unit.unitName}</h3>
                    </div>
                    <span className="text-xs text-slate-500 font-medium">
                      {unit.chapters.reduce((acc, c) => acc + c.topics.length, 0)} Topics
                    </span>
                  </div>

                  {/* Chapters within Unit */}
                  <div className="p-5 space-y-4">
                    {unit.chapters.map((ch) => (
                      <div key={ch.chapterName} className="space-y-3">
                        <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 pb-1 border-b border-slate-100">
                          <BookOpen className="h-3.5 w-3.5 text-indigo-500" />
                          <span>{ch.chapterName}</span>
                        </div>

                        {/* Topics under Chapter */}
                        <div className="grid grid-cols-1 gap-3">
                          {ch.topics.map((topic) => {
                            const isExpanded = Boolean(expandedIds[topic.id]);
                            const isEditing = editingId === topic.id;

                            return (
                              <div
                                key={topic.id}
                                className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 transition-colors"
                              >
                                {isEditing ? (
                                  <div className="space-y-3 p-1">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                                      <div>
                                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                                          Topic Name
                                        </label>
                                        <input
                                          type="text"
                                          value={editTopicName}
                                          onChange={(e) => setEditTopicName(e.target.value)}
                                          className="w-full rounded border border-slate-300 px-2.5 py-1 text-xs"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                                          Unit Name
                                        </label>
                                        <input
                                          type="text"
                                          value={editUnitName}
                                          onChange={(e) => setEditUnitName(e.target.value)}
                                          className="w-full rounded border border-slate-300 px-2.5 py-1 text-xs"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                                          Chapter Name
                                        </label>
                                        <input
                                          type="text"
                                          value={editChapterName}
                                          onChange={(e) => setEditChapterName(e.target.value)}
                                          className="w-full rounded border border-slate-300 px-2.5 py-1 text-xs"
                                        />
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                      <div>
                                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                                          Subtopics (comma-separated)
                                        </label>
                                        <input
                                          type="text"
                                          value={editSubtopics}
                                          onChange={(e) => setEditSubtopics(e.target.value)}
                                          className="w-full rounded border border-slate-300 px-2.5 py-1 text-xs"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                                          Important Concepts (comma-separated)
                                        </label>
                                        <input
                                          type="text"
                                          value={editConcepts}
                                          onChange={(e) => setEditConcepts(e.target.value)}
                                          className="w-full rounded border border-slate-300 px-2.5 py-1 text-xs"
                                        />
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                      <div>
                                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                                          Prerequisites (comma-separated)
                                        </label>
                                        <input
                                          type="text"
                                          value={editPrerequisites}
                                          onChange={(e) => setEditPrerequisites(e.target.value)}
                                          className="w-full rounded border border-slate-300 px-2.5 py-1 text-xs"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                                          Syllabus Weight (1-10)
                                        </label>
                                        <input
                                          type="number"
                                          min={1}
                                          max={10}
                                          value={editWeight}
                                          onChange={(e) => setEditWeight(Number(e.target.value))}
                                          className="w-full rounded border border-slate-300 px-2.5 py-1 text-xs"
                                        />
                                      </div>
                                    </div>

                                    <div className="flex justify-end gap-2 pt-1">
                                      <button
                                        type="button"
                                        onClick={() => setEditingId(null)}
                                        className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSaveTopicEdit(topic.id)}
                                        className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                                      >
                                        <Save className="h-3 w-3" />
                                        Save Changes
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setExpandedIds((prev) => ({
                                              ...prev,
                                              [topic.id]: !prev[topic.id],
                                            }))
                                          }
                                          className="rounded p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                                        >
                                          {isExpanded ? (
                                            <ChevronDown className="h-4 w-4" />
                                          ) : (
                                            <ChevronRight className="h-4 w-4" />
                                          )}
                                        </button>
                                        <h4 className="text-sm font-bold text-slate-900">
                                          {topic.topicName}
                                        </h4>
                                      </div>

                                      <div className="flex items-center gap-3">
                                        <span className="rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono text-[11px] px-2 py-0.5 font-semibold">
                                          {topic.pastPaperFrequency} Past Exam Qs
                                        </span>
                                        <span className="text-[11px] text-slate-500 font-medium">
                                          Weight: {topic.syllabusWeight}/10
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => startEditingTopic(topic)}
                                          className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                                          title="Edit Topic"
                                        >
                                          <Edit3 className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteTopic(topic.id)}
                                          className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                                          title="Delete Topic"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>

                                    {isExpanded && (
                                      <div className="mt-3 pl-6 space-y-2.5 border-t border-slate-100 pt-3 text-xs">
                                        <div>
                                          <span className="font-semibold text-slate-700 block mb-1">
                                            Subtopics ({topic.subtopics.length}):
                                          </span>
                                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-slate-600">
                                            {topic.subtopics.map((sub) => (
                                              <li key={sub} className="flex items-center gap-1.5">
                                                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                                                <span>{sub}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-3 text-slate-500 pt-1 text-[11px]">
                                          <div>
                                            <strong className="text-slate-700">Key Concepts:</strong>{' '}
                                            {topic.importantConcepts.join(' · ')}
                                          </div>
                                          {topic.prerequisites.length > 0 && (
                                            <div>
                                              <strong className="text-slate-700">Prerequisites:</strong>{' '}
                                              {topic.prerequisites.join(', ')}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: Past Paper Intelligence & Exam Questions Explorer                  */}
      {/* ========================================================================= */}
      {activeTab === 'pastPapers' && (
        <div className="space-y-6">
          {/* Intelligence KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Total Exam Questions
              </span>
              <div className="text-2xl font-bold text-slate-900 font-mono">
                {pastQuestions.length}
              </div>
              <p className="text-[11px] text-slate-500">
                Extracted from actual uploaded papers (never invented)
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Top Tested Topic
              </span>
              <div className="text-xl font-bold text-indigo-700 truncate font-mono">
                {intelligence?.frequentlyTestedTopics[0]?.topicName || 'None yet'}
              </div>
              <p className="text-[11px] text-slate-500">
                {intelligence?.frequentlyTestedTopics[0]?.questionCount || 0} questions (
                {intelligence?.frequentlyTestedTopics[0]?.percentage || 0}% of exam)
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Exam Years Covered
              </span>
              <div className="text-xl font-bold text-slate-900 font-mono">
                {distinctYears.length > 0
                  ? `${distinctYears[distinctYears.length - 1]} - ${distinctYears[0]}`
                  : 'N/A'}
              </div>
              <p className="text-[11px] text-slate-500">
                {distinctYears.length} distinct examination years identified
              </p>
            </div>

            <div
              className={`rounded-xl border p-5 space-y-1 ${
                questionsNeedingReview.length > 0
                  ? 'border-amber-300 bg-amber-50/60'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                {questionsNeedingReview.length > 0 && (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                )}
                Topic Mapping Review
              </span>
              <div
                className={`text-2xl font-bold font-mono ${
                  questionsNeedingReview.length > 0 ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {questionsNeedingReview.length}
              </div>
              <p className="text-[11px] text-slate-500">
                {questionsNeedingReview.length > 0
                  ? 'Uncertain mappings flagged for student review'
                  : 'All questions confidently mapped to syllabus'}
              </p>
            </div>
          </div>

          {/* Intelligence Visual Analytics Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 7 cols: Frequency Chart & Ranking */}
            <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Frequently Tested Examination Topics
                  </h3>
                  <p className="text-xs text-slate-500">
                    Actual question frequency calculated strictly from your uploaded past papers
                  </p>
                </div>
                <BarChart3 className="h-5 w-5 text-indigo-600" />
              </div>

              {freqChartData.length === 0 || pastQuestions.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                  Upload past papers to view actual topic frequency charts
                </div>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={freqChartData.slice(0, 7)}
                      layout="vertical"
                      margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#475569' }} />
                      <YAxis
                        type="category"
                        dataKey="topicName"
                        width={130}
                        tick={{ fontSize: 11, fill: '#0F172A', fontWeight: 600 }}
                      />
                      <Tooltip
                        formatter={(v: any) => [`${v} Questions`, 'Exam Frequency']}
                        contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                      />
                      <Bar dataKey="appearances" fill="#4F46E5" radius={[0, 6, 6, 0]} barSize={18}>
                        {freqChartData.slice(0, 7).map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={index === 0 ? '#4338CA' : index === 1 ? '#4F46E5' : '#6366F1'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Table of Frequently Tested Topics */}
              {intelligence?.frequentlyTestedTopics && (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-[10px] font-semibold text-slate-500 uppercase border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Topic</th>
                        <th className="p-2.5 text-center">Exam Questions</th>
                        <th className="p-2.5 text-center">Exam Share</th>
                        <th className="p-2.5 text-center">Weight</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {intelligence.frequentlyTestedTopics.map((item) => (
                        <tr key={item.topicName} className="hover:bg-slate-50/60">
                          <td className="p-2.5 font-semibold text-slate-900">{item.topicName}</td>
                          <td className="p-2.5 text-center font-mono font-bold text-indigo-700">
                            {item.questionCount}
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-600">
                            {item.percentage}%
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-500">
                            {item.syllabusWeight}/10
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right 5 cols: Available Year-Wise Distribution & Source Documents */}
            <div className="lg:col-span-5 space-y-6">
              {/* Year Distribution */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Available Year-Wise Distribution
                    </h3>
                    <p className="text-xs text-slate-500">
                      Chronological question density across exam sessions
                    </p>
                  </div>
                  <Calendar className="h-5 w-5 text-indigo-600" />
                </div>

                {!intelligence?.yearDistribution || intelligence.yearDistribution.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    No year-indexed examination papers uploaded yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {intelligence.yearDistribution.map((yItem) => (
                      <div
                        key={yItem.year}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-900 font-mono">
                            {yItem.year === 'Unspecified' ? 'Undated Session' : `Year ${yItem.year}`}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                            {yItem.topicsCovered.join(', ')}
                          </div>
                        </div>
                        <span className="rounded bg-indigo-100 text-indigo-800 px-2.5 py-1 font-mono font-bold text-xs">
                          {yItem.questionCount} Qs
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Source Document References */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900">Source References</h3>
                </div>
                <div className="space-y-2">
                  {intelligence?.sourceReferences.map((ref) => (
                    <div
                      key={ref.documentName}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1"
                    >
                      <div className="font-semibold text-slate-800 truncate">
                        {ref.documentName}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center justify-between">
                        <span>{ref.questionCount} Questions Extracted</span>
                        <span>Pages: {ref.pages.join(', ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Question Explorer & Topic Validation Review */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Individual Examination Questions ({filteredQuestions.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Validated against syllabus using Gemini Embeddings · Review and reassign uncertain mappings
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setOnlyNeedsReview(!onlyNeedsReview)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold transition-colors cursor-pointer ${
                    onlyNeedsReview
                      ? 'border-amber-400 bg-amber-50 text-amber-900'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                  <span>Only Needs Review ({questionsNeedingReview.length})</span>
                </button>

                <select
                  value={selectedTopicFilter}
                  onChange={(e) => setSelectedTopicFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                >
                  <option value="all">All Topics</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.topicName}>
                      {t.topicName}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedYearFilter}
                  onChange={(e) => setSelectedYearFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                >
                  <option value="all">All Years</option>
                  {distinctYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                  <option value="unspecified">Unspecified Year</option>
                </select>
              </div>
            </div>

            {/* Questions List */}
            <div className="space-y-3">
              {filteredQuestions.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                  No examination questions match the active filters.
                </div>
              ) : (
                filteredQuestions.map((q) => {
                  const isReassigning = reassigningQId === q.id;

                  return (
                    <div
                      key={q.id}
                      className={`rounded-lg border p-4 text-xs space-y-2 transition-colors ${
                        q.needsReview
                          ? 'border-amber-300 bg-amber-50/50'
                          : 'border-slate-200 bg-slate-50/70 hover:border-slate-300'
                      }`}
                    >
                      {/* Top Badges */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-indigo-700">{q.topic}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-600">{q.subtopic}</span>

                          {q.needsReview ? (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-200/70 text-amber-900 border border-amber-300 text-[10px] px-2 py-0.5 font-bold">
                              <AlertTriangle className="h-3 w-3" />
                              Uncertain Topic Mapping (Needs Review)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 font-semibold">
                              <CheckCircle2 className="h-3 w-3" />
                              Validated
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px]">
                          {q.year && (
                            <span className="rounded bg-white border border-slate-200 px-1.5 py-0.5">
                              Year: {q.year}
                            </span>
                          )}
                          {q.marks !== null && (
                            <span className="rounded bg-white border border-slate-200 px-1.5 py-0.5">
                              {q.marks} Marks
                            </span>
                          )}
                          <span>Page {q.pageNumber}</span>
                          <span>·</span>
                          <span>{q.questionType}</span>
                        </div>
                      </div>

                      {/* Question Text */}
                      <p className="text-slate-900 font-medium leading-relaxed">{q.questionText}</p>

                      {/* Validation Evidence */}
                      {q.validationEvidence && (
                        <div className="text-[11px] text-slate-500 font-mono bg-white/80 p-2 rounded border border-slate-200/80">
                          <span className="font-semibold text-slate-700">Retrieval Evidence:</span>{' '}
                          {q.validationEvidence}
                        </div>
                      )}

                      {/* Action Row */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60 text-[11px] text-slate-500">
                        <span>Source: {q.sourceDocument}</span>

                        <div className="flex items-center gap-2">
                          {isReassigning ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={reassignTopic}
                                onChange={(e) => setReassignTopic(e.target.value)}
                                className="rounded border border-indigo-300 bg-white px-2 py-1 text-xs text-slate-800"
                              >
                                <option value="">Select Target Topic</option>
                                {topics.map((t) => (
                                  <option key={t.id} value={t.topicName}>
                                    {t.topicName}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => handleReassignQuestion(q.id)}
                                className="rounded bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setReassigningQId(null)}
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setReassigningQId(q.id);
                                setReassignTopic(q.topic);
                                setReassignSubtopic(q.subtopic);
                              }}
                              className="text-indigo-600 hover:text-indigo-800 font-semibold underline cursor-pointer"
                            >
                              {q.needsReview ? 'Review & Assign Topic' : 'Reassign Topic'}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="text-slate-400 hover:text-red-600 cursor-pointer ml-1"
                            title="Delete question"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Topic Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleAddTopic}
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">Add Custom Syllabus Topic</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Unit Name</label>
                <input
                  type="text"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  placeholder="e.g. Unit 2: Molecular Genetics"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Chapter Name</label>
                <input
                  type="text"
                  value={newChapter}
                  onChange={(e) => setNewChapter(e.target.value)}
                  placeholder="e.g. Chapter 4: DNA Replication"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Topic Name *</label>
                <input
                  type="text"
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  placeholder="e.g. DNA Replication Mechanisms"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Subtopics (comma-separated)
                </label>
                <input
                  type="text"
                  value={newSubtopics}
                  onChange={(e) => setNewSubtopics(e.target.value)}
                  placeholder="Leading Strand, Okazaki Fragments, DNA Polymerase III"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Important Concepts (comma-separated)
                </label>
                <input
                  type="text"
                  value={newConcepts}
                  onChange={(e) => setNewConcepts(e.target.value)}
                  placeholder="Semi-conservative replication, replication fork"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Prerequisites</label>
                  <input
                    type="text"
                    value={newPrerequisites}
                    onChange={(e) => setNewPrerequisites(e.target.value)}
                    placeholder="Nucleic Acid Structure"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Weight (1-10)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={newWeight}
                    onChange={(e) => setNewWeight(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Save Topic
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
