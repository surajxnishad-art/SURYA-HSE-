import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, FileText, Plus, X } from 'lucide-react';
import { apiFetch, downloadAuthorizedFile } from '../lib/api';
import { AuditRecord, IncidentRecord, TrainingRecord, UserProfile } from '../types';
import { StatusText } from './StatusText';

export function ReportsExportsView({ user }: { user: UserProfile }) {
  const canEdit = user.role !== 'Viewer';
  const [subTab, setSubTab] = useState<'exports' | 'incidents' | 'trainings' | 'audits'>('exports');
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [trainings, setTrainings] = useState<TrainingRecord[]>([]);
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Quick add modals
  const [showAddModal, setShowAddModal] = useState<'incident' | 'training' | 'audit' | null>(null);
  const [formVal, setFormVal] = useState<Record<string, string>>({});

  async function loadRegisters() {
    try {
      const res = await apiFetch<{
        incidents: IncidentRecord[];
        trainings: TrainingRecord[];
        audits: AuditRecord[];
      }>('/api/registers/summary');
      setIncidents(res.incidents);
      setTrainings(res.trainings);
      setAudits(res.audits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load registers.');
    }
  }

  useEffect(() => {
    loadRegisters();
  }, []);

  async function triggerExcel(type: string, filename: string) {
    setDownloading(type);
    setError('');
    try {
      await downloadAuthorizedFile(`/api/export/excel/${type}`, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Excel export failed.');
    } finally {
      setDownloading(null);
    }
  }

  async function handleSaveEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!showAddModal) return;
    try {
      const endpoint =
        showAddModal === 'incident'
          ? '/api/incidents'
          : showAddModal === 'training'
            ? '/api/trainings'
            : '/api/audits';
      await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(formVal),
      });
      setShowAddModal(null);
      setFormVal({});
      await loadRegisters();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save entry.');
    }
  }

  const excelCards = [
    {
      type: 'observations',
      title: 'Safety Observation Register',
      desc: 'All observations with embedded photos, English/Hindi details, CAPA, and sign-offs.',
      filename: 'SURAJ_HSE_OBSERVATIONS.xlsx',
    },
    {
      type: 'inspections',
      title: 'Equipment Inspection Register',
      desc: 'All 17 equipment & site inspection modules with checklist findings and photos.',
      filename: 'SURAJ_HSE_INSPECTIONS.xlsx',
    },
    {
      type: 'corrective-actions',
      title: 'Corrective Action Register',
      desc: 'Consolidated CAPA tracker across open, overdue, and closed observations & inspections.',
      filename: 'SURAJ_HSE_CAPA_REGISTER.xlsx',
    },
    {
      type: 'trainings',
      title: 'Training Register',
      desc: 'Safety induction, work-at-height, and toolbox training attendance & hours.',
      filename: 'SURAJ_HSE_TRAININGS.xlsx',
    },
    {
      type: 'incidents',
      title: 'Incident & Near-Miss Register',
      desc: 'Near misses, first aid, LTI, property damage, root causes & corrective actions.',
      filename: 'SURAJ_HSE_INCIDENTS.xlsx',
    },
    {
      type: 'audits',
      title: 'Safety Audit Register',
      desc: 'Internal & ISO 45001 HSE audits, scores, findings, and open non-conformities.',
      filename: 'SURAJ_HSE_AUDITS.xlsx',
    },
    {
      type: 'monthly-hse',
      title: 'Monthly HSE Management Report',
      desc: 'Multi-sheet executive workbook combining KPI summary, observations, inspections, incidents, trainings & audits.',
      filename: 'SURAJ_HSE_MONTHLY_REPORT.xlsx',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Reports, Registers &amp; Excel Exports
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Download formatted multi-sheet Excel (.xlsx) workbooks with Hindi Unicode &amp; embedded photos, or manage Incident, Training &amp; Audit registers.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Segmented Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-xl w-fit">
        {[
          { id: 'exports', label: 'Excel & PDF Export Hub' },
          { id: 'incidents', label: `Incidents (${incidents.length})` },
          { id: 'trainings', label: `Trainings (${trainings.length})` },
          { id: 'audits', label: `Audits (${audits.length})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id as typeof subTab)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              subTab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'exports' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {excelCards.map((card) => (
            <div key={card.type} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-emerald-700 mb-2">
                  <FileSpreadsheet className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-wide">XLSX Workbook</span>
                </div>
                <h2 className="font-display text-base font-bold text-slate-900">{card.title}</h2>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{card.desc}</p>
              </div>
              <button
                onClick={() => triggerExcel(card.type, card.filename)}
                disabled={downloading === card.type}
                className="w-full py-2 px-3 rounded-lg bg-[#0B2545] hover:bg-[#133563] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                {downloading === card.type ? 'Preparing XLSX...' : 'Download Excel (.xlsx)'}
              </button>
            </div>
          ))}

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-red-700 mb-2">
                <FileText className="w-5 h-5" />
                <span className="text-xs font-bold uppercase tracking-wide">PDF Summary</span>
              </div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Complete Observations Summary PDF
              </h2>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Landscape formatted PDF register with company header, risk ratings, and action owners.
              </p>
            </div>
            <button
              onClick={() =>
                downloadAuthorizedFile('/api/export/pdf/observations', 'SURAJ_HSE_OBSERVATIONS_REPORT.pdf')
              }
              className="w-full py-2 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-red-600" />
              Download PDF Report
            </button>
          </div>
        </div>
      )}

      {subTab === 'incidents' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-slate-900">Incident &amp; Near-Miss Register</h2>
            <div className="flex items-center gap-2">
              {canEdit && (
                <button
                  onClick={() => {
                    setFormVal({ incident_type: 'Near Miss', severity: 'Medium', status: 'Open', incident_date: new Date().toISOString().slice(0, 10) });
                    setShowAddModal('incident');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#0B2545] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  Log Incident
                </button>
              )}
              <button
                onClick={() => triggerExcel('incidents', 'SURAJ_HSE_INCIDENTS.xlsx')}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                Excel
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Type &amp; Severity</th>
                  <th className="py-3 px-4">Location &amp; Description</th>
                  <th className="py-3 px-4">Corrective Action</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {incidents.map((inc) => (
                  <tr key={inc.id}>
                    <td className="py-3 px-4 font-mono text-xs font-semibold tabular-nums">{inc.inc_code}</td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">{inc.incident_date}</td>
                    <td className="py-3 px-4 text-xs font-semibold">{inc.incident_type} · {inc.severity}</td>
                    <td className="py-3 px-4 text-xs">
                      <p className="font-semibold text-slate-900">{inc.location}</p>
                      <p className="text-slate-600">{inc.description}</p>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">{inc.corrective_action}</td>
                    <td className="py-3 px-4"><StatusText status={inc.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'trainings' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-slate-900">Safety Training Register</h2>
            <div className="flex items-center gap-2">
              {canEdit && (
                <button
                  onClick={() => {
                    setFormVal({ training_date: new Date().toISOString().slice(0, 10), attendees_count: '20', duration_hours: '1.5', status: 'Completed' });
                    setShowAddModal('training');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#0B2545] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  Log Training
                </button>
              )}
              <button
                onClick={() => triggerExcel('trainings', 'SURAJ_HSE_TRAININGS.xlsx')}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                Excel
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Topic</th>
                  <th className="py-3 px-4">Trainer &amp; Location</th>
                  <th className="py-3 px-4">Attendees</th>
                  <th className="py-3 px-4">Hours</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trainings.map((t) => (
                  <tr key={t.id}>
                    <td className="py-3 px-4 font-mono text-xs font-semibold tabular-nums">{t.trn_code}</td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">{t.training_date}</td>
                    <td className="py-3 px-4 text-xs font-semibold text-slate-900">{t.topic}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{t.trainer_name} · {t.location}</td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">{t.attendees_count}</td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">{t.duration_hours}</td>
                    <td className="py-3 px-4"><StatusText status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'audits' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-slate-900">Safety Audit Register</h2>
            <div className="flex items-center gap-2">
              {(user.role === 'Admin' || user.role === 'Safety Officer') && (
                <button
                  onClick={() => {
                    setFormVal({ audit_date: new Date().toISOString().slice(0, 10), score_percent: '92', findings_count: '3', open_nc_count: '1', status: 'Open' });
                    setShowAddModal('audit');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#0B2545] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  Log Audit
                </button>
              )}
              <button
                onClick={() => triggerExcel('audits', 'SURAJ_HSE_AUDITS.xlsx')}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                Excel
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Audit Type</th>
                  <th className="py-3 px-4">Location &amp; Auditor</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Open NCs</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {audits.map((a) => (
                  <tr key={a.id}>
                    <td className="py-3 px-4 font-mono text-xs font-semibold tabular-nums">{a.aud_code}</td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">{a.audit_date}</td>
                    <td className="py-3 px-4 text-xs font-semibold text-slate-900">{a.audit_type}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{a.location} · {a.lead_auditor}</td>
                    <td className="py-3 px-4 font-mono text-xs font-semibold tabular-nums">{a.score_percent}%</td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">{a.open_nc_count} / {a.findings_count}</td>
                    <td className="py-3 px-4"><StatusText status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleSaveEntry} className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-display text-base font-bold text-slate-900 capitalize">
                Add {showAddModal} Record
              </h3>
              <button type="button" onClick={() => setShowAddModal(null)} className="text-slate-500 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              {showAddModal === 'incident' && (
                <>
                  <input required placeholder="Location" onChange={(e) => setFormVal({ ...formVal, location: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                  <input required placeholder="Incident Type (Near Miss / First Aid / LTI)" value={formVal.incident_type || ''} onChange={(e) => setFormVal({ ...formVal, incident_type: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                  <textarea required placeholder="Description" rows={2} onChange={(e) => setFormVal({ ...formVal, description: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                  <input placeholder="Root Cause" onChange={(e) => setFormVal({ ...formVal, root_cause: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                  <input required placeholder="Corrective Action" onChange={(e) => setFormVal({ ...formVal, corrective_action: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                </>
              )}
              {showAddModal === 'training' && (
                <>
                  <input required placeholder="Training Topic (English / Hindi)" onChange={(e) => setFormVal({ ...formVal, topic: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                  <input required placeholder="Trainer Name" onChange={(e) => setFormVal({ ...formVal, trainer_name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                  <input required placeholder="Location" onChange={(e) => setFormVal({ ...formVal, location: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" placeholder="Attendees" value={formVal.attendees_count || ''} onChange={(e) => setFormVal({ ...formVal, attendees_count: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                    <input type="number" step="0.5" placeholder="Duration (hrs)" value={formVal.duration_hours || ''} onChange={(e) => setFormVal({ ...formVal, duration_hours: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                  </div>
                </>
              )}
              {showAddModal === 'audit' && (
                <>
                  <input required placeholder="Audit Type (e.g. ISO 45001 Safety Audit)" onChange={(e) => setFormVal({ ...formVal, audit_type: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                  <input required placeholder="Location" onChange={(e) => setFormVal({ ...formVal, location: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                  <input required placeholder="Lead Auditor" onChange={(e) => setFormVal({ ...formVal, lead_auditor: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                  <div className="grid grid-cols-3 gap-2">
                    <input type="number" placeholder="Score %" value={formVal.score_percent || ''} onChange={(e) => setFormVal({ ...formVal, score_percent: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                    <input type="number" placeholder="Findings" value={formVal.findings_count || ''} onChange={(e) => setFormVal({ ...formVal, findings_count: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                    <input type="number" placeholder="Open NCs" value={formVal.open_nc_count || ''} onChange={(e) => setFormVal({ ...formVal, open_nc_count: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                  </div>
                  <textarea placeholder="Audit Summary" rows={2} onChange={(e) => setFormVal({ ...formVal, summary: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button type="button" onClick={() => setShowAddModal(null)} className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B2545] text-white cursor-pointer">
                Save Record
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
