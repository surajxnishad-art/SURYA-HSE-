import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  FileText,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { apiFetch, downloadAuthorizedFile } from '../lib/api';
import { Observation, SAFETY_CATEGORIES, UserProfile } from '../types';
import { RiskText, SafeImage, StatusText } from './StatusText';

export function ObservationsView({ user }: { user: UserProfile }) {
  const canEdit = user.role !== 'Viewer';
  const isAdmin = user.role === 'Admin';
  const detailCardRef = useRef<HTMLDivElement>(null);

  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [agencyFilter, setAgencyFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [riskFilter, setRiskFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modals
  const [selectedObs, setSelectedObs] = useState<Observation | null>(null);
  const [editingObs, setEditingObs] = useState<Observation | null>(null);
  const [closingObs, setClosingObs] = useState<Observation | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  // Closure state
  const [closureRemarks, setClosureRemarks] = useState('');
  const [closingDate, setClosingDate] = useState(new Date().toISOString().slice(0, 10));
  const [inchargeName, setInchargeName] = useState('');
  const [inchargeSig, setInchargeSig] = useState('');
  const [supervisorName, setSupervisorName] = useState('');
  const [supervisorSig, setSupervisorSig] = useState('');

  // New/Edit form state
  const [formState, setFormState] = useState({
    location: '',
    agency_name: '',
    job_executor: '',
    work_activity: '',
    category: SAFETY_CATEGORIES[0],
    observation_type: 'Unsafe Condition',
    title: '',
    details: '',
    details_hi: '',
    hazard: '',
    potential_consequence: '',
    risk_level: 'Medium',
    corrective_action: '',
    preventive_action: '',
    precaution: '',
    responsible_person: '',
    target_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    photo_path: '',
  });

  function buildFilterQuery(): string {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (locationFilter.trim()) params.set('location', locationFilter.trim());
    if (agencyFilter.trim()) params.set('agency', agencyFilter.trim());
    if (categoryFilter !== 'All') params.set('category', categoryFilter);
    if (riskFilter !== 'All') params.set('risk', riskFilter);
    if (statusFilter !== 'All') params.set('status', statusFilter);
    return params.toString();
  }

  async function fetchObservations() {
    setLoading(true);
    setError('');
    try {
      const qs = buildFilterQuery();
      const res = await apiFetch<{ observations: Observation[] }>(
        `/api/observations${qs ? `?${qs}` : ''}`
      );
      setObservations(res.observations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load observations.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchObservations();
  }, [categoryFilter, riskFilter, statusFilter]);

  function openEditModal(obs: Observation) {
    setEditingObs(obs);
    setFormState({
      location: obs.location,
      agency_name: obs.agency_name,
      job_executor: obs.job_executor,
      work_activity: obs.work_activity,
      category: obs.category,
      observation_type: obs.observation_type,
      title: obs.title,
      details: obs.details,
      details_hi: obs.details_hi,
      hazard: obs.hazard,
      potential_consequence: obs.potential_consequence,
      risk_level: obs.risk_level,
      corrective_action: obs.corrective_action,
      preventive_action: obs.preventive_action,
      precaution: obs.precaution,
      responsible_person: obs.responsible_person,
      target_date: obs.target_date,
      photo_path: obs.photo_path,
    });
  }

  function openNewModal() {
    setCreatingNew(true);
    setFormState({
      location: '',
      agency_name: '',
      job_executor: user.full_name,
      work_activity: '',
      category: SAFETY_CATEGORIES[0],
      observation_type: 'Unsafe Condition',
      title: '',
      details: '',
      details_hi: '',
      hazard: '',
      potential_consequence: '',
      risk_level: 'Medium',
      corrective_action: '',
      preventive_action: '',
      precaution: '',
      responsible_person: '',
      target_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      photo_path: '',
    });
  }

  async function handlePhotoUploadForForm(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.append('photo', file);
    try {
      const res = await apiFetch<{ path: string }>('/api/upload', { method: 'POST', body: fd });
      setFormState((prev) => ({ ...prev, photo_path: res.path }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed.');
    }
  }

  async function handleSaveNewOrEdit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (editingObs) {
        await apiFetch(`/api/observations/${editingObs.id}`, {
          method: 'PATCH',
          body: JSON.stringify(formState),
        });
        setEditingObs(null);
      } else {
        await apiFetch('/api/observations', {
          method: 'POST',
          body: JSON.stringify(formState),
        });
        setCreatingNew(false);
      }
      await fetchObservations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save observation.');
    }
  }

  function openCloseModal(obs: Observation) {
    setClosingObs(obs);
    setClosureRemarks(obs.closure_remarks || '');
    setClosingDate(new Date().toISOString().slice(0, 10));
    setInchargeName(obs.site_incharge_name || '');
    setInchargeSig(obs.site_incharge_signature || '');
    setSupervisorName(obs.site_supervisor_name || obs.job_executor || '');
    setSupervisorSig(obs.site_supervisor_signature || '');
  }

  async function handleConfirmClosure(e: React.FormEvent) {
    e.preventDefault();
    if (!closingObs) return;
    try {
      await apiFetch(`/api/observations/${closingObs.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'Closed',
          closure_remarks: closureRemarks,
          closing_date: closingDate,
          site_incharge_name: inchargeName,
          site_incharge_signature: inchargeSig,
          site_supervisor_name: supervisorName,
          site_supervisor_signature: supervisorSig,
        }),
      });
      setClosingObs(null);
      await fetchObservations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close observation.');
    }
  }

  async function handleDelete(obs: Observation) {
    try {
      await apiFetch(`/api/observations/${obs.id}`, { method: 'DELETE' });
      await fetchObservations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  }

  async function handleDownloadDetailPng(obs: Observation) {
    if (!detailCardRef.current) return;
    try {
      const dataUrl = await toPng(detailCardRef.current, { backgroundColor: '#ffffff', pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `SURAJ_HSE_${obs.obs_code}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      setError('Could not export card image.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Safety Observation Register
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Track open, closed, and overdue site observations, assign CAPA owners, and export with embedded photo evidence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canEdit && (
            <button
              onClick={openNewModal}
              className="px-3.5 py-2 rounded-lg bg-[#0B2545] hover:bg-[#133563] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              Log Observation
            </button>
          )}
          <button
            onClick={() => {
              const qs = buildFilterQuery();
              downloadAuthorizedFile(
                `/api/export/excel/observations${qs ? `?${qs}` : ''}`,
                'SURAJ_HSE_OBSERVATIONS.xlsx'
              );
            }}
            className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            Export Excel
          </button>
          <button
            onClick={() => {
              const qs = buildFilterQuery();
              downloadAuthorizedFile(
                `/api/export/pdf/observations${qs ? `?${qs}` : ''}`,
                'SURAJ_HSE_OBSERVATIONS_REPORT.pdf'
              );
            }}
            className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FileText className="w-4 h-4 text-red-600" />
            Export PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Search & Filter Panel */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchObservations()}
              placeholder="Search ID, title, hazard, location, Hindi/English details..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <input
            type="text"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            placeholder="Filter by Location"
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
          <input
            type="text"
            value={agencyFilter}
            onChange={(e) => setAgencyFilter(e.target.value)}
            placeholder="Filter by Agency"
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-center">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
            title="From date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
            title="To date"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="All">All Categories</option>
            {SAFETY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="All">All Risk Levels</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
            <option value="Needs Verification">Needs Verification</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="All">All Statuses</option>
            <option value="Open">Open</option>
            <option value="Overdue">Overdue</option>
            <option value="Closed">Closed</option>
          </select>
          <button
            type="button"
            onClick={fetchObservations}
            className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
          >
            Apply Filters
          </button>
        </div>
      </div>

      {/* Register Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4 whitespace-nowrap">Obs ID</th>
                <th className="py-3 px-4 whitespace-nowrap">Date</th>
                <th className="py-3 px-4">Observation &amp; Location</th>
                <th className="py-3 px-4 whitespace-nowrap">Agency</th>
                <th className="py-3 px-4 whitespace-nowrap">Risk</th>
                <th className="py-3 px-4 whitespace-nowrap">Target</th>
                <th className="py-3 px-4 whitespace-nowrap">Status</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    Loading observation records...
                  </td>
                </tr>
              ) : observations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    No observations match the selected filters.
                  </td>
                </tr>
              ) : (
                observations.map((obs) => (
                  <tr key={obs.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap tabular-nums">
                      {obs.obs_code}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500 whitespace-nowrap tabular-nums">
                      {obs.observed_at.slice(0, 10)}
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <p className="font-medium text-slate-900 line-clamp-1">{obs.title}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {obs.location} · {obs.category}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                      {obs.agency_name}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <RiskText level={obs.risk_level} />
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap tabular-nums">
                      {obs.target_date}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusText status={obs.status} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => setSelectedObs(obs)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            downloadAuthorizedFile(
                              `/api/export/pdf/observation/${obs.id}`,
                              `SURAJ_HSE_${obs.obs_code}.pdf`
                            )
                          }
                          className="p-1.5 rounded hover:bg-slate-100 text-red-600 cursor-pointer"
                          title="Download Individual PDF"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => openEditModal(obs)}
                            className="p-1.5 rounded hover:bg-slate-100 text-blue-700 cursor-pointer"
                            title="Edit Observation"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        {canEdit && obs.status !== 'Closed' && (
                          <button
                            onClick={() => openCloseModal(obs)}
                            className="p-1.5 rounded hover:bg-emerald-50 text-emerald-700 cursor-pointer"
                            title="Close Observation with Sign-Off"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(obs)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                            title="Delete (Admin Only)"
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

      {/* View Detail Modal */}
      {selectedObs && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <div>
                <p className="text-xs font-mono text-slate-500">{selectedObs.obs_code}</p>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Observation Report Details
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadDetailPng(selectedObs)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  PNG
                </button>
                <button
                  onClick={() =>
                    downloadAuthorizedFile(
                      `/api/export/pdf/observation/${selectedObs.id}`,
                      `SURAJ_HSE_${selectedObs.obs_code}.pdf`
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-[#0B2545] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  PDF
                </button>
                <button
                  onClick={() => setSelectedObs(null)}
                  className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div ref={detailCardRef} className="p-6 space-y-4 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <div>
                  <p className="text-xs font-semibold text-blue-800">
                    SURAJ HSE · {selectedObs.obs_code}
                  </p>
                  <h4 className="font-display text-lg font-bold text-slate-900 mt-0.5">
                    {selectedObs.title}
                  </h4>
                </div>
                <div className="flex items-center gap-3">
                  <RiskText level={selectedObs.risk_level} />
                  <StatusText status={selectedObs.status} />
                </div>
              </div>

              {selectedObs.photo_path && (
                <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-900">
                  <SafeImage
                    src={selectedObs.photo_path}
                    alt={selectedObs.title}
                    className="w-full max-h-72 object-contain"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-slate-500">Location</p>
                  <p className="font-semibold text-slate-900 mt-0.5">{selectedObs.location}</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-slate-500">Agency / Contractor</p>
                  <p className="font-semibold text-slate-900 mt-0.5">{selectedObs.agency_name}</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-slate-500">Responsible Person</p>
                  <p className="font-semibold text-slate-900 mt-0.5">{selectedObs.responsible_person}</p>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Details (English)</p>
                  <p className="text-slate-800 mt-0.5">{selectedObs.details}</p>
                </div>
                {selectedObs.details_hi && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Hindi Explanation (हिंदी विवरण)</p>
                    <p className="text-slate-800 mt-0.5">{selectedObs.details_hi}</p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Hazard</p>
                    <p className="text-slate-800 mt-0.5">{selectedObs.hazard}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Potential Consequence</p>
                    <p className="text-slate-800 mt-0.5">{selectedObs.potential_consequence}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Corrective Action</p>
                    <p className="text-slate-800 mt-0.5">{selectedObs.corrective_action}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Preventive Action</p>
                    <p className="text-slate-800 mt-0.5">{selectedObs.preventive_action || '-'}</p>
                  </div>
                </div>
                {selectedObs.status === 'Closed' && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs space-y-1">
                    <p className="font-semibold text-emerald-900">
                      Closed on {selectedObs.closing_date}: {selectedObs.closure_remarks}
                    </p>
                    <p className="text-emerald-800">
                      Supervisor: {selectedObs.site_supervisor_name} ({selectedObs.site_supervisor_signature}) · Site In-charge: {selectedObs.site_incharge_name} ({selectedObs.site_incharge_signature})
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {(creatingNew || editingObs) && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveNewOrEdit}
            className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-display text-base font-bold text-slate-900">
                {editingObs ? `Edit ${editingObs.obs_code}` : 'Log New Safety Observation'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setCreatingNew(false);
                  setEditingObs(null);
                }}
                className="p-1 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Title *</label>
                <input
                  required
                  value={formState.title}
                  onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Location *</label>
                <input
                  required
                  value={formState.location}
                  onChange={(e) => setFormState({ ...formState, location: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Agency / Contractor</label>
                <input
                  value={formState.agency_name}
                  onChange={(e) => setFormState({ ...formState, agency_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Job Executor</label>
                <input
                  value={formState.job_executor}
                  onChange={(e) => setFormState({ ...formState, job_executor: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Work Activity</label>
                <input
                  value={formState.work_activity}
                  onChange={(e) => setFormState({ ...formState, work_activity: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                <select
                  value={formState.category}
                  onChange={(e) => setFormState({ ...formState, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {SAFETY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Risk Level</label>
                <select
                  value={formState.risk_level}
                  onChange={(e) => setFormState({ ...formState, risk_level: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                  <option value="Needs Verification">Needs Verification</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Hazard *</label>
                <input
                  required
                  value={formState.hazard}
                  onChange={(e) => setFormState({ ...formState, hazard: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Potential Consequence</label>
                <input
                  value={formState.potential_consequence}
                  onChange={(e) => setFormState({ ...formState, potential_consequence: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Corrective Action *</label>
                <textarea
                  required
                  rows={2}
                  value={formState.corrective_action}
                  onChange={(e) => setFormState({ ...formState, corrective_action: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Responsible Person</label>
                <input
                  value={formState.responsible_person}
                  onChange={(e) => setFormState({ ...formState, responsible_person: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Date</label>
                <input
                  type="date"
                  value={formState.target_date}
                  onChange={(e) => setFormState({ ...formState, target_date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Hindi Explanation</label>
                <textarea
                  rows={2}
                  value={formState.details_hi}
                  onChange={(e) => setFormState({ ...formState, details_hi: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              {!editingObs && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Attach Photo Evidence (Optional)
                  </label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => handlePhotoUploadForForm(e.target.files?.[0])}
                    className="text-xs"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setCreatingNew(false);
                  setEditingObs(null);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B2545] text-white cursor-pointer"
              >
                Save Observation
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Closure Modal with Signatures */}
      {closingObs && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleConfirmClosure} className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-display text-base font-bold text-slate-900">
                Close Observation {closingObs.obs_code}
              </h3>
              <button type="button" onClick={() => setClosingObs(null)} className="text-slate-500 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Closure Remarks *</label>
                <textarea
                  required
                  rows={2}
                  value={closureRemarks}
                  onChange={(e) => setClosureRemarks(e.target.value)}
                  placeholder="Describe verified corrective actions taken at site..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Closing Date *</label>
                <input
                  type="date"
                  required
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Site Supervisor Name</label>
                  <input
                    required
                    value={supervisorName}
                    onChange={(e) => setSupervisorName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Supervisor Sign-Off</label>
                  <input
                    required
                    value={supervisorSig}
                    onChange={(e) => setSupervisorSig(e.target.value)}
                    placeholder="Initials / Digital Sign"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Site In-Charge Name</label>
                  <input
                    required
                    value={inchargeName}
                    onChange={(e) => setInchargeName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">In-Charge Sign-Off</label>
                  <input
                    required
                    value={inchargeSig}
                    onChange={(e) => setInchargeSig(e.target.value)}
                    placeholder="Initials / Digital Sign"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button type="button" onClick={() => setClosingObs(null)} className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer">
                Confirm Closure
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
