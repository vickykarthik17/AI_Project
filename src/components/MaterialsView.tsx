import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Eye,
  FileText,
  FileUp,
  Layers,
  Loader2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest } from '../api';
import { DocumentChunk, DocumentType, ProcessingStatus, StudyMaterial } from '../types';

const PIPELINE_STAGES: ProcessingStatus[] = [
  'Uploaded',
  'Extracting',
  'Chunking',
  'Embedding',
  'Indexed',
];

const QUICK_SAMPLE_TEXT = `Page 82
Chapter 6: Immunology and Immune Defense
Section: Humoral and Cell-Mediated Immunity
B lymphocytes mature in the bone marrow and mediate humoral immunity by differentiating into plasma cells that secrete antigen-specific antibodies (immunoglobulins). Helper T cells (CD4+) recognize antigens presented on MHC Class II molecules by antigen-presenting cells, releasing cytokines that activate both B cells and cytotoxic T lymphocytes (CD8+), which induce apoptosis in virus-infected host cells presenting MHC Class I complexes.
Page 84
Section: Primary vs Secondary Immune Response
Immunological memory relies on long-lived memory B and T cells generated during the primary exposure. Upon secondary exposure to the same pathogen, memory cells mount a significantly faster, higher-affinity IgG antibody response.`;

