import React from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export const PageHeader: React.FC<{
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, description, actions }) => (
  <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
    <div className="min-w-0 space-y-1">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-400">{eyebrow}</p>}
      <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">{title}</h1>
      {description && <p className="max-w-3xl text-sm leading-relaxed text-slate-400">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

export const Card: React.FC<{
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  as?: 'section' | 'div';
  'aria-label'?: string;
}> = ({ title, subtitle, actions, className = '', children, as = 'section', ...rest }) => {
  const Tag = as;
  return (
    <Tag className={`rounded-xl border border-slate-800 bg-slate-900/70 ${className}`} aria-label={rest['aria-label']}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/80 px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-slate-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </Tag>
  );
};

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';
const TONES: Record<Tone, string> = {
  neutral: 'text-slate-100',
  good: 'text-emerald-300',
  warn: 'text-amber-300',
  bad: 'text-rose-300',
  info: 'text-sky-300',
};

export const Stat: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  onClick?: () => void;
}> = ({ label, value, hint, tone = 'neutral', onClick }) => {
  const body = (
    <>
      <span className="block text-xs font-medium text-slate-400">{label}</span>
      <span className={`mt-1 block text-2xl font-semibold tabular-nums ${TONES[tone]}`}>{value}</span>
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </>
  );
  const base = 'rounded-lg border border-slate-800 bg-slate-950/50 p-4 text-left';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${base} w-full transition hover:border-slate-600 hover:bg-slate-900`}>
      {body}
    </button>
  ) : (
    <div className={base}>{body}</div>
  );
};

export const Feedback: React.FC<{ kind: 'success' | 'error' | 'info'; children: React.ReactNode }> = ({ kind, children }) => {
  const styles = {
    success: 'border-emerald-800 bg-emerald-950/40 text-emerald-100',
    error: 'border-rose-800 bg-rose-950/40 text-rose-100',
    info: 'border-sky-800 bg-sky-950/40 text-sky-100',
  }[kind];
  const Icon = kind === 'success' ? CheckCircle2 : kind === 'error' ? AlertTriangle : Info;
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} aria-live="polite" className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${styles}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
};

export const EmptyState: React.FC<{ title: string; children?: React.ReactNode; action?: React.ReactNode }> = ({ title, children, action }) => (
  <div className="rounded-lg border border-dashed border-slate-700 px-6 py-10 text-center">
    <p className="font-medium text-slate-200">{title}</p>
    {children && <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">{children}</p>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}> = ({ variant = 'secondary', size = 'md', className = '', ...props }) => {
  const variants = {
    primary: 'bg-emerald-700 text-white hover:bg-emerald-600 border-emerald-600',
    secondary: 'bg-slate-800 text-slate-100 hover:bg-slate-700 border-slate-700',
    danger: 'bg-rose-700 text-white hover:bg-rose-600 border-rose-600',
    ghost: 'bg-transparent text-slate-300 hover:bg-slate-800 border-transparent',
  }[variant];
  const sizes = size === 'sm' ? 'px-3 text-xs' : 'px-4 text-sm';
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition ${variants} ${sizes} ${className}`}
    />
  );
};

const TIER_STYLES: Record<string, string> = {
  TRUSTED: 'bg-emerald-950 text-emerald-300 border-emerald-800',
  STANDARD: 'bg-sky-950 text-sky-300 border-sky-800',
  PROBATION: 'bg-violet-950 text-violet-300 border-violet-800',
  AT_RISK: 'bg-rose-950 text-rose-300 border-rose-800',
  FLAT: 'bg-slate-900 text-slate-300 border-slate-700',
  HISTORICAL: 'bg-slate-900 text-slate-400 border-slate-700',
};

export const TierBadge: React.FC<{ tier?: string | null }> = ({ tier }) => (
  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${TIER_STYLES[tier ?? ''] ?? TIER_STYLES.FLAT}`}>
    {tier ? tier.replace('_', ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()) : 'No record'}
  </span>
);

/** Horizontal credible interval with point estimate and target marker (values in 0..1). */
export const IntervalBar: React.FC<{ low: number; mid: number; high: number; target?: number; min?: number; label: string }> = ({
  low, mid, high, target, min = 0.6, label,
}) => {
  const scale = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (1 - min)) * 100))}%`;
  return (
    <div className="relative h-5 w-full min-w-[120px]" role="img" aria-label={label}>
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded bg-slate-800" />
      <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded bg-sky-500/60" style={{ left: scale(low), width: `calc(${scale(high)} - ${scale(low)})` }} />
      <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-950 bg-sky-300" style={{ left: scale(mid) }} />
      {target !== undefined && <div className="absolute top-0 h-5 w-px bg-amber-400" style={{ left: scale(target) }} title="Quality target" />}
    </div>
  );
};

export const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-200">{children}</kbd>
);

export const Explainer: React.FC<{ summary: string; children: React.ReactNode }> = ({ summary, children }) => (
  <details className="group rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
    <summary className="cursor-pointer list-none font-medium text-slate-200 marker:hidden">
      <span className="mr-2 inline-block transition group-open:rotate-90" aria-hidden="true">›</span>
      {summary}
    </summary>
    <div className="mt-3 space-y-2 leading-relaxed text-slate-400">{children}</div>
  </details>
);
