import React, { useEffect, useState } from 'react';
import {
  Camera,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Shield,
  ShieldAlert,
  X,
} from 'lucide-react';
import { apiFetch, setAuthToken, setOnUnauthorized } from './lib/api';
import { UserProfile } from './types';
import { BrandLogo } from './components/StatusText';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { AiObservationView } from './components/AiObservationView';
import { AiImageGeneratorView } from './components/AiImageGeneratorView';
import { ObservationsView } from './components/ObservationsView';
import { InspectionsView } from './components/InspectionsView';
import { DocumentsView } from './components/DocumentsView';
import { ReportsExportsView } from './components/ReportsExportsView';
import { AdminView } from './components/AdminView';

type TabKey =
  | 'dashboard'
  | 'ai-observation'
  | 'ai-image'
  | 'observations'
  | 'inspections'
  | 'documents'
  | 'reports'
  | 'admin';

export default function App() {
  const [needsSetup, setNeedsSetup] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Change password modal
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdFeedback, setPwdFeedback] = useState('');

  async function refreshAuthStatus() {
    setCheckingStatus(true);
    try {
      const res = await apiFetch<{ needsSetup: boolean }>('/api/auth/status');
      setNeedsSetup(res.needsSetup);
    } catch {
      setNeedsSetup(false);
    } finally {
      setCheckingStatus(false);
    }
  }

  useEffect(() => {
    refreshAuthStatus();
    setOnUnauthorized(() => {
      setUser(null);
      setExpiresAt('');
      setAuthToken(null);
    });
  }, []);

  // Client-side session expiry check
  useEffect(() => {
    if (!expiresAt) return;
    const msLeft = new Date(expiresAt).getTime() - Date.now();
    if (msLeft <= 0) {
      handleLogout();
      return;
    }
    const timer = setTimeout(() => {
      handleLogout();
    }, msLeft);
    return () => clearTimeout(timer);
  }, [expiresAt]);

  function handleAuthenticated(token: string, expiry: string, profile: UserProfile) {
    setAuthToken(token);
    setExpiresAt(expiry);
    setUser(profile);
    setNeedsSetup(false);
    setActiveTab('dashboard');
  }

  async function handleLogout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore if already expired
    }
    setAuthToken(null);
    setUser(null);
    setExpiresAt('');
    refreshAuthStatus();
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdFeedback('');
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPwdFeedback('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => {
        setShowPwdModal(false);
        setPwdFeedback('');
      }, 1200);
    } catch (err) {
      setPwdFeedback(err instanceof Error ? err.message : 'Failed to change password.');
    }
  }

  if (checkingStatus) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <BrandLogo size="lg" />
          <p className="text-xs text-slate-500">Initializing SURAJ HSE...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView needsSetup={needsSetup} onAuthenticated={handleAuthenticated} />;
  }

  const navItems: Array<{ id: TabKey; label: string; icon: React.ReactNode; adminOnly?: boolean }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'ai-observation', label: 'AI Photo Analyzer', icon: <Camera className="w-4 h-4" /> },
    { id: 'observations', label: 'Observations', icon: <ShieldAlert className="w-4 h-4" /> },
    { id: 'inspections', label: 'Inspections (17)', icon: <ClipboardCheck className="w-4 h-4" /> },
    { id: 'documents', label: 'Safety Docs (20)', icon: <FileText className="w-4 h-4" /> },
    { id: 'ai-image', label: 'AI Image Studio', icon: <ImagePlus className="w-4 h-4" /> },
    { id: 'reports', label: 'Reports & Excel', icon: <FileSpreadsheet className="w-4 h-4" /> },
    ...(user.role === 'Admin'
      ? [{ id: 'admin' as TabKey, label: 'Admin & Audit', icon: <Shield className="w-4 h-4" />, adminOnly: true }]
      : []),
  ];

  const activeLabel = navItems.find((n) => n.id === activeTab)?.label || 'Dashboard';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-[#0B2545] text-white border-r border-slate-800 no-print">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-400 flex items-center justify-center text-[#0B2545] font-display font-extrabold text-sm shrink-0">
              SH
            </div>
            <div className="min-w-0">
              <p className="font-display font-bold text-white text-base leading-tight truncate">
                SURAJ HSE
              </p>
              <p className="text-[11px] text-amber-300 truncate">Safety First Always</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-amber-400 text-[#0B2545] font-semibold'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2.5">
          <div className="text-xs">
            <p className="font-semibold text-white truncate">{user.full_name}</p>
            <p className="text-slate-400 truncate">
              {user.role} · {user.department}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPwdModal(true)}
              className="flex-1 py-1.5 px-2.5 rounded bg-white/10 hover:bg-white/20 text-xs font-medium inline-flex items-center justify-center gap-1 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Password
            </button>
            <button
              onClick={handleLogout}
              className="py-1.5 px-2.5 rounded bg-red-600/20 hover:bg-red-600/40 text-red-200 text-xs font-medium inline-flex items-center justify-center gap-1 cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
              Exit
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-slate-500 flex items-center gap-2 truncate">
              <span className="font-display font-bold text-slate-900">SURAJ HSE</span>
              <span aria-hidden="true">/</span>
              <span className="font-medium text-slate-700 truncate">{activeLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-xs text-slate-600">
              {user.full_name} · <strong className="text-slate-900">{user.role}</strong>
            </span>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </header>

        {/* Active Module Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView user={user} onNavigate={(t) => setActiveTab(t as TabKey)} />
          )}
          {activeTab === 'ai-observation' && (
            <AiObservationView user={user} onSaved={() => {}} />
          )}
          {activeTab === 'ai-image' && <AiImageGeneratorView user={user} />}
          {activeTab === 'observations' && <ObservationsView user={user} />}
          {activeTab === 'inspections' && <InspectionsView user={user} />}
          {activeTab === 'documents' && <DocumentsView user={user} />}
          {activeTab === 'reports' && <ReportsExportsView user={user} />}
          {activeTab === 'admin' && user.role === 'Admin' && (
            <AdminView currentUser={user} />
          )}
        </main>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-[#0B2545] text-white flex flex-col h-full z-10">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <span className="font-display font-bold text-base">SURAJ HSE</span>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                    activeTab === item.id
                      ? 'bg-amber-400 text-[#0B2545] font-semibold'
                      : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            <div className="p-4 border-t border-white/10 space-y-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowPwdModal(true);
                }}
                className="w-full py-2 px-3 rounded bg-white/10 text-xs font-medium text-left"
              >
                Change Password
              </button>
              <button
                onClick={handleLogout}
                className="w-full py-2 px-3 rounded bg-red-600/20 text-red-200 text-xs font-medium text-left"
              >
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Change Password Modal */}
      {showPwdModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleChangePassword} className="bg-white rounded-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="font-display text-base font-bold text-slate-900">Change Password</h3>
              <button type="button" onClick={() => setShowPwdModal(false)} className="text-slate-500 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            {pwdFeedback && (
              <p className="text-xs font-medium p-2.5 rounded bg-slate-100 text-slate-800">{pwdFeedback}</p>
            )}
            <div className="space-y-3">
              <input
                type="password"
                required
                placeholder="Current Password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <input
                type="password"
                required
                minLength={8}
                placeholder="New Password (min 8 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowPwdModal(false)} className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B2545] text-white cursor-pointer">
                Update Password
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
