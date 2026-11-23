import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { apiFetch, downloadAuthorizedFile } from '../lib/api';
import { ChecklistItem, INSPECTION_MODULES, Inspection, UserProfile } from '../types';
import { RiskText, SafeImage, StatusText } from './StatusText';

export function InspectionsView({ user }: { user: UserProfile }) {
  const canEdit = user.role !== 'Viewer';
  const isAdmin = user.role === 'Admin';

  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [moduleFilter, setModuleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [selectedInsp, setSelectedInsp] = useState<Inspection | null>(null);

  const [moduleType, setModuleType] = useState(INSPECTION_MODULES[0].name);
  const [equipmentId, setEquipmentId] = useState('');
  const [location, setLocation] = useState('');
  const [inspectorName, setInspectorName] = useState(user.full_name);
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().slice(0, 10));
  const [riskLevel, setRiskLevel] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Low');
  const [remarks, setRemarks] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [targetDate, setTargetDate] = useState(new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));
  const [photoPath, setPhotoPath] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>(
    INSPECTION_MODULES[0].items.map((item) => ({ item, status: 'Compliant', notes: '' }))
  );

  async function fetchInspections() {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (moduleFilter !== 'All') qs.set('moduleType', moduleFilter);
      if (statusFilter !== 'All') qs.set('status', statusFilter);
      if (search.trim()) qs.set('search', search.trim());
      const res = await apiFetch<{ inspections: Inspection[] }>(
        `/api/inspections${qs.toString() ? `?${qs.toString()}` : ''}`
      );
      setInspections(res.inspections);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inspections.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchInspections();
  }, [moduleFilter, statusFilter]);

  function handleModuleChange(nextModule: string) {
    setModuleType(nextModule);
    const modDef = INSPECTION_MODULES.find((m) => m.name === nextModule);
    if (modDef) {
      setChecklist(modDef.items.map((item) => ({ item, status: 'Compliant', notes: '' })));
    }
  }

  async function handlePhotoUpload(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.append('photo', file);
    try {
      const res = await apiFetch<{ path: string }>('/api/upload', { method: 'POST', body: fd });
      setPhotoPath(res.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed.');
    }
  }

  async function handleCreateInspection(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const hasFail = checklist.some((c) => c.status === 'Non-Compliant');
      const res = await apiFetch<{ inspection: Inspection }>('/api/inspections', {
        method: 'POST',
        body: JSON.stringify({
          module_type: moduleType,
          equipment_id: equipmentId,
          location,
          inspector_name: inspectorName,
          inspection_date: inspectionDate,
          checklist,
          overall_status: hasFail ? 'Action Required' : 'Pass',
          risk_level: riskLevel,
          remarks,
          photo_path: photoPath,
          corrective_action: correctiveAction,
          responsible_person: responsiblePerson,
          target_date: targetDate,
        }),
      });
      setShowModal(false);
      setSuccess(`Inspection ${res.inspection.insp_code} saved.`);
      setEquipmentId('');
      setRemarks('');
      setPhotoPath('');
      await fetchInspections();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save inspection.');
    }
  }

  async function handleDelete(id: number) {
    try {
      await apiFetch(`/api/inspections/${id}`, { method: 'DELETE' });
      await fetchInspections();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Equipment &amp; Site Inspections
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            17 specialized industrial inspection checklists with photo evidence, CAPA tracking, PDF reports, and Excel export.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canEdit && (
            <button
              onClick={() => setShowModal(true)}
              className="px-3.5 py-2 rounded-lg bg-[#0B2545] hover:bg-[#133563] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              New Inspection
            </button>
          )}
          <button
            onClick={() =>
              downloadAuthorizedFile(
                '/api/export/excel/inspections',
                'SURAJ_HSE_EQUIPMENT_INSPECTIONS.xlsx'
              )
            }
            className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            Export Excel
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {success}
        </div>
      )}

      {/* Module Selector Ribbon */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setModuleFilter('All')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
              moduleFilter === 'All'
                ? 'bg-[#0B2545] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All Modules (17)
          </button>
          {INSPECTION_MODULES.map((m) => (
            <button
              key={m.name}
              onClick={() => setModuleFilter(m.name)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                moduleFilter === m.name
                  ? 'bg-[#0B2545] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchInspections()}
              placeholder="Search equipment ID, location, inspector..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="All">All Statuses</option>
            <option value="Pass">Pass</option>
            <option value="Action Required">Action Required</option>
            <option value="Fail">Fail</option>
          </select>
          <button
            onClick={fetchInspections}
            className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer"
          >
            Search
          </button>
        </div>
      </div>

      {/* Inspection Register Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Module</th>
                <th className="py-3 px-4">Equipment / Asset</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4">Inspector &amp; Date</th>
                <th className="py-3 px-4">Risk</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Loading inspection register...
                  </td>
                </tr>
              ) : inspections.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No inspections found for this filter.
                  </td>
                </tr>
              ) : (
                inspections.map((insp) => (
                  <tr key={insp.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {insp.insp_code}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-800 whitespace-nowrap">
                      {insp.module_type}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-slate-900">
                      {insp.equipment_id}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{insp.location}</td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {insp.inspector_name} · <span className="font-mono tabular-nums">{insp.inspection_date}</span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <RiskText level={insp.risk_level} />
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusText status={insp.overall_status} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => setSelectedInsp(insp)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
                          title="View Checklist Details"
                        >
                          <ClipboardCheck className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            downloadAuthorizedFile(
                              `/api/export/pdf/inspection/${insp.id}`,
                              `SURAJ_HSE_${insp.insp_code}.pdf`
                            )
                          }
                          className="p-1.5 rounded hover:bg-slate-100 text-red-600 cursor-pointer"
                          title="Download Inspection PDF"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(insp.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Checklist Detail Modal */}
      {selectedInsp && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <p className="text-xs font-mono text-slate-500">{selectedInsp.insp_code}</p>
                <h3 className="font-display text-base font-bold text-slate-900">
                  {selectedInsp.module_type} — {selectedInsp.equipment_id}
                </h3>
              </div>
              <button onClick={() => setSelectedInsp(null)} className="text-slate-500 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedInsp.photo_path && (
              <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-900">
                <SafeImage
                  src={selectedInsp.photo_path}
                  alt={selectedInsp.equipment_id}
                  className="w-full max-h-60 object-contain"
                />
              </div>
            )}

            <div className="space-y-2">
              {(JSON.parse(selectedInsp.checklist_json || '[]') as ChecklistItem[]).map((c, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      {idx + 1}. {c.item}
                    </p>
                    {c.notes && <p className="text-xs text-slate-600 mt-0.5">Remarks: {c.notes}</p>}
                  </div>
                  <StatusText status={c.status === 'Compliant' ? 'Pass' : c.status === 'Non-Compliant' ? 'Fail' : 'N/A'} />
                </div>
              ))}
            </div>

            <div className="text-xs text-slate-700 space-y-1 pt-2 border-t border-slate-200">
              <p><strong>Remarks:</strong> {selectedInsp.remarks || '-'}</p>
              <p><strong>Corrective Action:</strong> {selectedInsp.corrective_action || 'None'}</p>
              <p><strong>Responsible:</strong> {selectedInsp.responsible_person || '-'} · Target: {selectedInsp.target_date || '-'}</p>
            </div>
          </div>
        </div>
      )}

      {/* New Inspection Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateInspection}
            className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-display text-base font-bold text-slate-900">
                Conduct Equipment / Site Inspection
              </h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-500 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Inspection Module *</label>
                <select
                  value={moduleType}
                  onChange={(e) => handleModuleChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {INSPECTION_MODULES.map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Equipment / Area Tag ID *</label>
                <input
                  required
                  value={equipmentId}
                  onChange={(e) => setEquipmentId(e.target.value)}
                  placeholder="e.g. FE-SMS-012 or Crane #2"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Location *</label>
                <input
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Plant / Zone"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Inspector *</label>
                  <input
                    required
                    value={inspectorName}
                    onChange={(e) => setInspectorName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={inspectionDate}
                    onChange={(e) => setInspectionDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* Checklist Items */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700">Inspection Checklist Items</p>
              {checklist.map((row, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900">
                      {idx + 1}. {row.item}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {(['Compliant', 'Non-Compliant', 'Not Applicable'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() =>
                            setChecklist((prev) =>
                              prev.map((c, i) => (i === idx ? { ...c, status: st } : c))
                            )
                          }
                          className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                            row.status === st
                              ? st === 'Compliant'
                                ? 'bg-emerald-700 text-white'
                                : st === 'Non-Compliant'
                                  ? 'bg-red-700 text-white'
                                  : 'bg-slate-700 text-white'
                              : 'bg-white border border-slate-300 text-slate-700'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={row.notes}
                    onChange={(e) =>
                      setChecklist((prev) =>
                        prev.map((c, i) => (i === idx ? { ...c, notes: e.target.value } : c))
                      )
                    }
                    placeholder="Item remarks (optional)"
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Risk Level</label>
                <select
                  value={riskLevel}
                  onChange={(e) => setRiskLevel(e.target.value as typeof riskLevel)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Photo Evidence</label>
                <label className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg cursor-pointer text-xs text-slate-700 bg-slate-50">
                  <Upload className="w-4 h-4" />
                  <span>{photoPath ? 'Photo uploaded' : 'Upload Equipment Photo'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e.target.files?.[0])}
                  />
                </label>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Corrective Action</label>
                <input
                  value={correctiveAction}
                  onChange={(e) => setCorrectiveAction(e.target.value)}
                  placeholder="Required corrective action if non-compliant"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Responsible Person</label>
                <input
                  value={responsiblePerson}
                  onChange={(e) => setResponsiblePerson(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Date</label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">General Remarks</label>
                <input
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B2545] text-white cursor-pointer"
              >
                Save Inspection
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
