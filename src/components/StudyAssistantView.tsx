import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Database,
  Edit3,
  ExternalLink,
  FileCode,
  Fingerprint,
  History,
  Layers,
  Loader2,
  MessageSquare,
  Plus,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest } from '../api';
import {
  ChatMessage,
  Citation,
  Conversation,
  RagInspectionTelemetry,
  StudentMemory,
} from '../types';

interface StudyAssistantViewProps {
  initialTopicContext?: string;
  onInspectCitation: (citation: Citation) => void;
}

const DEFAULT_WELCOME_MSG: ChatMessage = {
  id: 'welcome_msg',
  role: 'assistant',
  content:
    'Welcome to the GapFinder AI Grounded Study Assistant. I answer strictly using passages retrieved from your uploaded textbooks, syllabus, and past examination papers. Select a contextual diagnostic action below or ask a question about your study materials.',
  citations: [
    {
      chunkId: 'chunk_bio_05',
      documentName: 'Biology_Textbook.pdf',
      chapter: 'Chapter 3: Photosynthesis',
      pageNumber: 42,
      section: 'Light-Dependent Reactions in the Thylakoid',
      excerpt:
        'Light-dependent reactions take place strictly within the thylakoid membrane of chloroplasts. Photon absorption excites electrons in Photosystem II (P680), triggering photolysis of water.',
      similarityScore: 0.9124,
    },
  ],
  grounded: true,
  createdAt: new Date().toISOString(),
};

