import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import { Button, Card, EmptyState, Explainer, Feedback, IntervalBar, PageHeader, Stat, TierBadge } from '../components/ui';
import { useCampaigns } from '../state/CampaignContext';
import { formatDate, number, pct } from '../lib/format';

const TIER_ORDER = ['TRUSTED', 'STANDARD', 'PROBATION', 'AT_RISK'];
const TIER_COLORS: Record<string, string> = {
  TRUSTED: 'bg-emerald-500',
  STANDARD: 'bg-sky-500',
  PROBATION: 'bg-violet-500',
  AT_RISK: 'bg-rose-500',
};

export const QualityPage: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const { selected, selectedId, refresh } = useCampaigns();
  const [report, setReport] = useState<any>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const [quality, outlook] = await Promise.all([api.getCampaignQuality(id), api.getCampaignForecast(id)]);
      setReport(quality);
      setForecast(outlook);
    } catch {
      setError('Quality evidence could not be loaded. Retry, or check that the API is reachable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedId) void load(selectedId);
  }, [selectedId]);

  const switchPolicy = async (policy: 'FLAT' | 'ADAPTIVE') => {
    if (!selectedId) return;
    setSaving(true);
    setFeedback(null);
    try {
      await api.updateCampaign(selectedId, { qa_policy: policy });
      await Promise.all([load(selectedId), refresh()]);
      setFeedback(policy === 'ADAPTIVE'
        ? 'Adaptive QA enabled. Future sampling follows each annotator’s trust tier; past decisions are unchanged.'
        : 'Flat QA enabled. Future sampling reviews every annotator at the base rate.');
    } catch {
      setError('The QA policy could not be changed. Nothing was modified; please retry.');
    } finally {
      setSaving(false);
    }
  };

  if (!selectedId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Quality" title="Quality insights" />
        <EmptyState title="No campaign selected">Create or select a campaign to see annotator trust and quality estimates.</EmptyState>
      </div>
    );
  }

  const workers: any[] = report?.workers ?? [];
  const totalWorkers = workers.length || 1;
  const firstPass = report?.first_pass_quality;
  const residual = report?.residual_error;
  const effort = report?.review_effort;
  const target = report ? report.target_quality_pct / 100 : 0.95;
  const adaptive = report?.qa_policy === 'ADAPTIVE';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Quality"
        title="Quality insights"
        description="How good is the delivered data, who needs closer review, and is review effort going where errors are? Estimates come from QA verdicts on this campaign."
        actions={onNavigate && <Button size="sm" onClick={() => onNavigate('qa')}>Go to QA review</Button>}
      />

      {error && <Feedback kind="error">{error} <button className="ml-2 underline" onClick={() => load(selectedId)}>Retry</button></Feedback>}
      {feedback && <Feedback kind="success">{feedback}</Feedback>}

      <Card
        title={<span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" /> QA sampling policy</span>}
        subtitle={selected?.name}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl text-sm text-slate-300">
            {adaptive ? (
              <p><strong className="text-slate-50">Adaptive (trust-based).</strong> Proven annotators are spot-checked at {report?.tier_sampling_pct?.TRUSTED}% of their work, the base rate of {report?.base_sampling_pct}% applies while evidence accumulates, new annotators are reviewed at {report?.tier_sampling_pct?.PROBATION}% and anyone likely below target has every task reviewed.</p>
            ) : (
              <p><strong className="text-slate-50">Flat.</strong> Every annotator’s work is sampled at {report?.base_sampling_pct ?? '—'}%, regardless of their track record.</p>
            )}
          </div>
          <div className="flex shrink-0 gap-2" role="group" aria-label="QA sampling policy">
            <Button size="sm" variant={adaptive ? 'primary' : 'secondary'} aria-pressed={adaptive} disabled={saving || adaptive || !report} onClick={() => switchPolicy('ADAPTIVE')}>Adaptive</Button>
            <Button size="sm" variant={!adaptive ? 'primary' : 'secondary'} aria-pressed={!adaptive} disabled={saving || !adaptive || !report} onClick={() => switchPolicy('FLAT')}>Flat</Button>
          </div>
        </div>
      </Card>

      {loading && !report ? (
        <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center text-sm text-slate-300">Loading quality evidence…</div>
      ) : report && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Estimated delivered accuracy"
              value={residual?.estimated_delivered_accuracy != null ? pct(residual.estimated_delivered_accuracy) : '—'}
              hint={`Target ${report.target_quality_pct}% · ${number(residual?.expected_undetected_errors)} likely undetected errors`}
              tone={residual?.estimated_delivered_accuracy == null ? 'neutral' : residual.estimated_delivered_accuracy >= target ? 'good' : 'bad'}
            />
            <Stat
              label="First-pass acceptance"
              value={firstPass ? pct(firstPass.estimate) : '—'}
              hint={firstPass ? `90% interval ${pct(firstPass.lower_90)}–${pct(firstPass.upper_90)} · ${firstPass.reviews} reviews` : 'No QA verdicts yet'}
              tone="info"
            />
            <Stat
              label="Review effort vs flat policy"
              value={effort?.review_effort_ratio != null ? `${(effort.review_effort_ratio).toFixed(2)}×` : '—'}
              hint={effort?.tasks_through_sampling
                ? `${number(effort.expected_reviews_under_policy)} vs ${number(effort.expected_reviews_under_flat_policy)} reviews over ${number(effort.tasks_through_sampling)} tasks${
                  effort.review_effort_ratio > 1 && report.tier_counts?.AT_RISK
                    ? ' — higher because at-risk annotators are fully reviewed; see the equal-quality comparison below'
                    : ''}`
                : 'No tasks sampled under the live policy yet'}
            />
            <Stat
              label="Likely completion"
              value={forecast?.status === 'FORECAST' ? formatDate(forecast.p50_date) : forecast?.status === 'COMPLETE' ? 'Complete' : '—'}
              hint={forecast?.status === 'FORECAST' ? `P90 ${formatDate(forecast.p90_date)} · ${pct(forecast.probability_on_time, 0)} chance on time` : forecast?.status === 'NO_CAPACITY' ? 'No qualified capacity' : undefined}
              tone={forecast?.probability_on_time >= 0.8 ? 'good' : forecast?.probability_on_time >= 0.5 ? 'warn' : 'neutral'}
            />
          </div>

          <Card title="Annotator trust" subtitle="Tier from the probability each annotator meets the quality target, given their QA verdicts">
            <div className="mb-5">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800" role="img" aria-label={TIER_ORDER.map(t => `${report.tier_counts?.[t] ?? 0} ${t.toLowerCase().replace('_', ' ')}`).join(', ')}>
                {TIER_ORDER.map(tier => (
                  <div key={tier} className={TIER_COLORS[tier]} style={{ width: `${((report.tier_counts?.[tier] ?? 0) / totalWorkers) * 100}%` }} />
                ))}
              </div>
              <ul className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
                {TIER_ORDER.map(tier => (
                  <li key={tier} className="flex gap-2">
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${TIER_COLORS[tier]}`} aria-hidden="true" />
                    <span><strong className="text-slate-200">{report.tier_counts?.[tier] ?? 0} {tier.toLowerCase().replace('_', ' ')}</strong> · reviewed at {report.tier_sampling_pct?.[tier]}%<br />{report.tier_explanations?.[tier]}</span>
                  </li>
                ))}
              </ul>
            </div>

            {workers.length === 0 ? (
              <EmptyState title="No annotator has work on this campaign yet" />
            ) : (
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Annotator trust table">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs text-slate-400">
                    <tr className="border-b border-slate-800">
                      <th className="py-2 pr-4 font-medium">Annotator</th>
                      <th className="py-2 pr-4 font-medium">Tier</th>
                      <th className="py-2 pr-4 font-medium">QA verdicts</th>
                      <th className="py-2 pr-4 font-medium">Estimated accuracy (90% interval)</th>
                      <th className="py-2 pr-4 font-medium">P(meets target)</th>
                      <th className="py-2 font-medium">Review rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {workers.map((w) => (
                      <tr key={w.worker_id}>
                        <td className="py-3 pr-4 text-slate-100">{w.worker_name}</td>
                        <td className="py-3 pr-4"><TierBadge tier={w.tier} /></td>
                        <td className="py-3 pr-4 tabular-nums text-slate-300">{w.accepted} passed · <span className={w.rejected ? 'text-rose-300' : ''}>{w.rejected} failed</span></td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <span className="w-14 tabular-nums text-slate-200">{pct(w.posterior_mean)}</span>
                            <IntervalBar low={w.lower_90} mid={w.posterior_mean} high={w.upper_90} target={target}
                              label={`Estimated accuracy ${pct(w.posterior_mean)}, 90% interval ${pct(w.lower_90)} to ${pct(w.upper_90)}, target ${pct(target, 0)}`} />
                          </div>
                        </td>
                        <td className="py-3 pr-4 tabular-nums text-slate-300">{pct(w.prob_meets_target, 0)}</td>
                        <td className="py-3 tabular-nums text-slate-300">{adaptive ? pct(w.sampling_rate, 0) : `${report.base_sampling_pct}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-slate-400">Bars span 60–100%. The amber line marks the {report.target_quality_pct}% target.</p>
              </div>
            )}
          </Card>

          {forecast && (
            <Card title="Completion forecast" subtitle={`${number(forecast.simulations)} simulated schedules from ${formatDate(forecast.operational_date)}`}>
              {forecast.status === 'FORECAST' ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div><dt className="text-slate-400">Median (P50)</dt><dd className="text-lg font-semibold text-slate-50">{formatDate(forecast.p50_date)}</dd></div>
                    <div><dt className="text-slate-400">Conservative (P90)</dt><dd className="text-lg font-semibold text-slate-50">{formatDate(forecast.p90_date)}</dd></div>
                    <div><dt className="text-slate-400">Due date</dt><dd className="text-slate-200">{formatDate(forecast.due_date)}</dd></div>
                    <div><dt className="text-slate-400">Chance on time</dt><dd className="text-slate-200">{pct(forecast.probability_on_time, 0)}</dd></div>
                    <div><dt className="text-slate-400">Remaining tasks</dt><dd className="text-slate-200">{number(forecast.remaining_tasks)}</dd></div>
                    <div><dt className="text-slate-400">Daily capacity</dt><dd className="text-slate-200">{number(forecast.daily_capacity)}</dd></div>
                  </dl>
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-200">Assumptions</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-400">
                      {forecast.assumptions.map((a: string) => <li key={a}>{a}</li>)}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-300">{forecast.status === 'COMPLETE' ? 'All work is complete.' : 'No qualified, available capacity: the forecast cannot run until capacity exists.'}</p>
              )}
            </Card>
          )}

          <Explainer summary="How these numbers are calculated">
            <ul className="list-disc space-y-1 pl-5">{(report.method ?? []).map((m: string) => <li key={m}>{m}</li>)}</ul>
            <p>
              In a budget-matched simulation across 40 synthetic workforces, adaptive sampling shipped about half as many undetected
              errors as flat sampling with the same number of reviews; to match its quality, flat sampling had to review about 71% of
              tasks versus 41% (43% fewer reviews for adaptive). Those worlds are synthetic; treat the result as evidence about the
              policy, not about a real team.
            </p>
          </Explainer>
        </>
      )}
    </div>
  );
};
