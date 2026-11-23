import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch, downloadAuthorizedFile } from '../lib/api';
import { DashboardData, PLANT_ASSETS, UserProfile } from '../types';
import { RiskText, SafeImage, StatusText } from './StatusText';

interface DashboardViewProps {
  user: UserProfile;
  onNavigate: (tab: string) => void;
}

const RISK_COLORS: Record<string, string> = {
  Critical: '#DC2626',
  High: '#EA580C',
  Medium: '#D97706',
  Low: '#16A34A',
  'Needs Verification': '#2563EB',
};

const STATUS_COLORS: Record<string, string> = {
  Open: '#D97706',
  Closed: '#16A34A',
  Overdue: '#DC2626',
};

export function DashboardView({ user, onNavigate }: DashboardViewProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  async function loadDashboard() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<DashboardData>('/api/dashboard');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function handleMonthlyExcel() {
    setExporting(true);
    try {
      await downloadAuthorizedFile('/api/export/excel/monthly-hse', 'SURAJ_HSE_MONTHLY_REPORT.xlsx');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Excel export failed.');
    } finally {
      setExporting(false);
    }
  }

  const canCreate = user.role !== 'Viewer';

  const facilityCards = [
    {
      title: 'Steel Plant & Crane Bays',
      subtitle: 'Heavy lifting, EOT cranes & rolling mill walkways',
      img: PLANT_ASSETS.steelPlant,
      targetTab: 'inspections',
    },
    {
      title: 'Construction & Work at Height',
      subtitle: 'Scaffolding tags, guardrails & fall arrest harnesses',
      img: PLANT_ASSETS.construction,
      targetTab: 'observations',
    },
    {
      title: 'Warehouse & Forklift Lanes',
      subtitle: 'Pedestrian segregation, racking & fire points',
      img: PLANT_ASSETS.warehouse,
      targetTab: 'inspections',
    },
    {
      title: 'Power Plant & Switchgear',
      subtitle: 'LOTO isolation, arc-flash PPE & electrical panels',
      img: PLANT_ASSETS.electrical,
      targetTab: 'documents',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Corporate Industrial Safety Hero Banner */}
      <section className="relative rounded-xl overflow-hidden border border-slate-200 bg-[#0B2545] min-h-[220px] flex items-center">
        <SafeImage
          src={PLANT_ASSETS.infrastructure}
          alt="SURAJ HSE Industrial Complex and Infrastructure Operations"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-[#0B2545]/95 via-[#0B2545]/85 to-[#0B2545]/45"
          aria-hidden="true"
        />
        <div className="relative z-10 w-full p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-amber-300 mb-1.5">
              SURAJ HSE Executive Command · {user.role} · {user.department}
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white leading-tight text-balance">
              Safety First – Every Task, Every Person, Every Day.
            </h1>
            <p className="text-sm text-slate-200 mt-2 leading-relaxed">
              Live plant-wide safety observations, equipment compliance inspections, CAPA closure tracking, and bilingual HSE reporting powered by database telemetry.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {canCreate && (
              <button
                onClick={() => onNavigate('ai-observation')}
                className="px-4 py-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-[#0B2545] font-semibold text-sm transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                Analyze Site Photo
              </button>
            )}
            <button
              onClick={handleMonthlyExcel}
              disabled={exporting}
              className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/25 font-medium text-sm transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <FileSpreadsheet className="w-4 h-4 text-amber-300" />
              {exporting ? 'Generating XLSX...' : 'Export Monthly HSE Excel'}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={loadDashboard}
            className="text-xs font-semibold underline hover:text-red-950 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Grid */}
      {loading || !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="h-24 rounded-xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Total Safety Observations"
              value={data.kpis.totalObservations}
              sub={`${data.kpis.incidentsCount} incidents logged`}
              icon={<ClipboardCheck className="w-5 h-5 text-blue-700" />}
            />
            <KpiCard
              label="Open Observations"
              value={data.kpis.openObservations}
              sub="Active site follow-ups"
              icon={<Clock className="w-5 h-5 text-amber-600" />}
            />
            <KpiCard
              label="Closed Observations"
              value={data.kpis.closedObservations}
              sub="Verified & signed off"
              icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            />
            <KpiCard
              label="High / Critical Risk"
              value={data.kpis.highCriticalObservations}
              sub="Immediate priority controls"
              icon={<ShieldAlert className="w-5 h-5 text-red-600" />}
            />
            <KpiCard
              label="Total Inspections"
              value={data.kpis.totalInspections}
              sub="Across 17 equipment modules"
              icon={<ClipboardCheck className="w-5 h-5 text-slate-700" />}
            />
            <KpiCard
              label="Pending Corrective Actions"
              value={data.kpis.pendingCorrectiveActions}
              sub="Observations + inspections"
              icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
            />
            <KpiCard
              label="Overdue Actions"
              value={data.kpis.overdueActions}
              sub="Past target closure date"
              icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
            />
            <KpiCard
              label="Documents Generated"
              value={data.kpis.documentsGenerated}
              sub={`${data.kpis.trainingsCount} trainings · ${data.kpis.auditsCount} audits`}
              icon={<FileText className="w-5 h-5 text-blue-700" />}
            />
          </div>

          {/* Analytics Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Monthly Safety Observation Trend
                  </h2>
                  <p className="text-xs text-slate-500">
                    Total logged vs closed vs high/critical observations by month
                  </p>
                </div>
                <button
                  onClick={loadDashboard}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                  title="Refresh dashboard metrics"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.charts.monthlyObservations}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#475569' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="total" name="Total Logged" fill="#0B2545" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="closed" name="Closed" fill="#16A34A" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="highCritical" name="High / Critical" fill="#DC2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="font-display text-base font-bold text-slate-900">
                Observation Status Breakdown
              </h2>
              <p className="text-xs text-slate-500 mb-3">
                Current open, overdue &amp; closed ratio
              </p>
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.charts.statusBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={76}
                      paddingAngle={3}
                    >
                      {data.charts.statusBreakdown.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={STATUS_COLORS[entry.name] || '#64748B'}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Risk Category & Top Hazard Categories */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="font-display text-base font-bold text-slate-900">
                Risk Level Distribution
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Observations classified by severity rating
              </p>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.charts.riskBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="Observations" radius={[0, 4, 4, 0]}>
                      {data.charts.riskBreakdown.map((entry) => (
                        <Cell key={entry.name} fill={RISK_COLORS[entry.name] || '#1E40AF'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="font-display text-base font-bold text-slate-900">
                Safety Category Breakdown
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Leading hazard domains across plant sites
              </p>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.charts.categoryBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={54} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Count" fill="#1E40AF" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Industrial Operations Photography Strip */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Industrial Operational Modules
                </h2>
                <p className="text-xs text-slate-500">
                  Direct access to field inspection standards and hazard registers
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {facilityCards.map((card) => (
                <button
                  key={card.title}
                  onClick={() => onNavigate(card.targetTab)}
                  className="group text-left bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-blue-400 transition-colors cursor-pointer"
                >
                  <div className="aspect-[4/3] overflow-hidden bg-slate-100">
                    <SafeImage
                      src={card.img}
                      alt={card.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="font-display text-sm font-bold text-slate-900">
                      {card.title}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1">{card.subtitle}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Recent Observations & Audit Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Latest Safety Observations
                </h2>
                <button
                  onClick={() => onNavigate('observations')}
                  className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                >
                  View Register
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {data.recentObservations.map((obs) => (
                  <div key={obs.id} className="px-5 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-slate-500 tabular-nums">
                        {obs.obs_code} · {obs.observed_at.slice(0, 10)}
                      </p>
                      <p className="text-sm font-medium text-slate-900 truncate mt-0.5">
                        {obs.title}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{obs.location}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <RiskText level={obs.risk_level} />
                      <StatusText status={obs.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Recent System Activities
                </h2>
                {user.role === 'Admin' && (
                  <button
                    onClick={() => onNavigate('admin')}
                    className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                  >
                    Audit Logs
                  </button>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {data.recentActivities.length === 0 ? (
                  <p className="p-5 text-sm text-slate-500">No recent activities logged yet.</p>
                ) : (
                  data.recentActivities.slice(0, 6).map((act) => (
                    <div key={act.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">
                          {act.action.replace(/_/g, ' ')} {act.entity_id ? `· ${act.entity_id}` : ''}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {act.user_email} {act.details ? `· ${act.details}` : ''}
                        </p>
                      </div>
                      <span className="text-xs font-mono text-slate-400 tabular-nums shrink-0">
                        {act.created_at.slice(11, 16)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
          {value}
        </p>
        <p className="text-xs text-slate-500 mt-1">{sub}</p>
      </div>
      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 shrink-0">
        {icon}
      </div>
    </div>
  );
}