export const MaterialsView: React.FC = () => {
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeStage, setActiveStage] = useState<ProcessingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Upload form state
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Biology');
  const [docType, setDocType] = useState<DocumentType>('Textbook');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('All');

  // Chunk Inspector Modal
  const [inspectingMaterial, setInspectingMaterial] = useState<StudyMaterial | null>(null);
  const [inspectedChunks, setInspectedChunks] = useState<DocumentChunk[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);

  const loadMaterials = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ materials: StudyMaterial[] }>('/materials');
      setMaterials(res.materials);
    } catch (err: any) {
      setError(err.message || 'Failed to load study materials.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMaterials();
  }, []);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!selectedFile && rawText.trim().length < 20) {
      setError(
        'Please select a PDF/TXT file to upload or paste at least 20 characters of study material text.'
      );
      return;
    }

    setUploading(true);
    try {
      // Step through visible pipeline stages so student sees real-time progress
      for (const stage of ['Uploaded', 'Extracting', 'Chunking', 'Embedding'] as ProcessingStatus[]) {
        setActiveStage(stage);
        await new Promise((r) => setTimeout(r, 160));
      }

      let res: any;
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('subject', subject.trim() || 'Biology');
        formData.append('docType', docType);
        if (title.trim()) formData.append('title', title.trim());

        res = await apiRequest('/materials/upload', {
          method: 'POST',
          body: formData,
        });
      } else {
        const cleanTitle = title.trim() || `${subject} ${docType} Notes`;
        res = await apiRequest('/materials/upload', {
          method: 'POST',
          body: JSON.stringify({
            title: cleanTitle,
            fileName: `${cleanTitle.replace(/\s+/g, '_')}.txt`,
            subject: subject.trim() || 'Biology',
            docType,
            rawText: rawText.trim(),
            fileSize: rawText.trim().length,
          }),
        });
      }

      setActiveStage('Indexed');
      setSuccessMsg(
        res.duplicateDetected
          ? `Document "${res.material.title}" was already indexed (${res.chunksIndexed} chunks) - duplicate processing prevented.`
          : `Indexed "${res.material.title}" into ${res.chunksIndexed} chunks across ${res.extractedPages || res.material.pageCount} pages with Gemini Embeddings in pgvector.${
              res.generatedTopicsCount ? ` Extracted ${res.generatedTopicsCount} syllabus topics.` : ''
            }`
      );
      setTitle('');
      setSelectedFile(null);
      setRawText('');
      await loadMaterials();
    } catch (err: any) {
      setActiveStage('Failed');
      setError(err.message || 'Document upload and ingestion failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (materialId: string) => {
    try {
      await apiRequest(`/materials/${materialId}`, { method: 'DELETE' });
      setMaterials((prev) => prev.filter((m) => m.id !== materialId));
    } catch (err: any) {
      setError(err.message || 'Could not delete material.');
    }
  };

  const handleInspectChunks = async (material: StudyMaterial) => {
    setInspectingMaterial(material);
    setLoadingChunks(true);
    try {
      const res = await apiRequest<{ chunks: DocumentChunk[] }>(`/materials/${material.id}/chunks`);
      setInspectedChunks(res.chunks);
    } catch (err: any) {
      setError(err.message || 'Could not load document chunks.');
    } finally {
      setLoadingChunks(false);
    }
  };

  const subjects = ['All', ...Array.from(new Set(materials.map((m) => m.subject)))];
  const filteredMaterials =
    subjectFilter === 'All'
      ? materials
      : materials.filter((m) => m.subject === subjectFilter);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Upload & Index Study Materials
            </h2>
            <p className="text-xs text-slate-500">
              Upload Syllabus PDFs, Textbook Chapters, Study Notes, Past Examination Papers, or Plain Text files
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setTitle('Chapter 6: Immunology & Immune Defense');
              setSubject('Biology');
              setDocType('Textbook');
              setRawText(QUICK_SAMPLE_TEXT);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 cursor-pointer shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Load Sample Chapter (Immunology) to Test Pipeline
          </button>
        </div>

        {/* Processing Status Pipeline Bar */}
        {activeStage && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
              <span>Document Ingestion & RAG Indexing Pipeline</span>
              <span
                className={`font-mono ${
                  activeStage === 'Failed'
                    ? 'text-red-600'
                    : activeStage === 'Ready' || activeStage === 'Indexed'
                    ? 'text-emerald-600'
                    : 'text-indigo-600'
                }`}
              >
                Status: {activeStage}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {PIPELINE_STAGES.map((st, idx) => {
                const currentIdx = PIPELINE_STAGES.indexOf(
                  activeStage === 'Failed' ? 'Extracting' : activeStage
                );
                const isDone = idx <= currentIdx && activeStage !== 'Failed';
                return (
                  <div
                    key={st}
                    className={`rounded-md py-1.5 px-2 text-center text-xs font-medium border ${
                      isDone
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-white text-slate-400'
                    }`}
                  >
                    {idx + 1}. {st}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700"
          >
            {error}
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800 flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleUploadSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="mat-title"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Document Title
              </label>
              <input
                id="mat-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Chapter 6: Immunology"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="mat-subject"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Subject
              </label>
              <input
                id="mat-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Biology, Mathematics, Chemistry..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="mat-doctype"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Document Type
              </label>
              <select
                id="mat-doctype"
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocumentType)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
              >
                <option value="Syllabus">Syllabus PDF / Outline</option>
                <option value="Textbook">Textbook Chapter PDF</option>
                <option value="Study Notes">Study Notes</option>
                <option value="Past Paper">Past Examination Question Paper</option>
                <option value="Plain Text">Plain Text File</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="mat-file"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Upload File (.pdf, .txt, .md)
              </label>
              <label
                htmlFor="mat-file"
                className="flex flex-col items-center justify-center h-36 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/60 p-4 text-center hover:border-indigo-500 cursor-pointer"
              >
                <FileUp className="h-6 w-6 text-indigo-600 mb-2" />
                <span className="text-xs font-semibold text-slate-800">
                  {selectedFile ? selectedFile.name : 'Click to choose a PDF or Text document'}
                </span>
                <span className="mt-1 text-[11px] text-slate-500">
                  Preserves page numbers, chapter headings, and sections
                </span>
                <input
                  id="mat-file"
                  type="file"
                  accept=".pdf,.txt,.md"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="sr-only"
                />
              </label>
            </div>

            <div>
              <label
                htmlFor="mat-rawtext"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Or Paste Study Material / Syllabus / Past Paper Text Directly
              </label>
              <textarea
                id="mat-rawtext"
                rows={5}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Page 1&#10;Chapter 1: Topic Name&#10;Section: Key Concept&#10;Paste textbook paragraphs, syllabus units, or past exam questions here..."
                className="w-full h-36 rounded-lg border border-slate-300 p-3 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing & Generating Embeddings...
                </>
              ) : (
                <>
                  <Database className="h-4 w-4" />
                  Process, Chunk & Index Material
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Indexed Materials List */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Indexed Study Materials ({filteredMaterials.length})
            </h3>
            <p className="text-xs text-slate-500">
              Preloaded demonstration materials are clearly labelled as Sample Data
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {subjects.map((subj) => (
              <button
                key={subj}
                type="button"
                onClick={() => setSubjectFilter(subj)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  subjectFilter === subj
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {subj}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-16 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
            <p className="text-sm font-semibold text-slate-800">No study materials uploaded yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Upload your syllabus or textbook PDF above to start building your RAG index.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="py-3 pr-4">Document</th>
                  <th className="py-3 px-4">Subject · Type</th>
                  <th className="py-3 px-4 text-right">Pages</th>
                  <th className="py-3 px-4 text-right">Indexed Chunks</th>
                  <th className="py-3 px-4">Pipeline Status</th>
                  <th className="py-3 pl-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredMaterials.map((mat) => (
                  <tr key={mat.id} className="hover:bg-slate-50/80">
                    <td className="py-3.5 pr-4">
                      <div className="flex items-center gap-2.5">
                        <FileText className="h-4 w-4 text-indigo-600 shrink-0" />
                        <div>
                          <div className="font-bold text-slate-900">{mat.title}</div>
                          <div className="text-[11px] text-slate-500">
                            {mat.fileName}
                            {mat.isSample && ' · Sample Data'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      {mat.subject} · {mat.docType}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {mat.pageCount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-indigo-700">
                      {mat.chunkCount}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`font-semibold ${
                          mat.status === 'Ready' || mat.status === 'Indexed'
                            ? 'text-emerald-700'
                            : mat.status === 'Failed'
                            ? 'text-red-600'
                            : 'text-amber-600'
                        }`}
                      >
                        {mat.status}
                      </span>
                    </td>
                    <td className="py-3.5 pl-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleInspectChunks(mat)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5 text-indigo-600" />
                          Inspect Chunks
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(mat.id)}
                          aria-label={`Delete ${mat.title}`}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Chunk & Embedding Inspector Modal */}
      {inspectingMaterial && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chunk-inspector-title"
        >
          <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h3 id="chunk-inspector-title" className="text-base font-bold text-slate-900">
                  Indexed Chunks & Vector Embeddings: {inspectingMaterial.title}
                </h3>
                <p className="text-xs text-slate-500">
                  Document: {inspectingMaterial.fileName} · {inspectedChunks.length} semantic chunks indexed
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingMaterial(null)}
                aria-label="Close chunk inspector"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto space-y-3 pr-1">
              {loadingChunks ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Loading indexed chunks...
                </div>
              ) : (
                inspectedChunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-xs space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-slate-500 font-mono">
                      <span>
                        ID: {chunk.id} · Page {chunk.pageNumber} · {chunk.chapter}
                      </span>
                      <span className="text-indigo-700 font-semibold">
                        Topic: {chunk.topic} ({chunk.section})
                      </span>
                    </div>
                    <p className="text-slate-800 leading-relaxed">{chunk.content}</p>
                    <div className="pt-1 text-[11px] font-mono text-slate-400 truncate">
                      Embedding Vector ({chunk.embedding.length}-dim): [
                      {chunk.embedding.slice(0, 6).join(', ')}, ...]
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
