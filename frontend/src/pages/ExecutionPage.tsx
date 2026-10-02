import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { TaskHistoryDialog } from '../components/TaskHistoryDialog';
import { Button, Card, EmptyState, Feedback, PageHeader, Stat } from '../components/ui';
import { useCampaigns } from '../state/CampaignContext';
import { useWorkerNames } from '../state/useWorkerNames';
import { formatDate, humanize } from '../lib/format';

const PIPELINE: { state: string; label: string; tone: string }[] = [
  { state: 'UNASSIGNED', label: 'Waiting', tone: 'bg-slate-500' },
  { state: 'ASSIGNED', label: 'Assigned', tone: 'bg-sky-600' },
  { state: 'IN_PROGRESS', label: 'In progress', tone: 'bg-sky-400' },
  { state: 'SUBMITTED', label: 'Submitted', tone: 'bg-violet-500' },
  { state: 'IN_REVIEW', label: 'In QA review', tone: 'bg-amber-400' },
  { state: 'BLOCKED', label: 'Blocked', tone: 'bg-rose-500' },
  { state: 'ESCALATED', label: 'Escalated', tone: 'bg-rose-400' },
  { state: 'COMPLETED', label: 'Completed', tone: 'bg-emerald-500' },
];

const ACTIONS: Record<string, { target: string; label: string; variant?: 'primary' | 'danger' }[]> = {
  ASSIGNED: [{ target: 'IN_PROGRESS', label: 'Start', variant: 'primary' }],
  IN_PROGRESS: [{ target: 'SUBMITTED', label: 'Submit', variant: 'primary' }, { target: 'BLOCKED', label: 'Block', variant: 'danger' }],
  BLOCKED: [{ target: 'IN_PROGRESS', label: 'Unblock' }],
};

