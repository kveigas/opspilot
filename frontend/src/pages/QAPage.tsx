import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dices, Plus } from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { TaskHistoryDialog } from '../components/TaskHistoryDialog';
import { Button, EmptyState, Feedback, Kbd, PageHeader, TierBadge } from '../components/ui';
import { useCampaigns } from '../state/CampaignContext';
import { useWorkerNames } from '../state/useWorkerNames';
import { formatDateTime, humanize, pct } from '../lib/format';

type SubTab = 'review' | 'escalations' | 'rework' | 'decisions';
const TABS: { id: SubTab; label: string }[] = [
  { id: 'review', label: 'Review queue' },
  { id: 'escalations', label: 'Escalations' },
  { id: 'rework', label: 'Rework' },
  { id: 'decisions', label: 'Decisions' },
];
const REASONS = ['LABEL_ERROR', 'GUIDELINE_AMBIGUITY', 'INCOMPLETE_WORK', 'FORMAT_ERROR', 'TOOLING_ISSUE', 'POLICY_QUESTION', 'OTHER'];
const VERDICT_KEYS: Record<string, string> = { a: 'ACCEPT', r: 'REWORK', b: 'BLOCK', e: 'ESCALATE' };

function tabFromHash(): SubTab {
  const value = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('tab');
  return TABS.some(t => t.id === value) ? (value as SubTab) : 'review';
}

const field = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100';

