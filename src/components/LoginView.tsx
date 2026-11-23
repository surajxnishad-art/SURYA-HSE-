import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, ShieldCheck, User, Building2, Briefcase } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { PLANT_ASSETS, UserProfile } from '../types';
import { BrandLogo, SafeImage } from './StatusText';

interface LoginViewProps {
  needsSetup: boolean;
  onAuthenticated: (token: string, expiresAt: string, user: UserProfile) => void;
}

export function LoginView({ needsSetup, onAuthenticated }: LoginViewProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [department, setDepartment] = useState('Corporate HSE');
  const [designation, setDesignation] = useState('Chief Safety Administrator');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (needsSetup) {
      if (password.length < 8) {
        setError('Administrator password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const endpoint = needsSetup ? '/api/auth/setup' : '/api/auth/login';
      const payload = needsSetup
        ? { fullName, email, password, department, designation }
        : { email, password };

      const res = await apiFetch<{
        token: string;
        expiresAt: string;
        user: UserProfile;
      }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onAuthenticated(res.token, res.expiresAt, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Industrial Hero Column */}
      <div className="relative lg:w-1/2 min-h-[280px] lg:min-h-screen bg-[#0B2545] flex flex-col justify-between overflow-hidden">
        <SafeImage
          src={PLANT_ASSETS.hero}
          alt="SURAJ HSE Industrial Safety Engineer"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-[#0B2545]/95 via-[#0B2545]/65 to-[#0B2545]/40"
          aria-hidden="true"
        />

        <div className="relative z-10 p-6 sm:p-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-400 flex items-center justify-center text-[#0B2545] font-display font-extrabold text-base">
              SH
            </div>
            <div>
              <p className="font-display font-bold text-white text-lg tracking-tight">SURAJ HSE</p>
              <p className="text-xs text-amber-300">Industrial Safety Management System</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 p-6 sm:p-10 max-w-xl">
          <p className="text-xs font-medium tracking-wide text-amber-300 mb-2">
            Zero Harm Operations · Steel Plants · Construction · Power &amp; Infrastructure
          </p>
          <h1 className="font-display text-2xl sm:text-4xl font-bold text-white leading-tight mb-3 text-balance">
            Safety First – Every Task, Every Person, Every Day.
          </h1>
          <p className="text-sm sm:text-base text-slate-200 leading-relaxed mb-6">
            सुरक्षा सर्वप्रथम – प्रत्येक कार्य, प्रत्येक व्यक्ति, प्रत्येक दिन। Centralized AI safety observation analysis, equipment inspections, bilingual documentation, and audit-ready Excel &amp; PDF compliance reporting.
          </p>

          <div className="grid grid-cols-3 gap-4 pt-5 border-t border-white/15 text-white">
            <div>
              <p className="font-display text-xl font-bold tabular-nums text-amber-300">17</p>
              <p className="text-xs text-slate-300">Inspection Modules</p>
            </div>
            <div>
              <p className="font-display text-xl font-bold tabular-nums text-amber-300">20</p>
              <p className="text-xs text-slate-300">HSE Doc Templates</p>
            </div>
            <div>
              <p className="font-display text-xl font-bold tabular-nums text-amber-300">EN / HI</p>
              <p className="text-xs text-slate-300">Bilingual AI &amp; Exports</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Authentication Form Column */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-12 bg-white">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <div className="lg:hidden mb-6">
              <BrandLogo size="md" />
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-900">
              {needsSetup ? 'Initialize Administrator Account' : 'Sign in to SURAJ HSE'}
            </h2>
            <p className="text-sm text-slate-600 mt-1.5">
              {needsSetup
                ? 'First-time setup: Create your primary Admin account to unlock the workspace and provision team roles.'
                : 'Enter your corporate credentials to access safety observations, inspections, and reports.'}
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {needsSetup && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Administrator Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Suraj Nishad"
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Department
                    </label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Designation
                    </label>
                    <div className="relative">
                      <Briefcase className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={designation}
                        onChange={(e) => setDesignation(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Corporate Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={needsSetup ? 'Minimum 8 characters' : 'Enter your password'}
                  className="w-full pl-9 pr-10 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {needsSetup && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg bg-[#0B2545] hover:bg-[#133563] text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              {submitting
                ? 'Authenticating...'
                : needsSetup
                  ? 'Create Admin Account & Enter Workspace'
                  : 'Sign In Securely'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
            <span>Role-Based Access: Admin · Safety Officer · Supervisor · Viewer</span>
          </div>
        </div>
      </div>
    </div>
  );
}