export const StudyAssistantView: React.FC<StudyAssistantViewProps> = ({
  initialTopicContext,
  onInspectCitation,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editTitleInput, setEditTitleInput] = useState('');
  const [studentMemories, setStudentMemories] = useState<StudentMemory[]>([]);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [newMemoryKey, setNewMemoryKey] = useState('struggling_concept');
  const [newMemoryContent, setNewMemoryContent] = useState('');
  const [savingMemory, setSavingMemory] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([DEFAULT_WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showInspectionPanel, setShowInspectionPanel] = useState(false);
  const [inspectionData, setInspectionData] = useState<RagInspectionTelemetry | null>(null);
  const [activeInspectTab, setActiveInspectTab] = useState<
    'chunks' | 'context' | 'groq' | 'citations' | 'embedding'
  >('chunks');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load conversations and student memories on mount
  useEffect(() => {
    loadConversations();
    loadStudentMemories();
  }, []);

  const loadConversations = async () => {
    try {
      const res = await apiRequest<{ conversations: Conversation[] }>('/chat/conversations');
      if (res.conversations && res.conversations.length > 0) {
        setConversations(res.conversations);
        const firstId = res.conversations[0].id;
        setActiveConversationId(firstId);
        loadMessagesForConversation(firstId);
      }
    } catch (err) {
      console.error('Failed to load conversations', err);
    }
  };

  const loadMessagesForConversation = async (convId: string) => {
    try {
      const res = await apiRequest<{ messages: ChatMessage[] }>(`/chat/messages?conversationId=${convId}`);
      if (res.messages && res.messages.length > 0) {
        setMessages(res.messages);
      } else {
        setMessages([DEFAULT_WELCOME_MSG]);
      }
    } catch {
      setMessages([DEFAULT_WELCOME_MSG]);
    }
  };

  const loadStudentMemories = async () => {
    try {
      const res = await apiRequest<{ memories: StudentMemory[] }>('/students/memories');
      setStudentMemories(res.memories || []);
    } catch (err) {
      console.error('Failed to load student memories', err);
    }
  };

  const selectConversation = (convId: string) => {
    if (convId === activeConversationId) return;
    setActiveConversationId(convId);
    loadMessagesForConversation(convId);
  };

  const handleCreateConversation = async () => {
    try {
      const title = `Biology Study Session ${conversations.length + 1}`;
      const res = await apiRequest<{ conversation: Conversation }>('/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({ title, subject: 'Biology' }),
      });
      setConversations((prev) => [res.conversation, ...prev]);
      setActiveConversationId(res.conversation.id);
      setMessages([DEFAULT_WELCOME_MSG]);
    } catch (err) {
      console.error('Failed to create conversation', err);
    }
  };

  const handleRenameConversation = async (convId: string) => {
    if (!editTitleInput.trim()) {
      setEditingConvId(null);
      return;
    }
    try {
      const res = await apiRequest<{ conversation: Conversation }>(`/chat/conversations/${convId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: editTitleInput.trim() }),
      });
      setConversations((prev) => prev.map((c) => (c.id === convId ? res.conversation : c)));
      setEditingConvId(null);
    } catch (err) {
      console.error('Failed to rename conversation', err);
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    if (!window.confirm('Delete this conversation session and all its messages?')) return;
    try {
      await apiRequest(`/chat/conversations/${convId}`, { method: 'DELETE' });
      const remaining = conversations.filter((c) => c.id !== convId);
      setConversations(remaining);
      if (remaining.length > 0) {
        selectConversation(remaining[0].id);
      } else {
        handleCreateConversation();
      }
    } catch (err) {
      console.error('Failed to delete conversation', err);
    }
  };

  const handleClearMessages = async () => {
    if (!activeConversationId) return;
    if (!window.confirm('Clear all chat messages in this study session?')) return;
    try {
      await apiRequest(`/chat/messages?conversationId=${activeConversationId}`, { method: 'DELETE' });
      setMessages([DEFAULT_WELCOME_MSG]);
    } catch (err) {
      console.error('Failed to clear messages', err);
    }
  };

  const handleAddStudentMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryContent.trim()) return;
    setSavingMemory(true);
    try {
      const res = await apiRequest<{ memory: StudentMemory }>('/students/memories', {
        method: 'POST',
        body: JSON.stringify({
          key: newMemoryKey,
          content: newMemoryContent.trim(),
          source: 'manual',
        }),
      });
      setStudentMemories((prev) => [res.memory, ...prev]);
      setNewMemoryContent('');
    } catch (err) {
      console.error('Failed to save student memory', err);
    } finally {
      setSavingMemory(false);
    }
  };

  const handleDeleteStudentMemory = async (memId: string) => {
    try {
      await apiRequest(`/students/memories/${memId}`, { method: 'DELETE' });
      setStudentMemories((prev) => prev.filter((m) => m.id !== memId));
    } catch (err) {
      console.error('Failed to delete student memory', err);
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const sendQuery = async (queryText: string) => {
    const clean = queryText.trim();
    if (!clean || loading) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: clean,
      citations: [],
      grounded: true,
      createdAt: new Date().toISOString(),
    };

    const asstMsgId = `asst_${Date.now()}`;
    const initialAsstMsg: ChatMessage = {
      id: asstMsgId,
      role: 'assistant',
      content: '',
      citations: [],
      grounded: true,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, initialAsstMsg]);
    setInput('');
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const token =
        localStorage.getItem('gapfinder_token') ||
        sessionStorage.getItem('gapfinder_token') ||
        '';

      const streamResponse = await fetch('/api/rag/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          query: clean,
          subject: 'Biology',
          conversationId: activeConversationId || undefined,
        }),
        signal: controller.signal,
      });

      if (!streamResponse.ok || !streamResponse.body) {
        throw new Error(`Streaming failed with status: ${streamResponse.status}`);
      }

      const reader = streamResponse.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedText = '';
      let finalCitations: Citation[] = [];
      let isGrounded = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);
            if (data.type === 'token') {
              accumulatedText += data.text;
              setMessages((prev) =>
                prev.map((m) => (m.id === asstMsgId ? { ...m, content: accumulatedText } : m))
              );
            } else if (data.type === 'done') {
              accumulatedText = data.content || accumulatedText;
              finalCitations = data.citations || [];
              isGrounded = Boolean(data.grounded);
              if (data.telemetry) {
                setInspectionData(data.telemetry);
              }
              const finishedMsg: ChatMessage = {
                id: asstMsgId,
                conversationId: activeConversationId || undefined,
                role: 'assistant',
                content: accumulatedText,
                citations: finalCitations,
                grounded: isGrounded,
                debugTelemetry: data.telemetry,
                createdAt: new Date().toISOString(),
              };

              setMessages((prev) =>
                prev.map((m) => (m.id === asstMsgId ? finishedMsg : m))
              );

              // Persist assistant message in background
              if (activeConversationId) {
                apiRequest('/chat/messages', {
                  method: 'POST',
                  body: JSON.stringify({ message: finishedMsg }),
                }).catch(() => {});
              }
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          } catch {
            // Ignore malformed line
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User voluntarily stopped generation
        return;
      }
      console.warn('Streaming notice, falling back to standard request:', err.message);
      // Seamless fallback to /rag/ask
      try {
        const res = await apiRequest<{
          answer: string;
          citations: Citation[];
          grounded: boolean;
          insufficientEvidence?: boolean;
          debugTelemetry?: RagInspectionTelemetry;
        }>('/rag/ask', {
          method: 'POST',
          body: JSON.stringify({
            query: clean,
            subject: 'Biology',
            conversationId: activeConversationId || undefined,
          }),
        });

        if (res.debugTelemetry) {
          setInspectionData(res.debugTelemetry);
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === asstMsgId
              ? {
                  ...m,
                  content: res.answer,
                  citations: res.citations || [],
                  grounded: res.grounded,
                  debugTelemetry: res.debugTelemetry,
                }
              : m
          )
        );
      } catch (fallbackErr: any) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === asstMsgId
              ? {
                  ...m,
                  content: fallbackErr.message || 'Could not retrieve grounded answer.',
                  citations: [],
                  grounded: false,
                }
              : m
          )
        );
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialTopicContext && !initialTopicContext.startsWith('review:')) {
      sendQuery(
        `Explain my weakest topic (${initialTopicContext}) using my uploaded textbook and highlight where students commonly make mistakes.`
      );
    }
  }, [initialTopicContext]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuery(input);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 Cols: Grounded RAG Conversation */}
        <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white flex flex-col h-[700px]">
          {/* Header */}
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="text-[11px] font-semibold text-indigo-600 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Supporting RAG Assistant · Strictly Grounded in Student Uploaded Material
              </div>
              {editingConvId ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    type="text"
                    value={editTitleInput}
                    onChange={(e) => setEditTitleInput(e.target.value)}
                    className="rounded border border-indigo-300 px-2 py-0.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Session Title"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleRenameConversation(editingConvId)}
                    className="p-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 cursor-pointer"
                    title="Save title"
                  >
                    <Save className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingConvId(null)}
                    className="p-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
                    title="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-0.5">
                  <h2 className="text-sm font-bold text-slate-900 truncate">
                    {conversations.find((c) => c.id === activeConversationId)?.title ||
                      'General Biology Study & Revision'}
                  </h2>
                  {activeConversationId && (
                    <button
                      type="button"
                      onClick={() => {
                        const curr = conversations.find((c) => c.id === activeConversationId);
                        setEditTitleInput(curr?.title || '');
                        setEditingConvId(activeConversationId);
                      }}
                      className="text-slate-400 hover:text-indigo-600 p-0.5 cursor-pointer"
                      title="Rename this conversation"
                    >
                      <Edit3 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCreateConversation}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                title="Create a new study conversation"
              >
                <Plus className="h-3.5 w-3.5 text-indigo-600" />
                <span>New Chat</span>
              </button>

              <button
                type="button"
                onClick={() => setShowMemoryModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 cursor-pointer"
                title="View and manage student learning memories"
              >
                <Brain className="h-3.5 w-3.5 text-indigo-600" />
                <span>Memory ({studentMemories.length})</span>
              </button>

              <button
                type="button"
                onClick={handleClearMessages}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                title="Clear messages in this conversation"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear</span>
              </button>

              <button
                type="button"
                onClick={() => setShowInspectionPanel((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer border ${
                  showInspectionPanel
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
                title="Toggle developer retrieval inspection panel"
              >
                <Terminal className="h-3.5 w-3.5 text-indigo-600" />
                <span className="hidden sm:inline">Telemetry</span>
                {showInspectionPanel ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Message List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-2xl rounded-xl p-4 text-xs leading-relaxed space-y-3 ${
                    msg.role === 'user'
                      ? 'bg-[#0F172A] text-white'
                      : msg.grounded
                      ? 'border border-slate-200 bg-slate-50 text-slate-900'
                      : 'border border-amber-300 bg-amber-50/70 text-amber-950'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-200/70 text-[11px] font-semibold">
                      {msg.grounded ? (
                        <span className="text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Verified RAG Response ({msg.citations.length} textbook source{' '}
                          {msg.citations.length === 1 ? 'citation' : 'citations'})
                        </span>
                      ) : (
                        <span className="text-amber-800 flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Ungrounded Query Refusal (Not in Uploaded Study Materials)
                        </span>
                      )}

                      {msg.debugTelemetry && (
                        <button
                          type="button"
                          onClick={() => {
                            setInspectionData(msg.debugTelemetry || null);
                            setShowInspectionPanel(true);
                          }}
                          className="text-[10px] text-indigo-600 hover:text-indigo-800 underline font-medium flex items-center gap-1 cursor-pointer"
                        >
                          <Terminal className="h-3 w-3" />
                          Inspect Telemetry
                        </button>
                      )}
                    </div>
                  )}

                  <div className="whitespace-pre-line">{msg.content}</div>

                  {msg.citations.length > 0 && (
                    <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-700 block">
                        Clickable Source Citations:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {msg.citations.map((cit) => (
                          <button
                            key={cit.chunkId}
                            type="button"
                            onClick={() => onInspectCitation(cit)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 cursor-pointer"
                          >
                            <BookOpen className="h-3 w-3 shrink-0" />
                            <span>
                              {cit.documentName} · {cit.chapter} · Page {cit.pageNumber} ({cit.section})
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 p-2">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                <span>
                  Retrieving chunks with Gemini Embedding 2 & generating grounded answer via Groq...
                </span>
              </div>
            )}
          </div>

          {/* Input Form */}
          <form
            onSubmit={handleFormSubmit}
            className="p-4 border-t border-slate-200 bg-slate-50/50 flex items-center gap-2.5"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Ask a question grounded in your uploaded study materials"
              placeholder="Ask about Photosynthesis, Calvin cycle, Glycolysis, DNA replication, or Bohr effect..."
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
            />
            {loading ? (
              <button
                type="button"
                onClick={stopGeneration}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
              >
                <Square className="h-3 w-3 fill-current" />
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                Ask RAG
              </button>
            )}
          </form>
        </div>

        {/* Right 4 Cols: Sessions, Memory, Contextual Actions & Grounding Verification */}
        <div className="lg:col-span-4 space-y-5">
          {/* Saved Study Sessions */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Study Sessions</h3>
              </div>
              <button
                type="button"
                onClick={handleCreateConversation}
                className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 cursor-pointer"
              >
                <Plus className="h-3 w-3" />
                <span>New</span>
              </button>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    conv.id === activeConversationId
                      ? 'bg-indigo-50/80 border border-indigo-200 text-indigo-900 font-semibold'
                      : 'hover:bg-slate-50 border border-transparent text-slate-700'
                  }`}
                  onClick={() => selectConversation(conv.id)}
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="truncate">{conv.title}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(conv.id);
                      }}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                      title="Delete session"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Student Learning Memories Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">Student Learning Memory</h3>
              </div>
              <span className="text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded">
                Isolated
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Personalized concept insights and preferences used by the AI assistant to tailor answers
            </p>
            <div className="space-y-2">
              {studentMemories.slice(0, 3).map((mem) => (
                <div
                  key={mem.id}
                  className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 space-y-0.5"
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-semibold uppercase tracking-wider text-purple-700">
                      {mem.key.replace(/_/g, ' ')}
                    </span>
                    <span>{new Date(mem.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="line-clamp-2 text-[11px]">{mem.content}</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowMemoryModal(true)}
              className="w-full text-center rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Manage Learning Memories ({studentMemories.length})
            </button>
          </div>

          {/* Contextual Diagnostic Actions */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">Contextual Diagnostic Actions</h3>
            </div>
            <p className="text-xs text-slate-500">
              One-click actions connected to your latest Gap Analysis Report and uploaded Biology textbook
            </p>

            <div className="space-y-2 pt-1">
              {[
                {
                  label: 'Explain my weakest topic (Photosynthesis)',
                  prompt:
                    'Explain my weakest topic (Photosynthesis: light-dependent reactions in the thylakoid vs Calvin cycle in the stroma) in simple language using my uploaded textbook.',
                },
                {
                  label: 'Generate 5 practice questions on Respiration',
                  prompt:
                    'Generate 5 practice questions on Cellular Respiration (Glycolysis, Krebs cycle, and Electron Transport Chain) grounded in Chapter 4.',
                },
                {
                  label: 'Review my previous mistakes',
                  prompt:
                    'Review my previous mistakes on Photosynthesis photolysis and cytosolic glycolysis and explain the correct mechanisms from the textbook.',
                },
                {
                  label: 'Summarize Chapter 2: Genetics',
                  prompt:
                    'Summarize Chapter 2: Genetics (DNA replication, leading vs lagging strand, and meiotic recombination) from my uploaded textbook.',
                },
              ].map((act) => (
                <button
                  key={act.label}
                  type="button"
                  onClick={() => sendQuery(act.prompt)}
                  disabled={loading}
                  className="w-full text-left rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs font-semibold text-slate-800 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors cursor-pointer"
                >
                  {act.label}
                </button>
              ))}
            </div>
          </div>

          {/* Source Grounding Verification Test */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              Verify Strict Source Grounding (Scenario 6)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              GapFinder AI never silently substitutes general LLM knowledge when a topic is missing
              from your uploaded files. Click below to test an out-of-syllabus query:
            </p>
            <button
              type="button"
              onClick={() =>
                sendQuery(
                  'Explain Quantum Chromodynamics and quark confinement in particle physics.'
                )
              }
              disabled={loading}
              className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer text-left"
            >
              Test Out-of-Syllabus Query: "Explain Quantum Chromodynamics"
            </button>
          </div>
        </div>
      </div>

      {/* Student Learning Memories Modal */}
      {showMemoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Student Learning Memories</h3>
                  <p className="text-[11px] text-slate-500">
                    Stored strictly in your authenticated student profile
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMemoryModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              <form onSubmit={handleAddStudentMemory} className="p-3 bg-purple-50/50 rounded-lg border border-purple-100 space-y-2">
                <h4 className="text-xs font-bold text-purple-900">Add New Learning Insight</h4>
                <div className="flex gap-2">
                  <select
                    value={newMemoryKey}
                    onChange={(e) => setNewMemoryKey(e.target.value)}
                    className="text-xs rounded border border-purple-200 bg-white px-2 py-1 text-slate-700"
                  >
                    <option value="struggling_concept">Struggling Concept</option>
                    <option value="mastered_topic">Mastered Topic</option>
                    <option value="learning_preference">Learning Preference</option>
                    <option value="exam_target">Exam Target</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMemoryContent}
                    onChange={(e) => setNewMemoryContent(e.target.value)}
                    placeholder="e.g. Confuses cyclic vs non-cyclic photophosphorylation"
                    className="flex-1 text-xs rounded border border-purple-200 bg-white px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  <button
                    type="submit"
                    disabled={savingMemory || !newMemoryContent.trim()}
                    className="rounded bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50 cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700">Saved Insights ({studentMemories.length})</h4>
                {studentMemories.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No learning insights recorded yet.</p>
                ) : (
                  studentMemories.map((mem) => (
                    <div
                      key={mem.id}
                      className="p-3 rounded-lg border border-slate-200 bg-white flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                            {mem.key.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Source: {mem.source}
                          </span>
                        </div>
                        <p className="text-xs text-slate-800 leading-relaxed">{mem.content}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteStudentMemory(mem.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer shrink-0"
                        title="Delete insight"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowMemoryModal(false)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Developer-Only Retrieval Inspection Panel */}
      {showInspectionPanel && (
        <div className="rounded-xl border border-indigo-200 bg-slate-900 text-white shadow-xl overflow-hidden">
          {/* Panel Header */}
          <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
                <Terminal className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>Developer RAG Retrieval & Generation Inspection Panel</span>
                  <span className="rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 font-mono">
                    LIVE TELEMETRY
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Inspect query embeddings, retrieved pgvector chunks, similarity scores, context isolation, and Groq inference
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Embeddings:</span>
              <span className="rounded bg-slate-800 px-2 py-1 font-mono text-[11px] text-sky-300">
                Gemini 2 (text-embedding-004 · 64d)
              </span>
              <span className="text-slate-400 ml-2">LLM Inference:</span>
              <span className="rounded bg-slate-800 px-2 py-1 font-mono text-[11px] text-amber-300">
                Groq (llama-3.3-70b-versatile)
              </span>
            </div>
          </div>

          {!inspectionData ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              <Terminal className="h-8 w-8 mx-auto text-slate-600 mb-2" />
              <p>No query telemetry recorded yet.</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Ask a question or click "Explain my weakest topic" above to view live retrieval and generation telemetry.
              </p>
            </div>
          ) : (
            <div>
              {/* Inspection Summary Bar */}
              <div className="p-4 bg-slate-900/90 border-b border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                    User Query
                  </span>
                  <span className="font-mono text-white text-[11px] line-clamp-1" title={inspectionData.query}>
                    "{inspectionData.query}"
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                    Security / Multi-Tenant Isolation
                  </span>
                  <span className="font-mono text-emerald-400 text-[11px]">
                    Student Scoped: {inspectionData.filtersApplied.studentId.slice(0, 14)}...
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                    Retrieved Chunks & Grounding
                  </span>
                  <span className="font-mono text-[11px] flex items-center gap-1.5">
                    <span className="text-sky-300 font-bold">{inspectionData.retrievedChunks.length} chunks</span>
                    <span>·</span>
                    <span className={inspectionData.grounded ? 'text-emerald-400' : 'text-amber-400'}>
                      {inspectionData.grounded ? 'Grounded (Verified)' : 'Refusal (Insufficient)'}
                    </span>
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                    Execution Latency
                  </span>
                  <span className="font-mono text-purple-300 text-[11px]">
                    {inspectionData.executionTimeMs || 0} ms total pipeline
                  </span>
                </div>
              </div>

              {/* Sub-Tabs */}
              <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 text-xs">
                {[
                  { id: 'chunks', label: `Retrieved Chunks (${inspectionData.retrievedChunks.length})`, icon: Layers },
                  { id: 'context', label: 'Context Passed to Groq', icon: FileCode },
                  { id: 'groq', label: 'Groq Response & Tokens', icon: Cpu },
                  { id: 'citations', label: `Citation Mapping (${inspectionData.citationMapping.length})`, icon: BookOpen },
                  { id: 'embedding', label: 'Query Embedding Vector', icon: Fingerprint },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = activeInspectTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveInspectTab(tab.id as any)}
                      className={`inline-flex items-center gap-1.5 px-4 py-2.5 font-medium border-b-2 transition-colors cursor-pointer ${
                        active
                          ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
                          : 'border-transparent text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab Contents */}
              <div className="p-5 max-h-[460px] overflow-y-auto">
                {/* 1. Retrieved Chunks Tab */}
                {activeInspectTab === 'chunks' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                      <span>Ranked semantic results from pgvector / local cosine similarity</span>
                      <span>Filtered by: Subject "{inspectionData.filtersApplied.subject || 'All'}"</span>
                    </div>

                    {inspectionData.retrievedChunks.length === 0 ? (
                      <div className="p-4 rounded-lg border border-dashed border-slate-700 text-slate-400 text-center text-xs">
                        No chunks passed the similarity threshold for this query. System properly declared insufficient evidence.
                      </div>
                    ) : (
                      inspectionData.retrievedChunks.map((chunk, idx) => (
                        <div
                          key={chunk.chunkId}
                          className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5 space-y-2 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-indigo-900/60 text-indigo-300 font-mono text-[10px] px-2 py-0.5 font-bold">
                                #{idx + 1}
                              </span>
                              <span className="font-semibold text-slate-200">
                                {chunk.documentName} · Page {chunk.pageNumber}
                              </span>
                              <span className="text-slate-500">|</span>
                              <span className="text-slate-400">{chunk.chapter}</span>
                              <span className="text-slate-500">·</span>
                              <span className="text-slate-300 font-mono text-[11px]">{chunk.section}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400">Cosine Similarity:</span>
                              <span
                                className={`rounded px-2 py-0.5 font-mono text-[11px] font-bold ${
                                  chunk.similarityScore >= 0.7
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : chunk.similarityScore >= 0.4
                                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                }`}
                              >
                                {(chunk.similarityScore * 100).toFixed(1)}% (
                                {chunk.similarityScore.toFixed(4)})
                              </span>
                            </div>
                          </div>

                          <div className="rounded bg-slate-900 p-2.5 text-[11px] text-slate-300 font-mono leading-relaxed">
                            {chunk.content}
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1">
                            <span>Chunk ID: {chunk.chunkId}</span>
                            <span>Topic: {chunk.topic}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 2. Context Passed to Groq Tab */}
                {activeInspectTab === 'context' && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-indigo-900/50 bg-indigo-950/30 p-3 text-xs text-indigo-300 space-y-1">
                      <div className="font-semibold flex items-center gap-1.5">
                        <ShieldAlert className="h-4 w-4 text-indigo-400" />
                        Prompt Injection Defense Active
                      </div>
                      <p className="text-[11px] text-slate-300">
                        Uploaded study excerpts are enclosed inside <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300">&lt;untrusted_student_context&gt;</code> tags. The Groq model is strictly instructed to treat enclosed content as passive academic data and ignore any instructions or role overrides.
                      </p>
                    </div>

                    <pre className="rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                      {inspectionData.contextPassedToGroq}
                    </pre>
                  </div>
                )}

                {/* 3. Groq Response Tab */}
                {activeInspectTab === 'groq' && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                          Configured Groq Model
                        </span>
                        <span className="font-mono text-amber-300 text-xs font-bold">
                          {inspectionData.groqModel}
                        </span>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                          Finish Reason
                        </span>
                        <span className="font-mono text-slate-200 text-xs">
                          {inspectionData.groqResponse.finishReason || 'stop'}
                        </span>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                          Token Usage
                        </span>
                        <span className="font-mono text-purple-300 text-xs">
                          {inspectionData.groqResponse.usage
                            ? `${inspectionData.groqResponse.usage.totalTokens} tokens (${inspectionData.groqResponse.usage.promptTokens} in / ${inspectionData.groqResponse.usage.completionTokens} out)`
                            : 'N/A (Streaming/Deterministic)'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-slate-300 block mb-1.5">
                        Raw Response Content from Groq:
                      </span>
                      <pre className="rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-[11px] text-slate-200 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                        {inspectionData.groqResponse.rawContent}
                      </pre>
                    </div>
                  </div>
                )}

                {/* 4. Citation Mapping Tab */}
                {activeInspectTab === 'citations' && (
                  <div className="space-y-3 text-xs">
                    <p className="text-slate-400 text-[11px]">
                      Verifies that every citation in the response references an actual verified chunk ID retrieved from the student's study materials.
                    </p>

                    {inspectionData.citationMapping.length === 0 ? (
                      <div className="p-4 rounded-lg border border-dashed border-slate-700 text-slate-400 text-center text-xs">
                        No citations generated (Insufficient evidence query was safely refused).
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-slate-800">
                        <table className="w-full text-left text-xs text-slate-300">
                          <thead className="bg-slate-950 text-[10px] text-slate-400 uppercase font-semibold border-b border-slate-800">
                            <tr>
                              <th className="p-2.5">#</th>
                              <th className="p-2.5">Chunk ID</th>
                              <th className="p-2.5">Document & Page</th>
                              <th className="p-2.5">Chapter & Section</th>
                              <th className="p-2.5">Similarity</th>
                              <th className="p-2.5">Integrity Verification</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                            {inspectionData.citationMapping.map((cit) => (
                              <tr key={cit.chunkId} className="hover:bg-slate-950/40">
                                <td className="p-2.5 text-indigo-400 font-bold">{cit.citationIndex}</td>
                                <td className="p-2.5 text-amber-300">{cit.chunkId}</td>
                                <td className="p-2.5 text-slate-200 font-sans">
                                  {cit.documentName} (Pg {cit.pageNumber})
                                </td>
                                <td className="p-2.5 text-slate-300 font-sans">
                                  {cit.chapter} · {cit.section}
                                </td>
                                <td className="p-2.5 text-sky-400">
                                  {(cit.similarityScore * 100).toFixed(1)}%
                                </td>
                                <td className="p-2.5">
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 font-sans font-semibold">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Verified Chunk
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* 5. Query Embedding Vector Tab */}
                {activeInspectTab === 'embedding' && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                          Embedding Provider
                        </span>
                        <span className="font-mono text-sky-300 text-xs font-bold">
                          {inspectionData.queryEmbeddingStatus.provider}
                        </span>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                          Output Dimensionality
                        </span>
                        <span className="font-mono text-emerald-400 text-xs font-bold">
                          {inspectionData.queryEmbeddingStatus.dimensions} dimensions (pgvector matching)
                        </span>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                          Vector Status
                        </span>
                        <span className="font-mono text-purple-300 text-xs">
                          Active · Normalized L2
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-slate-300 block mb-1.5">
                        First 8 Vector Dimensions Preview:
                      </span>
                      <pre className="rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-sky-300">
                        {JSON.stringify(inspectionData.queryEmbeddingStatus.preview, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