export const QAPage: React.FC = () => {
  const { selected, selectedId } = useCampaigns();
  const workerName = useWorkerNames();
  const [subTab, setSubTab] = useState<SubTab>(tabFromHash);
  const [reviewers, setReviewers] = useState<any[]>([]);
  const [selectedReviewerId, setSelectedReviewerId] = useState<string>('');
  const [reviewTasks, setReviewTasks] = useState<any[]>([]);
  const [reviewsList, setReviewsList] = useState<any[]>([]);
  const [reworkTasks, setReworkTasks] = useState<any[]>([]);
  const [escalations, setEscalations] = useState<any[]>([]);
  const [tiers, setTiers] = useState<Record<string, string>>({});
  const [cursor, setCursor] = useState(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isActionPending, setIsActionPending] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyTaskId, setHistoryTaskId] = useState<string | null>(null);
  const loadSequence = useRef(0);

  // Verdict dialog
  const [verdictTask, setVerdictTask] = useState<any>(null);
  const [verdictInput, setVerdictInput] = useState<string>('REWORK');
  const [reasonInput, setReasonInput] = useState<string>('LABEL_ERROR');
  const [commentInput, setCommentInput] = useState<string>('');

  // Escalation dialogs
  const [isEscModalOpen, setIsEscModalOpen] = useState<boolean>(false);
  const [escTitle, setEscTitle] = useState<string>('');
  const [escDescription, setEscDescription] = useState<string>('');
  const [escSeverity, setEscSeverity] = useState<string>('MEDIUM');
  const [escCategory, setEscCategory] = useState<string>('QUALITY');
  const [escBlocker, setEscBlocker] = useState<boolean>(false);
  const [selectedEscalation, setSelectedEscalation] = useState<any>(null);
  const [targetStatus, setTargetStatus] = useState<string>('RESOLVED');
  const [resolutionInput, setResolutionInput] = useState<string>('');
  const [targetTaskState, setTargetTaskState] = useState<string>('IN_PROGRESS');

  useEffect(() => {
    const onHash = () => setSubTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const loadData = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const workerData = await api.getWorkers();
      if (sequence !== loadSequence.current) return false;
      const revs = (workerData ?? []).filter((w: any) => w.role === 'REVIEWER');
      setReviewers(revs);
      setSelectedReviewerId(current => current || revs[0]?.id || '');

      if (selectedId) {
        const [inReview, revHistory, inProgressTasks, assignedTasks, escList] = await Promise.all([
          api.getTasks(selectedId, 'IN_REVIEW', 100), api.getReviews(selectedId),
          api.getTasks(selectedId, 'IN_PROGRESS', 1000), api.getTasks(selectedId, 'ASSIGNED', 1000),
          api.getEscalations(selectedId),
        ]);
        if (sequence !== loadSequence.current) return false;
        setReviewTasks(inReview ?? []);
        setReviewsList(revHistory ?? []);
        setReworkTasks([...(inProgressTasks ?? []), ...(assignedTasks ?? [])].filter((t: any) => t.rework_count > 0));
        setEscalations(escList ?? []);
        if (typeof api.getCampaignQuality === 'function') {
          api.getCampaignQuality(selectedId)
            .then((q: any) => setTiers(Object.fromEntries((q?.workers ?? []).map((w: any) => [w.worker_id, w.tier]))))
            .catch(() => setTiers({}));
        }
      }
      return true;
    } catch {
      if (sequence === loadSequence.current) setLoadError('Could not refresh QA evidence. Do not treat an empty or previous queue as current. Retry below.');
      return false;
    } finally {
      if (sequence === loadSequence.current) setIsLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadData();
    return () => { loadSequence.current += 1; };
  }, [loadData]);

  useEffect(() => { setCursor(c => Math.min(c, Math.max(0, reviewTasks.length - 1))); }, [reviewTasks.length]);

  const submitVerdict = async (task: any, verdict: string, reason?: string, comment?: string) => {
    if (!selectedReviewerId) {
      setFeedback({ kind: 'error', message: 'Choose a reviewer before recording a verdict.' });
      return;
    }
    setIsActionPending(true);
    setFeedback(null);
    try {
      await api.submitReview(task.id, {
        reviewer_id: selectedReviewerId,
        verdict,
        reason_code: verdict !== 'ACCEPT' ? reason : undefined,
        comment: comment || undefined,
      });
      setVerdictTask(null);
      const refreshed = await loadData();
      setFeedback(refreshed
        ? { kind: 'success', message: `${humanize(verdict)} recorded for ${task.external_reference ?? task.id}.` }
        : { kind: 'error', message: 'Verdict recorded, but the queue could not refresh. Retry the refresh; do not resubmit.' });
    } catch (err: any) {
      setFeedback({ kind: 'error', message: `Verdict not recorded: ${err?.message ?? 'please retry.'}` });
    } finally {
      setIsActionPending(false);
    }
  };

  const openVerdict = (task: any, verdict: string) => {
    setVerdictTask(task);
    setVerdictInput(verdict);
    setReasonInput(verdict === 'ESCALATE' ? 'GUIDELINE_AMBIGUITY' : 'LABEL_ERROR');
    setCommentInput('');
  };

  // Keyboard-first reviewing on the queue tab.
  useEffect(() => {
    if (subTab !== 'review') return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || isActionPending) return;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const key = event.key.toLowerCase();
      const task = reviewTasks[cursor];
      if (key === 'j') { event.preventDefault(); setCursor(c => Math.min(c + 1, reviewTasks.length - 1)); }
      else if (key === 'k') { event.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
      else if (task && key === 'h') { event.preventDefault(); setHistoryTaskId(task.id); }
      else if (task && key === 'a') { event.preventDefault(); void submitVerdict(task, 'ACCEPT'); }
      else if (task && VERDICT_KEYS[key]) { event.preventDefault(); openVerdict(task, VERDICT_KEYS[key]); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const row = document.getElementById(`qa-row-${cursor}`);
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const handleSampleSubmitted = async () => {
    if (!selectedId) return;
    setIsActionPending(true);
    setFeedback(null);
    try {
      const result = await api.sampleSubmittedTasks(selectedId);
      const refreshed = await loadData();
      const tierNote = result?.sent_to_review_by_tier && Object.keys(result.sent_to_review_by_tier).length
        ? ` (${Object.entries(result.sent_to_review_by_tier).map(([t, n]) => `${n} ${humanize(t).toLowerCase()}`).join(', ')})` : '';
      setFeedback(refreshed
        ? { kind: 'success', message: `${result?.tasks_sent_to_review ?? 0} tasks sampled for review${tierNote}; ${result?.tasks_auto_completed ?? 0} completed without review.` }
        : { kind: 'error', message: 'Sampling completed, but the queue could not refresh. Retry the refresh; do not repeat the action.' });
    } catch (err: any) {
      setFeedback({ kind: 'error', message: `Sampling failed: ${err?.message ?? 'please retry.'}` });
    } finally {
      setIsActionPending(false);
    }
  };

  const handleCreateEscalation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    setIsActionPending(true);
    setFeedback(null);
    try {
      await api.createEscalation({ campaign_id: selectedId, title: escTitle, description: escDescription, severity: escSeverity, category: escCategory, blocker: escBlocker });
      setIsEscModalOpen(false);
      setEscTitle('');
      setEscDescription('');
      const refreshed = await loadData();
      setSubTab('escalations');
      setFeedback(refreshed ? { kind: 'success', message: 'Escalation created and added to the operational queue.' } : { kind: 'error', message: 'Escalation created, but the queue could not refresh. Retry the refresh; do not create a duplicate.' });
    } catch (err: any) {
      setFeedback({ kind: 'error', message: `Escalation not created: ${err?.message ?? 'please retry.'}` });
    } finally {
      setIsActionPending(false);
    }
  };

  const handleResolveEscalation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEscalation) return;
    setIsActionPending(true);
    setFeedback(null);
    try {
      await api.updateEscalationStatus(selectedEscalation.id, {
        status: targetStatus,
        resolution: resolutionInput,
        target_task_state: selectedEscalation.task_id ? targetTaskState : undefined,
      });
      setSelectedEscalation(null);
      const refreshed = await loadData();
      setFeedback(refreshed ? { kind: 'success', message: 'Escalation status updated and queues refreshed.' } : { kind: 'error', message: 'Escalation updated, but the queue could not refresh. Retry the refresh; do not repeat the update.' });
    } catch (err: any) {
      setFeedback({ kind: 'error', message: `Escalation not updated: ${err?.message ?? 'please retry.'}` });
    } finally {
      setIsActionPending(false);
    }
  };

  const counts: Record<SubTab, number> = useMemo(() => ({
    review: reviewTasks.length,
    escalations: escalations.filter(e => !['RESOLVED', 'CLOSED'].includes(e.status)).length,
    rework: reworkTasks.length,
    decisions: reviewsList.length,
  }), [reviewTasks, escalations, reworkTasks, reviewsList]);

  const policy = selected?.qa_policy === 'ADAPTIVE' ? 'adaptive' : 'flat';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Quality"
        title="QA review & escalations"
        description={`Review sampled work, resolve escalations and track rework. Sampling on this campaign is ${policy}${policy === 'adaptive' ? ': weaker annotators’ work is reviewed more often' : ''}.`}
        actions={
          <>
            <Button size="sm" onClick={handleSampleSubmitted} disabled={!selectedId || isActionPending}>
              <Dices className="h-4 w-4" aria-hidden="true" /> Sample submitted work
            </Button>
            <Button size="sm" variant="danger" onClick={() => setIsEscModalOpen(true)} disabled={isActionPending || !selectedId}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New escalation
            </Button>
          </>
        }
      />

      {loadError && <Feedback kind="error">{loadError} <button onClick={() => void loadData()} className="ml-2 underline">Retry QA refresh</button></Feedback>}
      {feedback && <Feedback kind={feedback.kind}>{feedback.message}</Feedback>}

      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4 md:flex-row md:items-center md:justify-between">
        <label className="flex items-center gap-3 text-sm text-slate-300">
          <span className="shrink-0">Reviewing as</span>
          <select id="reviewer-select" value={selectedReviewerId} onChange={(e) => setSelectedReviewerId(e.target.value)} className={`${field} max-w-xs`}>
            {reviewers.length === 0 ? <option value="">No reviewers registered</option> : reviewers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <p className="text-xs text-slate-400">
          <Kbd>J</Kbd>/<Kbd>K</Kbd> move · <Kbd>A</Kbd> accept · <Kbd>R</Kbd> rework · <Kbd>B</Kbd> block · <Kbd>E</Kbd> escalate · <Kbd>H</Kbd> history
        </p>
      </div>

      <div role="tablist" aria-label="QA views" className="flex gap-1 overflow-x-auto border-b border-slate-800">
        {TABS.map(tab => (
          <button
            key={tab.id} role="tab" id={`qa-tab-${tab.id}`} aria-selected={subTab === tab.id} aria-controls={`qa-panel-${tab.id}`}
            onClick={() => setSubTab(tab.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 text-sm font-medium transition ${subTab === tab.id ? 'border-emerald-500 text-emerald-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            {tab.label} <span className="ml-1 rounded-full bg-slate-800 px-2 py-0.5 text-xs tabular-nums text-slate-300">{counts[tab.id]}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`qa-panel-${subTab}`} aria-labelledby={`qa-tab-${subTab}`} className="rounded-xl border border-slate-800 bg-slate-900/70">
        {subTab === 'review' && (
          isLoading && reviewTasks.length === 0 ? <p className="p-6 text-sm text-slate-400">Loading review queue…</p>
          : reviewTasks.length === 0 ? (
            <div className="p-6"><EmptyState title="Nothing waiting for review">Advance the workday or sample submitted work to fill the queue.</EmptyState></div>
          ) : (
            <ul className="max-h-[560px] divide-y divide-slate-800/70 overflow-y-auto" aria-label="Tasks awaiting QA review">
              {reviewTasks.map((t, index) => (
                <li
                  key={t.id} id={`qa-row-${index}`} aria-current={index === cursor ? 'true' : undefined}
                  onClick={() => setCursor(index)}
                  className={`flex flex-col gap-3 px-5 py-3 md:flex-row md:items-center md:justify-between ${index === cursor ? 'bg-slate-800/70 ring-1 ring-inset ring-emerald-700' : ''}`}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <button className="font-mono text-xs text-sky-300 hover:underline" onClick={() => setHistoryTaskId(t.id)}>{t.external_reference || t.id}</button>
                    <span className="text-slate-200">{workerName(t.assigned_worker_id)}</span>
                    <TierBadge tier={tiers[t.assigned_worker_id] ?? t.qa_sampling_tier} />
                    {t.qa_sample_probability != null && <span className="text-xs text-slate-400">sampled at {pct(t.qa_sample_probability, 0)}</span>}
                    {t.rework_count > 0 && <span className="text-xs text-amber-300">rework {t.rework_count} of 3</span>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Button size="sm" variant="primary" disabled={isActionPending} onClick={() => submitVerdict(t, 'ACCEPT')} aria-label={`Accept ${t.external_reference || t.id}`}>Accept</Button>
                    <Button size="sm" disabled={isActionPending} onClick={() => openVerdict(t, 'REWORK')} aria-label={`Request rework on ${t.external_reference || t.id}`}>Rework</Button>
                    <Button size="sm" disabled={isActionPending} onClick={() => openVerdict(t, 'BLOCK')} aria-label={`Block ${t.external_reference || t.id}`}>Block</Button>
                    <Button size="sm" variant="ghost" disabled={isActionPending} onClick={() => openVerdict(t, 'ESCALATE')} aria-label={`Escalate ${t.external_reference || t.id}`}>Escalate</Button>
                  </div>
                </li>
              ))}
            </ul>
          )
        )}

        {subTab === 'escalations' && (
          escalations.length === 0 ? <div className="p-6"><EmptyState title="No escalations for this campaign" /></div> : (
            <ul className="divide-y divide-slate-800/70">
              {escalations.map((e) => (
                <li key={e.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${e.severity === 'CRITICAL' ? 'bg-rose-900 text-rose-100' : e.severity === 'HIGH' ? 'bg-amber-900 text-amber-100' : 'bg-slate-800 text-slate-200'}`}>{humanize(e.severity)}</span>
                      <StatusBadge status={e.status} />
                      {e.blocker && <span className="text-xs font-medium text-rose-300">Blocks work</span>}
                    </div>
                    <p className="mt-1 font-medium text-slate-100">{e.title}</p>
                    <p className="text-sm text-slate-400">{e.description}</p>
                    <p className="mt-1 text-xs text-slate-400">{humanize(e.category)} · opened {formatDateTime(e.created_at)}</p>
                  </div>
                  {!['CLOSED'].includes(e.status) && (
                    <Button size="sm" onClick={() => { setSelectedEscalation(e); setTargetStatus('RESOLVED'); setResolutionInput(''); }}>Update status</Button>
                  )}
                </li>
              ))}
            </ul>
          )
        )}

        {subTab === 'rework' && (
          reworkTasks.length === 0 ? <div className="p-6"><EmptyState title="No tasks in rework" /></div> : (
            <ul className="divide-y divide-slate-800/70">
              {reworkTasks.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-4 px-5 py-3 text-sm">
                  <button className="font-mono text-xs text-sky-300 hover:underline" onClick={() => setHistoryTaskId(t.id)}>{t.external_reference || t.id}</button>
                  <StatusBadge status={t.state} />
                  <span className="text-amber-300">Attempt {t.rework_count} of 3</span>
                  <span className="text-slate-300">{workerName(t.assigned_worker_id)}</span>
                </li>
              ))}
            </ul>
          )
        )}

        {subTab === 'decisions' && (
          reviewsList.length === 0 ? <div className="p-6"><EmptyState title="No QA decisions recorded yet" /></div> : (
            <div className="max-h-[560px] overflow-auto" tabIndex={0} role="region" aria-label="QA decision history">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 bg-slate-900 text-xs text-slate-400">
                  <tr className="border-b border-slate-800">
                    <th className="px-5 py-2 font-medium">Task</th>
                    <th className="px-5 py-2 font-medium">Verdict</th>
                    <th className="px-5 py-2 font-medium">Reason</th>
                    <th className="px-5 py-2 font-medium">Reviewer</th>
                    <th className="px-5 py-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {reviewsList.slice(0, 300).map((r) => (
                    <tr key={r.id}>
                      <td className="px-5 py-2"><button className="font-mono text-xs text-sky-300 hover:underline" onClick={() => setHistoryTaskId(r.task_id)}>{r.task_id}</button></td>
                      <td className={`px-5 py-2 font-medium ${r.verdict === 'ACCEPT' ? 'text-emerald-300' : r.verdict === 'REWORK' ? 'text-amber-300' : 'text-rose-300'}`}>{humanize(r.verdict)}</td>
                      <td className="px-5 py-2 text-slate-400">{r.reason_code ? humanize(r.reason_code) : '—'}</td>
                      <td className="px-5 py-2 text-slate-300">{workerName(r.reviewer_id)}</td>
                      <td className="px-5 py-2 text-xs text-slate-400">{formatDateTime(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      <Modal isOpen={Boolean(verdictTask)} onClose={() => setVerdictTask(null)} title={`QA verdict for ${verdictTask?.external_reference || verdictTask?.id || ''}`}>
        <form onSubmit={(e) => { e.preventDefault(); void submitVerdict(verdictTask, verdictInput, reasonInput, commentInput); }} className="space-y-4">
          <div>
            <label htmlFor="verdict-select" className="mb-1 block text-sm font-medium text-slate-300">Verdict</label>
            <select id="verdict-select" value={verdictInput} onChange={(e) => setVerdictInput(e.target.value)} className={field}>
              <option value="ACCEPT">Accept</option>
              <option value="REWORK">Request rework</option>
              <option value="BLOCK">Block</option>
              <option value="ESCALATE">Escalate</option>
            </select>
          </div>
          {verdictInput !== 'ACCEPT' && (
            <div>
              <label htmlFor="reason-code-select" className="mb-1 block text-sm font-medium text-slate-300">Reason (required)</label>
              <select id="reason-code-select" value={reasonInput} onChange={(e) => setReasonInput(e.target.value)} className={field}>
                {REASONS.map(r => <option key={r} value={r}>{humanize(r)}</option>)}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="comment-text" className="mb-1 block text-sm font-medium text-slate-300">Comment for the annotator or lead</label>
            <textarea id="comment-text" rows={3} maxLength={1000} value={commentInput} onChange={(e) => setCommentInput(e.target.value)} className={`${field} py-2`} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button onClick={() => setVerdictTask(null)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={isActionPending}>Record verdict</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isEscModalOpen} onClose={() => setIsEscModalOpen(false)} title="Report Operational Escalation">
        <form onSubmit={handleCreateEscalation} className="space-y-4">
          <div>
            <label htmlFor="esc-title" className="mb-1 block text-sm font-medium text-slate-300">Escalation Title</label>
            <input id="esc-title" type="text" maxLength={200} value={escTitle} onChange={(e) => setEscTitle(e.target.value)} className={field} required />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="esc-severity" className="mb-1 block text-sm font-medium text-slate-300">Severity</label>
              <select id="esc-severity" value={escSeverity} onChange={(e) => setEscSeverity(e.target.value)} className={field}>
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(s => <option key={s} value={s}>{humanize(s)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="esc-category" className="mb-1 block text-sm font-medium text-slate-300">Category</label>
              <select id="esc-category" value={escCategory} onChange={(e) => setEscCategory(e.target.value)} className={field}>
                {['GUIDELINE', 'QUALITY', 'CAPACITY', 'TOOLING', 'CLIENT_CLARIFICATION', 'DATA_ISSUE', 'SLA'].map(c => <option key={c} value={c}>{humanize(c)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="esc-desc" className="mb-1 block text-sm font-medium text-slate-300">Description</label>
            <textarea id="esc-desc" rows={3} value={escDescription} onChange={(e) => setEscDescription(e.target.value)} className={`${field} py-2`} required />
          </div>
          <div className="flex items-center gap-2">
            <input id="esc-blocker" type="checkbox" checked={escBlocker} onChange={(e) => setEscBlocker(e.target.checked)} className="h-4 min-h-0 w-4 accent-rose-500" />
            <label htmlFor="esc-blocker" className="text-sm text-slate-300">Mark as Operational Blocker</label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button onClick={() => setIsEscModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={isActionPending}>Create Escalation</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(selectedEscalation)} onClose={() => setSelectedEscalation(null)} title={`Update escalation: ${selectedEscalation?.title ?? ''}`}>
        <form onSubmit={handleResolveEscalation} className="space-y-4">
          <div>
            <label htmlFor="target-status" className="mb-1 block text-sm font-medium text-slate-300">New status</label>
            <select id="target-status" value={targetStatus} onChange={(e) => setTargetStatus(e.target.value)} className={field}>
              {['INVESTIGATING', 'WAITING', 'RESOLVED', 'CLOSED'].map(s => <option key={s} value={s}>{humanize(s)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="esc-resolution" className="mb-1 block text-sm font-medium text-slate-300">Decision and rationale</label>
            <textarea id="esc-resolution" rows={3} value={resolutionInput} onChange={(e) => setResolutionInput(e.target.value)} className={`${field} py-2`} placeholder="What was decided, by whom, and which guideline changed…" />
          </div>
          {selectedEscalation?.task_id && (
            <div>
              <label htmlFor="target-task-state" className="mb-1 block text-sm font-medium text-slate-300">Where the task goes next</label>
              <select id="target-task-state" value={targetTaskState} onChange={(e) => setTargetTaskState(e.target.value)} className={field}>
                <option value="IN_PROGRESS">Back to the annotator</option>
                <option value="SUBMITTED">Back to QA sampling</option>
              </select>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button onClick={() => setSelectedEscalation(null)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={isActionPending}>Save Update</Button>
          </div>
        </form>
      </Modal>
      <TaskHistoryDialog taskId={historyTaskId} onClose={() => setHistoryTaskId(null)} />
    </div>
  );
};