export const ExecutionPage: React.FC = () => {
  const { selectedId } = useCampaigns();
  const workerName = useWorkerNames();
  const [executionMetrics, setExecutionMetrics] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [stateFilter, setStateFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [pendingTask, setPendingTask] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [historyTaskId, setHistoryTaskId] = useState<string | null>(null);

  // Only the newest request may update the page: a reload started before a filter change (for
  // example after a state transition) must not overwrite the newer filter's rows when it lands last.
  const latestRequest = useRef(0);
  const currentFilter = useRef(stateFilter);
  currentFilter.current = stateFilter;

  const loadData = async () => {
    const request = ++latestRequest.current;
    if (!selectedId) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const [metrics, taskList] = await Promise.all([
        api.getCampaignExecution(selectedId).catch(() => null),
        api.getTasks(selectedId, currentFilter.current || undefined, 100).catch(() => []),
      ]);
      if (request !== latestRequest.current) return;
      setExecutionMetrics(metrics);
      setTasks(taskList ?? []);
    } finally {
      if (request === latestRequest.current) setIsLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, [selectedId, stateFilter]);

  const handleStateTransition = async (task: any, targetState: string) => {
    setPendingTask(task.id);
    setFeedback(null);
    try {
      await api.transitionTaskState(task.id, targetState, 'Manual change from the execution queue');
      await loadData();
      setFeedback({ kind: 'success', message: `${task.external_reference ?? task.id} moved to ${humanize(targetState).toLowerCase()}.` });
    } catch (err: any) {
      setFeedback({ kind: 'error', message: `State not changed: ${err?.message ?? 'please retry.'}` });
    } finally {
      setPendingTask(null);
    }
  };

  const counts = executionMetrics?.state_counts ?? {};
  const total = executionMetrics?.total_tasks || 0;
  const completion = typeof executionMetrics?.completion_pct === 'number' ? executionMetrics.completion_pct : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Run"
        title="Production execution"
        description="Where every task is in the pipeline. The state machine blocks invalid moves (for example, submitted work cannot skip QA sampling)."
      />
      {feedback && <Feedback kind={feedback.kind}>{feedback.message}</Feedback>}

      {executionMetrics && (
        <Card title="Pipeline" subtitle={`${(counts.COMPLETED ?? 0).toLocaleString()} of ${total.toLocaleString()} tasks completed`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="text-4xl font-semibold tabular-nums text-emerald-300">{completion}%</span>
              <span className="ml-2 text-sm text-slate-400">complete</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <Stat label="Completed today" value={executionMetrics.throughput?.completed_today ?? 0} />
              <Stat label="Last 7 days" value={executionMetrics.throughput?.completed_last_7_days ?? 0} />
              <Stat label="Daily average" value={executionMetrics.throughput?.average_daily_completed_last_7_days ?? 0} />
            </div>
          </div>
          {executionMetrics.throughput?.reference_date && (
            <p className="mt-2 text-xs text-slate-400 sm:text-right">
              {executionMetrics.throughput.simulated_clock
                ? `Days follow the simulated clock: today is ${formatDate(executionMetrics.throughput.reference_date)}. Work seeded before the simulation has no completion day, so it is not counted here.`
                : `Days are UTC dates: today is ${formatDate(executionMetrics.throughput.reference_date)}.`}
            </p>
          )}
          <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-slate-800" role="img"
            aria-label={PIPELINE.map(p => `${counts[p.state] ?? 0} ${p.label.toLowerCase()}`).join(', ')}>
            {PIPELINE.map(p => (counts[p.state] ?? 0) > 0 && (
              <div key={p.state} className={p.tone} style={{ width: `${((counts[p.state] ?? 0) / (total || 1)) * 100}%` }} />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            {PIPELINE.map(p => (
              <li key={p.state}>
                <button type="button" onClick={() => setStateFilter(p.state)} className="inline-flex min-h-0 items-center gap-1.5 hover:text-slate-100">
                  <span className={`h-2 w-2 rounded-full ${p.tone}`} aria-hidden="true" />
                  {p.label} <span className="tabular-nums text-slate-200">{(counts[p.state] ?? 0).toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Task queue"
        subtitle="Showing up to 100 tasks. Select a reference for its full history."
        actions={
          <label className="flex items-center gap-2 text-xs text-slate-300">
            State
            <select id="state-filter" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100">
              <option value="">All states</option>
              {PIPELINE.map(p => <option key={p.state} value={p.state}>{p.label}</option>)}
            </select>
          </label>
        }
      >
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading tasks…</p>
        ) : tasks.length === 0 ? (
          <EmptyState title="No tasks in this state" />
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Task execution table">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-xs text-slate-400">
                <tr className="border-b border-slate-800">
                  <th className="py-2 pr-4 font-medium">Reference</th>
                  <th className="py-2 pr-4 font-medium">Priority</th>
                  <th className="py-2 pr-4 font-medium">State</th>
                  <th className="py-2 pr-4 font-medium">Annotator</th>
                  <th className="py-2 pr-4 font-medium">Rework</th>
                  <th className="py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2.5 pr-4"><button className="font-mono text-xs text-sky-300 hover:underline" onClick={() => setHistoryTaskId(t.id)}>{t.external_reference || t.id}</button></td>
                    <td className="py-2.5 pr-4 text-xs text-slate-300">{humanize(t.priority)}</td>
                    <td className="py-2.5 pr-4"><StatusBadge status={t.state} /></td>
                    <td className="py-2.5 pr-4 text-slate-300">{workerName(t.assigned_worker_id)}</td>
                    <td className="py-2.5 pr-4 text-xs text-slate-400">{t.rework_count ? `${t.rework_count} of 3` : '—'}</td>
                    <td className="space-x-1.5 py-2.5 text-right">
                      {(ACTIONS[t.state] ?? []).map(action => (
                        <Button key={action.target} size="sm" variant={action.variant ?? 'secondary'} disabled={pendingTask === t.id} onClick={() => handleStateTransition(t, action.target)}
                          aria-label={`${action.label} ${t.external_reference || t.id}`}>
                          {action.label}
                        </Button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <TaskHistoryDialog taskId={historyTaskId} onClose={() => setHistoryTaskId(null)} />
    </div>
  );
};
