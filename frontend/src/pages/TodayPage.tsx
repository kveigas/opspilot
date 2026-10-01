import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Circle, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { Button, Card, EmptyState, Feedback, PageHeader, Stat } from '../components/ui';
import { useDemoAction } from '../api/demoActions';
import { useCampaigns } from '../state/CampaignContext';
import { REASON_EXPLANATIONS, formatDate, formatTime, humanize, pct } from '../lib/format';

interface TodayPageProps {
  onNavigate?: (tab: string) => void;
}

const sum = (rows: any[] | undefined, key: string) => (rows ?? []).reduce((n: number, row: any) => n + (row[key] ?? 0), 0);

async function optional<T>(load: (() => Promise<T>) | undefined): Promise<T | null> {
  if (typeof load !== 'function') return null;
  try { return await load(); } catch { return null; }
}

export const TodayPage: React.FC<TodayPageProps> = ({ onNavigate }) => {
  const demoAction = useDemoAction();
  const { selected, selectedId, refresh: refreshCampaigns } = useCampaigns();
  const [cockpit, setCockpit] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [outlook, setOutlook] = useState<{ forecast: any; quality: any } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [slowLoad, setSlowLoad] = useState<boolean>(false);
  const sequence = useRef(0);

  // Explain a long wait only when one happens (an idle demo server without the instant snapshot).
  useEffect(() => {
    if (!isLoading) { setSlowLoad(false); return; }
    const timer = setTimeout(() => setSlowLoad(true), 3000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  const loadData = async () => {
    const current = ++sequence.current;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      let cockpitData = await api.getTodayCockpit();
      if (cockpitData.campaign_count === 0) {
        // Only a successful, genuinely empty response may seed the demo (never after an error).
        setIsBootstrapping(true);
        await api.bootstrapDemo(false);
        cockpitData = await api.getTodayCockpit();
        void refreshCampaigns();
      }
      if (current !== sequence.current) return false;
      setCockpit(cockpitData);
      const logs = await api.getAuditLogs();
      if (current === sequence.current) setAuditLogs((logs ?? []).slice(0, 6));
      return true;
    } catch {
      if (current === sequence.current) setErrorMsg('Unable to refresh the cockpit. Existing data has not been reset. Please retry.');
      return false;
    } finally {
      if (current === sequence.current) {
        setIsBootstrapping(false);
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadData();
    return () => { sequence.current += 1; };
  }, []);

  useEffect(() => {
    if (!selectedId) { setOutlook(null); return; }
    let alive = true;
    void Promise.all([
      optional(() => api.getCampaignForecast(selectedId)),
      optional(() => api.getCampaignQuality(selectedId)),
    ]).then(([forecast, quality]) => { if (alive) setOutlook({ forecast, quality }); });
    return () => { alive = false; };
  }, [selectedId, cockpit]);

  const escalations = cockpit?.open_escalations?.length ?? 0;
  const unallocated = sum(cockpit?.unallocated_backlog_summary, 'unallocated_count');
  const awaitingQa = sum(cockpit?.qa_review_backlog_summary, 'review_backlog_count');
  const inReview = sum(cockpit?.qa_review_backlog_summary, 'in_review_count');
  const deliveryReady = cockpit?.delivery_candidates?.length ?? 0;

  const nextAction = !cockpit ? null
    : escalations > 0 ? { title: `Resolve ${escalations} open escalation${escalations === 1 ? '' : 's'}`, why: 'Open escalations block affected work and critical ones stop delivery. Record the decision before changing task state.', tab: 'qa?tab=escalations', cta: 'Open escalations' }
    : unallocated > 0 ? { title: `Allocate ${unallocated.toLocaleString()} waiting tasks`, why: 'Tasks are waiting for a qualified annotator with capacity. Quality-aware routing sends high-priority work to proven annotators.', tab: 'allocations', cta: 'Allocate work' }
    : inReview > 0 ? { title: `Review ${inReview.toLocaleString()} sampled tasks`, why: 'These tasks were selected for QA. Verdicts update each annotator’s trust tier and the campaign quality estimate.', tab: 'qa', cta: 'Start reviewing' }
    : deliveryReady > 0 ? { title: 'Check delivery readiness', why: 'At least one campaign passes its mandatory gates. Confirm the evidence before handing over.', tab: 'delivery', cta: 'Review delivery gates' }
    : { title: 'Advance the workday', why: 'Nothing is waiting on you. Advance the simulated day to move work through production and QA.', tab: null, cta: null };

  const steps = [
    { label: 'Resolve escalations', done: escalations === 0, tab: 'qa?tab=escalations' },
    { label: 'Calibrate annotators', done: true, tab: 'calibration' },
    { label: 'Allocate backlog', done: unallocated === 0, tab: 'allocations' },
    { label: 'Advance production', done: awaitingQa === 0 && unallocated === 0, tab: null },
    { label: 'Review sampled work', done: awaitingQa === 0, tab: 'qa' },
    { label: 'Check delivery gates', done: deliveryReady > 0, tab: 'delivery' },
  ];

  const forecast = outlook?.forecast;
  const quality = outlook?.quality;
  const delivered = quality?.residual_error?.estimated_delivered_accuracy;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={selected?.simulated_clock ? `Simulated day · ${formatDate(selected.operational_date)}` : 'Today'}
        title="What needs your attention"
        description="A decision brief for campaign managers: the next action, the evidence behind it, and where delivery is heading. Rules are deterministic; the forecast is a labelled estimate."
        actions={
          <Button onClick={loadData} disabled={isLoading || Boolean(demoAction)} size="sm">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
        }
      />

      {errorMsg && (
        <div role="alert" className="space-y-3 rounded-xl border border-rose-800 bg-rose-950/40 p-5 text-rose-100">
          <p className="font-semibold">Unable to start the OpsPilot demo</p>
          <p className="text-sm text-rose-200/90">{errorMsg}</p>
          <Button variant="danger" size="sm" onClick={loadData} disabled={isBootstrapping}>Retry connection</Button>
        </div>
      )}

      {isLoading && !cockpit ? (
        <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center text-sm text-slate-300">
          {isBootstrapping ? 'Preparing the synthetic demo campaign…'
            : slowLoad ? 'Loading the cockpit… The demo server was idle and can take up to a minute to start.'
            : 'Loading the cockpit…'}
        </div>
      ) : cockpit && (
        <>
          {nextAction && (
            <section aria-label="Next best action" className="rounded-xl border border-emerald-800/60 bg-gradient-to-br from-emerald-950/60 via-slate-900 to-slate-900 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-400">Next best action</p>
              <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-50">{nextAction.title}</h2>
                  <p className="mt-1 max-w-2xl text-sm text-slate-300">{nextAction.why}</p>
                </div>
                {nextAction.tab && onNavigate && (
                  <Button variant="primary" onClick={() => onNavigate(nextAction.tab!)}>
                    {nextAction.cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </section>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Open escalations" value={escalations} tone={escalations ? 'bad' : 'good'} onClick={() => onNavigate?.('qa?tab=escalations')} />
            <Stat label="Unallocated tasks" value={unallocated.toLocaleString()} tone={unallocated ? 'warn' : 'good'} onClick={() => onNavigate?.('allocations')} />
            <Stat label="Waiting for QA" value={awaitingQa.toLocaleString()} hint={inReview ? `${inReview} sampled for review` : undefined} tone={awaitingQa ? 'info' : 'good'} onClick={() => onNavigate?.('qa')} />
            <Stat label="Ready to deliver" value={deliveryReady} tone={deliveryReady ? 'good' : 'neutral'} onClick={() => onNavigate?.('delivery')} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3" title="Campaign health" subtitle="Service-level status from capacity, backlog, blockers and escalations">
              {[...(cockpit.critical_campaigns ?? []), ...(cockpit.at_risk_campaigns ?? [])].length === 0 ? (
                <EmptyState title="Every active campaign is on track" />
              ) : (
                <ul className="space-y-4">
                  {[...(cockpit.critical_campaigns ?? []), ...(cockpit.at_risk_campaigns ?? [])].map((c: any) => (
                    <li key={c.campaign_id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-100">{c.name}</span>
                        <StatusBadge status={c.sla_status} type="sla" />
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400 sm:grid-cols-3">
                        {c.capacity_ratio !== undefined && <div><dt className="inline">Capacity vs need: </dt><dd className="inline text-slate-200">{c.capacity_ratio}×</dd></div>}
                        {c.blocked_count !== undefined && <div><dt className="inline">Blocked: </dt><dd className="inline text-slate-200">{c.blocked_count}</dd></div>}
                        {c.review_backlog_count !== undefined && <div><dt className="inline">QA backlog: </dt><dd className="inline text-slate-200">{c.review_backlog_count}</dd></div>}
                      </dl>
                      {(c.reason_codes ?? []).length > 0 && (
                        <ul className="mt-3 space-y-1 text-sm">
                          {c.reason_codes.map((code: string) => (
                            <li key={code} className="text-slate-300">
                              <span className="font-medium text-amber-200">{humanize(code)}</span>
                              {REASON_EXPLANATIONS[code] && <span className="text-slate-400"> — {REASON_EXPLANATIONS[code]}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="lg:col-span-2" title="Outlook" subtitle={selected ? selected.name : 'Select a campaign'}
              actions={onNavigate && <Button size="sm" variant="ghost" onClick={() => onNavigate('quality')}>Details <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Button>}>
              {!forecast && !quality ? (
                <p className="text-sm text-slate-400">Forecast and quality evidence appear once a campaign is selected.</p>
              ) : (
                <dl className="space-y-4 text-sm">
                  {forecast?.status === 'FORECAST' && (
                    <div>
                      <dt className="text-slate-400">Likely completion</dt>
                      <dd className="mt-0.5 text-lg font-semibold text-slate-50">{formatDate(forecast.p50_date)}</dd>
                      <dd className="text-xs text-slate-400">
                        Conservative (P90): {formatDate(forecast.p90_date)} · due {formatDate(forecast.due_date)} ·{' '}
                        <span className={forecast.probability_on_time >= 0.8 ? 'text-emerald-300' : forecast.probability_on_time >= 0.5 ? 'text-amber-300' : 'text-rose-300'}>
                          {pct(forecast.probability_on_time, 0)} chance on time
                        </span>
                      </dd>
                    </div>
                  )}
                  {forecast?.status === 'NO_CAPACITY' && (
                    <div><dt className="text-slate-400">Likely completion</dt><dd className="text-rose-300">No qualified capacity: completion cannot be forecast.</dd></div>
                  )}
                  {delivered !== undefined && delivered !== null && (
                    <div>
                      <dt className="text-slate-400">Estimated delivered accuracy</dt>
                      <dd className={`mt-0.5 text-lg font-semibold ${delivered * 100 >= quality.target_quality_pct ? 'text-emerald-300' : 'text-rose-300'}`}>{pct(delivered)}</dd>
                      <dd className="text-xs text-slate-400">Target {quality.target_quality_pct}% · QA policy {quality.qa_policy === 'ADAPTIVE' ? 'adaptive' : 'flat'}</dd>
                    </div>
                  )}
                  {quality?.tier_counts?.AT_RISK > 0 && (
                    <div className="rounded-lg border border-rose-900/60 bg-rose-950/30 p-3 text-xs text-rose-200">
                      <dt className="sr-only">Annotators needing attention</dt>
                      <dd>{quality.tier_counts.AT_RISK} annotator{quality.tier_counts.AT_RISK === 1 ? ' is' : 's are'} likely below target; their work is reviewed in full.</dd>
                    </div>
                  )}
                </dl>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="Operating workflow" subtitle="The daily loop, in order">
              <ol className="space-y-2">
                {steps.map((step, index) => (
                  <li key={step.label}>
                    <button
                      type="button"
                      disabled={!step.tab || !onNavigate}
                      onClick={() => step.tab && onNavigate?.(step.tab)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-slate-800 disabled:cursor-default disabled:hover:bg-transparent disabled:opacity-100"
                    >
                      {step.done ? <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden="true" /> : <Circle className="h-5 w-5 text-slate-400" aria-hidden="true" />}
                      <span className="text-slate-400">{index + 1}.</span>
                      <span className={step.done ? 'text-slate-400' : 'text-slate-100'}>{step.label}</span>
                      <span className="sr-only">{step.done ? '(done)' : '(to do)'}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </Card>

            <Card title="Recent activity" subtitle={cockpit.evaluated_at ? `Evidence refreshed ${formatTime(cockpit.evaluated_at)}` : undefined}>
              {auditLogs.length === 0 ? (
                <p className="text-sm text-slate-400">No recent audit events.</p>
              ) : (
                <ul className="space-y-3">
                  {auditLogs.map((log) => (
                    <li key={log.id} className="flex items-start justify-between gap-4 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-200">{humanize(log.action)}</p>
                        <p className="text-xs text-slate-400">{log.summary}</p>
                      </div>
                      <time className="shrink-0 text-xs text-slate-400" dateTime={log.created_at}>{formatTime(log.created_at)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Feedback kind="info">
            Synthetic demonstration data. SLA status is rules-based, and forecasts and quality estimates show their assumptions — they are not guarantees.
          </Feedback>
        </>
      )}
    </div>
  );
};
