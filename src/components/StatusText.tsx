import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, ShieldAlert, ShieldCheck } from 'lucide-react';

export function BrandLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-11 h-11' : 'w-9 h-9';
  return (
    <div className="flex items-center gap-3 shrink-0">
      <div className={`${dim} rounded-lg bg-[#0B2545] border border-amber-400/50 flex items-center justify-center shrink-0`}>
        <svg viewBox="0 0 40 40" className="w-6 h-6" aria-hidden="true">
          <path
            d="M20 4L7 10v9c0 8.2 5.5 15.6 13 17.8 7.5-2.2 13-9.6 13-17.8v-9L20 4z"
            fill="#F59E0B"
          />
          <path
            d="M20 8.5L11 12.6v6.2c0 5.9 3.8 11.4 9 13.2 5.2-1.8 9-7.3 9-13.2v-6.2L20 8.5z"
            fill="#0B2545"
          />
          <path
            d="M18.2 25.2l-4.2-4.2 1.9-1.9 2.3 2.3 5.9-5.9 1.9 1.9-7.8 7.8z"
            fill="#F59E0B"
          />
        </svg>
      </div>
      <span className="font-display font-bold tracking-tight text-slate-900 whitespace-nowrap">
        SURAJ HSE
      </span>
    </div>
  );
}

export function RiskText({ level }: { level: string }) {
  if (level === 'Critical') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
        Critical
      </span>
    );
  }
  if (level === 'High') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-700 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        High
      </span>
    );
  }
  if (level === 'Medium') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        Medium
      </span>
    );
  }
  if (level === 'Needs Verification') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        Needs Verification
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
      Low
    </span>
  );
}

export function StatusText({ status }: { status: string }) {
  if (status === 'Closed' || status === 'Pass' || status === 'Completed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        {status}
      </span>
    );
  }
  if (status === 'Overdue' || status === 'Fail') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        {status}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
      <Clock className="w-3.5 h-3.5 shrink-0" />
      {status}
    </span>
  );
}

export function SafeImage({
  src,
  alt,
  className = '',
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-slate-100 text-slate-400 border border-slate-200 ${className}`}
      >
        <ShieldCheck className="w-8 h-8 mb-1 text-slate-300" />
        <span className="text-xs font-medium text-slate-500 px-2 text-center">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
