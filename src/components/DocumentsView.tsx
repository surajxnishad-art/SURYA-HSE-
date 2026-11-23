import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileDown,
  FileText,
  Plus,
  Printer,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { ApiError, apiFetch, downloadAuthorizedFile } from '../lib/api';
import { DOCUMENT_MODULES, SafetyDocContent, SafetyDocument, UserProfile } from '../types';

export function DocumentsView({ user }: { user: UserProfile }) {
  const canEdit = user.role !== 'Viewer';
  const isAdmin = user.role === 'Admin';

  const [documents, setDocuments] = useState<SafetyDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<{ en: string; hi?: string } | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Editable Document Fields
  const [docType, setDocType] = useState(DOCUMENT_MODULES[0]);
  const [title, setTitle] = useState('JSA: Hot Work & Gas Cutting at Steel Fabrication Bay');
  const [language, setLanguage] = useState<'Bilingual' | 'English' | 'Hindi'>('Bilingual');
  const [location, setLocation] = useState('Steel Fabrication Bay 2');
  const [department, setDepartment] = useState('Mechanical Maintenance');
  const [preparedBy, setPreparedBy] = useState(user.full_name);
  const [contextNotes, setContextNotes] = useState('');

  const [content, setContent] = useState<SafetyDocContent>({
    summary: '',
    summaryHi: '',
    ppeRequired: ['Safety Helmet', 'Safety Shoes', 'Safety Goggles', 'Fire-Retardant Gloves'],
    hazardsAndControls: [
      {
        step: '1. Area Preparation & Gas Check',
        hazard: 'Combustible materials or flammable vapor near hot work zone',
        risk: 'High',
        control: 'Remove flammables within 11m radius, deploy fire blanket & 9kg ABC extinguisher.',
        responsibility: 'Hot Work Supervisor',
      },
    ],
    verificationChecklist: [
      'Hot Work Permit signed and displayed at work location',
      'Dual-end flashback arrestors fitted on Oxy-Acetylene set',
      'Trained fire watch assigned for 30 minutes post-completion',
    ],
    emergencyNotes: 'Raise fire alarm, isolate gas cylinders immediately, and dial Plant Emergency Ext. 101.',
  });

  async function fetchDocuments() {
    try {
      const res = await apiFetch<{ documents: SafetyDocument[] }>('/api/documents');
      setDocuments(res.documents);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchDocuments();
  }, []);

  function loadDocumentIntoEditor(doc: SafetyDocument) {
    setSelectedDocId(doc.id);
    setDocType(doc.doc_type);
    setTitle(doc.title);
    setLanguage(doc.language);
    setLocation(doc.location);
    setDepartment(doc.department);
    setPreparedBy(doc.prepared_by);
    try {
      const parsed = JSON.parse(doc.content_json) as SafetyDocContent;
      setContent({
        summary: parsed.summary || '',
        summaryHi: parsed.summaryHi || '',
        ppeRequired: parsed.ppeRequired || [],
        hazardsAndControls: parsed.hazardsAndControls || [],
        verificationChecklist: parsed.verificationChecklist || [],
        emergencyNotes: parsed.emergencyNotes || '',
      });
    } catch {
      // ignore
    }
    setSuccessMsg(`Loaded ${doc.doc_code} into editor.`);
  }

  async function handleGenerateWithAi() {
    setErrorMsg(null);
    setSuccessMsg('');
    setGenerating(true);
    try {
      const res = await apiFetch<{ content: SafetyDocContent; modelUsed: string }>(
        '/api/ai/generate-document',
        {
          method: 'POST',
          body: JSON.stringify({
            docType,
            title,
            location,
            department,
            language,
            contextNotes,
          }),
        }
      );
      setContent(res.content);
      setSelectedDocId(null);
      setSuccessMsg(`AI draft generated via ${res.modelUsed}. Review, edit, and click Save Document.`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg({ en: err.message, hi: err.hindiMessage });
      } else {
        setErrorMsg({ en: err instanceof Error ? err.message : 'AI generation failed.' });
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveDocument(): Promise<SafetyDocument | null> {
    setErrorMsg(null);
    setSuccessMsg('');
    if (!title.trim()) {
      setErrorMsg({ en: 'Document title is required.' });
      return null;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ document: SafetyDocument }>('/api/documents', {
        method: 'POST',
        body: JSON.stringify({
          doc_type: docType,
          title,
          language,
          location,
          department,
          prepared_by: preparedBy,
          content,
        }),
      });
      setSelectedDocId(res.document.id);
      setSuccessMsg(`Saved as ${res.document.doc_code}. Ready for PDF and Word (.docx) download.`);
      await fetchDocuments();
      return res.document;
    } catch (err) {
      setErrorMsg({ en: err instanceof Error ? err.message : 'Save failed.' });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadPdf() {
    let docId = selectedDocId;
    if (!docId) {
      const saved = await handleSaveDocument();
      if (!saved) return;
      docId = saved.id;
    }
    await downloadAuthorizedFile(`/api/export/pdf/document/${docId}`, `SURAJ_HSE_DOC_${docId}.pdf`);
  }

  async function handleDownloadDocx() {
    let docId = selectedDocId;
    if (!docId) {
      const saved = await handleSaveDocument();
      if (!saved) return;
      docId = saved.id;
    }
    await downloadAuthorizedFile(`/api/export/docx/document/${docId}`, `SURAJ_HSE_DOC_${docId}.docx`);
  }

  async function handleDeleteDoc(id: number) {
    await apiFetch(`/api/documents/${id}`, { method: 'DELETE' });
    if (selectedDocId === id) setSelectedDocId(null);
    await fetchDocuments();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Safety Document Generator
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            20 industrial EHS document modules with bilingual AI drafting, full table editing, PDF, DOCX, and Print export.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-start gap-3 no-print">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">{errorMsg.en}</p>
            {errorMsg.hi && <p className="text-red-700 mt-0.5">{errorMsg.hi}</p>}
          </div>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-medium flex items-center gap-2 no-print">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Module Picker & Saved Docs */}
        <div className="lg:col-span-4 space-y-5 no-print">
          {canEdit && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Configure Document Module
              </h2>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Document Type (20 Modules)
                </label>
                <select
                  value={docType}
                  onChange={(e) => {
                    setDocType(e.target.value);
                    setTitle(`${e.target.value}: ${location || 'Site Operations'}`);
                    setSelectedDocId(null);
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {DOCUMENT_MODULES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as typeof language)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Bilingual">English + Hindi (Bilingual)</option>
                  <option value="English">English</option>
                  <option value="Hindi">Hindi (हिंदी)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Scope / Site Context Notes
                </label>
                <textarea
                  rows={2}
                  value={contextNotes}
                  onChange={(e) => setContextNotes(e.target.value)}
                  placeholder="Describe specific machinery, height, voltage, or contractors involved..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="button"
                onClick={handleGenerateWithAi}
                disabled={generating}
                className="w-full py-2.5 px-4 rounded-lg bg-[#0B2545] hover:bg-[#133563] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                {generating ? 'Drafting Document...' : 'Generate Document with AI'}
              </button>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h2 className="font-display text-sm font-bold text-slate-900">
              Saved Document Archive ({documents.length})
            </h2>
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {documents.map((d) => (
                <div key={d.id} className="py-2.5 flex items-start justify-between gap-2">
                  <button
                    onClick={() => loadDocumentIntoEditor(d)}
                    className="text-left min-w-0 flex-1 cursor-pointer group"
                  >
                    <p className="text-[11px] font-mono text-slate-500">
                      {d.doc_code} · {d.doc_type}
                    </p>
                    <p className="text-xs font-semibold text-slate-900 group-hover:text-blue-700 truncate">
                      {d.title}
                    </p>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() =>
                        downloadAuthorizedFile(`/api/export/pdf/document/${d.id}`, `SURAJ_HSE_${d.doc_code}.pdf`)
                      }
                      className="p-1 text-red-600 hover:bg-slate-100 rounded cursor-pointer"
                      title="Download PDF"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() =>
                        downloadAuthorizedFile(`/api/export/docx/document/${d.id}`, `SURAJ_HSE_${d.doc_code}.docx`)
                      }
                      className="p-1 text-blue-700 hover:bg-slate-100 rounded cursor-pointer"
                      title="Download DOCX"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteDoc(d.id)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Editable Document Builder & Print Preview */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 print-container">
            <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-blue-800">
                  SURAJ HSE · {docType.toUpperCase()} ({language})
                </p>
                <p className="text-[11px] text-slate-500">
                  Safety First – Every Task, Every Person, Every Day.
                </p>
              </div>
              <div className="text-xs text-slate-600 font-mono">
                {new Date().toISOString().slice(0, 10)}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Document Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!canEdit}
                  className="w-full px-3 py-2 font-semibold border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Location / Plant</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={!canEdit}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Department / Prepared By</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                  <input
                    value={preparedBy}
                    onChange={(e) => setPreparedBy(e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Scope &amp; Summary</label>
                <textarea
                  rows={2}
                  value={content.summary}
                  onChange={(e) => setContent({ ...content, summary: e.target.value })}
                  disabled={!canEdit}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Hindi Summary (हिंदी सारांश एवं मुख्य बिंदु)
                </label>
                <textarea
                  rows={2}
                  value={content.summaryHi}
                  onChange={(e) => setContent({ ...content, summaryHi: e.target.value })}
                  disabled={!canEdit}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mandatory PPE (comma separated)
                </label>
                <input
                  value={content.ppeRequired.join(', ')}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      ppeRequired: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  disabled={!canEdit}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {/* Hazards & Controls Editable Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Activity Steps, Hazards &amp; Control Measures
                </h3>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      setContent((prev) => ({
                        ...prev,
                        hazardsAndControls: [
                          ...prev.hazardsAndControls,
                          { step: '', hazard: '', risk: 'Medium', control: '', responsibility: '' },
                        ],
                      }))
                    }
                    className="text-xs font-semibold text-blue-700 inline-flex items-center gap-1 hover:underline cursor-pointer no-print"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Row
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {content.hazardsAndControls.map((row, idx) => (
                  <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50 grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                    <input
                      value={row.step}
                      onChange={(e) =>
                        setContent((prev) => ({
                          ...prev,
                          hazardsAndControls: prev.hazardsAndControls.map((r, i) =>
                            i === idx ? { ...r, step: e.target.value } : r
                          ),
                        }))
                      }
                      placeholder="Step"
                      className="sm:col-span-3 px-2 py-1.5 border border-slate-300 rounded bg-white font-medium"
                    />
                    <input
                      value={row.hazard}
                      onChange={(e) =>
                        setContent((prev) => ({
                          ...prev,
                          hazardsAndControls: prev.hazardsAndControls.map((r, i) =>
                            i === idx ? { ...r, hazard: e.target.value } : r
                          ),
                        }))
                      }
                      placeholder="Hazard"
                      className="sm:col-span-3 px-2 py-1.5 border border-slate-300 rounded bg-white"
                    />
                    <input
                      value={row.control}
                      onChange={(e) =>
                        setContent((prev) => ({
                          ...prev,
                          hazardsAndControls: prev.hazardsAndControls.map((r, i) =>
                            i === idx ? { ...r, control: e.target.value } : r
                          ),
                        }))
                      }
                      placeholder="Control Measure"
                      className="sm:col-span-4 px-2 py-1.5 border border-slate-300 rounded bg-white"
                    />
                    <div className="sm:col-span-2 flex items-center gap-1">
                      <input
                        value={row.responsibility}
                        onChange={(e) =>
                          setContent((prev) => ({
                            ...prev,
                            hazardsAndControls: prev.hazardsAndControls.map((r, i) =>
                              i === idx ? { ...r, responsibility: e.target.value } : r
                            ),
                          }))
                        }
                        placeholder="Owner"
                        className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                      />
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() =>
                            setContent((prev) => ({
                              ...prev,
                              hazardsAndControls: prev.hazardsAndControls.filter((_, i) => i !== idx),
                            }))
                          }
                          className="p-1 text-red-600 cursor-pointer no-print"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Verification Checklist */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Verification &amp; Compliance Points
                </h3>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      setContent((prev) => ({
                        ...prev,
                        verificationChecklist: [...prev.verificationChecklist, ''],
                      }))
                    }
                    className="text-xs font-semibold text-blue-700 inline-flex items-center gap-1 hover:underline cursor-pointer no-print"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Check
                  </button>
                )}
              </div>
              {content.verificationChecklist.map((chk, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-400">[ ]</span>
                  <input
                    value={chk}
                    onChange={(e) =>
                      setContent((prev) => ({
                        ...prev,
                        verificationChecklist: prev.verificationChecklist.map((v, i) =>
                          i === idx ? e.target.value : v
                        ),
                      }))
                    }
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Emergency Response Instructions
              </label>
              <textarea
                rows={2}
                value={content.emergencyNotes}
                onChange={(e) => setContent({ ...content, emergencyNotes: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-red-50/30"
              />
            </div>
          </div>

          {/* Export Toolbar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-2.5 no-print">
            {canEdit && (
              <button
                type="button"
                onClick={handleSaveDocument}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[#0B2545] hover:bg-[#133563] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Save className="w-4 h-4 text-amber-400" />
                {saving ? 'Saving...' : 'Save Document'}
              </button>
            )}
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-red-600" />
              Export PDF
            </button>
            <button
              type="button"
              onClick={handleDownloadDocx}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileDown className="w-4 h-4 text-blue-700" />
              Export DOCX
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
