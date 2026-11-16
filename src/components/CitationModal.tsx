import React from 'react';
import { BookOpen, FileText, X } from 'lucide-react';
import { Citation } from '../types';

interface CitationModalProps {
  citation: Citation | null;
  onClose: () => void;
}

export const CitationModal: React.FC<CitationModalProps> = ({ citation, onClose }) => {
  if (!citation) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="citation-modal-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 id="citation-modal-title" className="text-base font-bold text-slate-900">
                Verified Source Citation
              </h3>
              <p className="text-xs text-slate-500">
                Retrieved directly from student uploaded study material
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close source citation modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3.5 text-xs border border-slate-200">
            <div>
              <span className="block font-medium text-slate-500">Source Document</span>
              <span className="mt-0.5 flex items-center gap-1.5 font-semibold text-slate-900">
                <FileText className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                {citation.documentName}
              </span>
            </div>
            <div>
              <span className="block font-medium text-slate-500">Page Number</span>
              <span className="mt-0.5 block font-mono font-semibold text-slate-900 tabular-nums">
                Page {citation.pageNumber}
              </span>
            </div>
            <div>
              <span className="block font-medium text-slate-500">Chapter</span>
              <span className="mt-0.5 block font-semibold text-slate-900">
                {citation.chapter}
              </span>
            </div>
            <div>
              <span className="block font-medium text-slate-500">Section</span>
              <span className="mt-0.5 block font-semibold text-slate-900">
                {citation.section}
              </span>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Indexed Verbatim Passage</span>
              {citation.similarityScore !== undefined && (
                <span className="font-mono tabular-nums">
                  Retrieval match: {Math.round(citation.similarityScore * 100)}%
                </span>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-sm leading-relaxed text-slate-800">
              "{citation.excerpt}"
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
            <span className="font-mono">Chunk ID: {citation.chunkId}</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Done Inspecting
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
