import React, { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { Button, Card, EmptyState, Feedback, PageHeader } from '../components/ui';
import { useCampaigns } from '../state/CampaignContext';
import { formatDate, formatDateTime, pct } from '../lib/format';

const GATES: Record<string, { title: string; fix: string; tab: string }> = {
  VOLUME_COMPLETE: { title: 'All tasks completed', fix: 'Keep work moving through allocation, production and QA.', tab: 'execution' },
  REVIEW_REQUIREMENT_COMPLETE: { title: 'Required QA reviews done', fix: 'Review the sampled tasks waiting in the QA queue.', tab: 'qa' },
  QUALITY_TARGET_MET: { title: 'Quality target met', fix: 'Inspect annotator trust and delivered accuracy.', tab: 'quality' },
  NO_CRITICAL_ESCALATIONS: { title: 'No critical escalations open', fix: 'Resolve critical escalations with a recorded decision.', tab: 'qa?tab=escalations' },
  NO_BLOCKED_TASKS: { title: 'No blocked tasks', fix: 'Unblock tasks once the underlying issue is resolved.', tab: 'execution' },
};

export const DeliveryPage: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const { selectedId, selected } = useCampaigns();
  const [readiness, setReadiness] = useState<any>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshReadiness = async () => {
    if (!selectedId) { setIsLoading(false); return; }
    setIsLoading(true);
    setError(null);
    try {
      const [gates, outlook] = await Promise.all([
        api.getDeliveryReadiness(selectedId),
        typeof api.getCampaignForecast === 'function' ? api.getCampaignForecast(selectedId).catch(() => null) : Promise.resolve(null),
      ]);
      setReadiness(gates);
      setForecast(outlook);
    } catch {
      setError('Delivery gates could not be evaluated. Nothing has changed; retry.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void refreshReadiness(); }, [selectedId]);

  const passed = readiness?.gates?.filter((g: any) => g.passed).length ?? 0;
  const total = readiness?.gates?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Deliver"
        title="Campaign Delivery Readiness"
        description="A campaign can be handed over only when every mandatory gate passes. Each gate shows its evidence and what to do if it fails."
        actions={<Button size="sm" onClick={refreshReadiness} disabled={isLoading || !selectedId}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Re-evaluate</Button>}
      />
      {error && <Feedback kind="error">{error}</Feedback>}
      {!selectedId && !isLoading && <EmptyState title="No campaign selected" />}

      {readiness && (
        <section aria-label="Delivery verdict" className={`flex flex-col gap-4 rounded-xl border p-6 sm:flex-row sm:items-center sm:justify-between ${
          readiness.status === 'READY' ? 'border-emerald-800 bg-emerald-950/40'
          : readiness.status === 'READY_WITH_WARNINGS' ? 'border-amber-800 bg-amber-950/30' : 'border-rose-900 bg-rose-950/30'}`}>
          <div>
            <p className="text-sm text-slate-300">{selected?.name}</p>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-2xl font-semibold text-slate-50">{readiness.status === 'NOT_READY' ? 'Not ready to deliver' : readiness.status === 'READY' ? 'Ready to deliver' : 'Ready, with warnings'}</span>
              <StatusBadge status={readiness.status} />
            </div>
            <p className="mt-1 text-xs text-slate-400">{passed} of {total} gates passed · evaluated {formatDateTime(readiness.evaluated_at)}</p>
          </div>
          {forecast?.status === 'FORECAST' && (
            <dl className="text-sm sm:text-right">
              <dt className="text-slate-400">Likely completion</dt>
              <dd className="text-lg font-semibold text-slate-50">{formatDate(forecast.p50_date)}</dd>
              <dd className="text-xs text-slate-400">P90 {formatDate(forecast.p90_date)} · {pct(forecast.probability_on_time, 0)} chance by {formatDate(forecast.due_date)}</dd>
            </dl>
          )}
        </section>
      )}

      {isLoading && !readiness ? (
        <p className="text-sm text-slate-400">Evaluating delivery gates…</p>
      ) : readiness && (
        <>
          <Card title="Mandatory gates">
            <ul className="divide-y divide-slate-800/70">
              {readiness.gates.map((g: any) => {
                const meta = GATES[g.gate] ?? { title: g.gate, fix: '', tab: '' };
                return (
                  <li key={g.gate} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-start md:justify-between">
                    <div className="flex gap-3">
                      {g.passed
                        ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
                        : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" aria-hidden="true" />}
                      <div>
                        <p className="font-medium text-slate-100">{meta.title} <span className="sr-only">{g.passed ? 'passed' : 'failed'}</span></p>
                        <p className="text-sm text-slate-400">{g.reason}</p>
                        {g.evidence && <p className="mt-1 font-mono text-xs text-slate-400">Evidence: {g.evidence}</p>}
                      </div>
                    </div>
                    {!g.passed && meta.tab && onNavigate && (
                      <Button size="sm" onClick={() => onNavigate(meta.tab)} title={meta.fix}>Fix this</Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          {readiness.warnings.length > 0 && (
            <Feedback kind="info">
              <p className="font-medium">Warnings</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">{readiness.warnings.map((w: string) => <li key={w}>{w}</li>)}</ul>
            </Feedback>
          )}
        </>
      )}
    </div>
  );
};
