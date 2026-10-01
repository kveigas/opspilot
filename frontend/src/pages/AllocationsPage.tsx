import React, { useEffect, useState } from 'react';
import { Plus, Zap } from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { TaskHistoryDialog } from '../components/TaskHistoryDialog';
import { Button, Card, EmptyState, Feedback, PageHeader, Stat } from '../components/ui';
import { useCampaigns } from '../state/CampaignContext';
import { useWorkerNames } from '../state/useWorkerNames';
import { REASON_EXPLANATIONS, formatDate, formatTime, humanize } from '../lib/format';

type Strategy = 'BALANCED' | 'QUALITY_AWARE';

const STRATEGIES: { id: Strategy; title: string; body: string }[] = [
  { id: 'QUALITY_AWARE', title: 'Quality-aware (recommended)', body: 'Urgent and high-priority tasks go to annotators with the strongest QA record; routine work stays balanced.' },
  { id: 'BALANCED', title: 'Balanced', body: 'Round-robin across every qualified annotator by remaining capacity. Ignores QA history.' },
];

export const AllocationsPage: React.FC = () => {
  const { selected, selectedId, campaigns } = useCampaigns();
  const workerName = useWorkerNames();
  const [allocations, setAllocations] = useState<any[]>([]);
  const [unassignedTaskCount, setUnassignedTaskCount] = useState<number>(0);
  const [lastRun, setLastRun] = useState<any>(null);
  const [strategy, setStrategy] = useState<Strategy>('QUALITY_AWARE');
  const [showReleased, setShowReleased] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isActionPending, setIsActionPending] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [historyTaskId, setHistoryTaskId] = useState<string | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState<boolean>(false);
  const [taskCountInput, setTaskCountInput] = useState<number>(50);

  const loadData = async () => {
    if (!selectedId) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const [allocData, tasksData] = await Promise.all([
        api.getCampaignAllocations(selectedId).catch(() => []),
        api.getTasks(selectedId, 'UNASSIGNED', 1000).catch(() => []),
      ]);
      setAllocations(allocData ?? []);
      setUnassignedTaskCount((tasksData ?? []).length);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, [selectedId]);

  const handleTriggerAllocation = async () => {
    if (!selectedId) return;
    setIsActionPending(true);
    setFeedback(null);
    try {
      // The server allocates on the campaign's operational date (simulation clock for demos).
      const run = await api.triggerAllocationRun({ campaign_id: selectedId, strategy });
      setLastRun(run);
      await loadData();
      setFeedback({ kind: 'success', message: `${run.tasks_allocated.toLocaleString()} of ${run.tasks_considered.toLocaleString()} tasks allocated for ${formatDate(run.operational_date)}.` });
    } catch (err: any) {
      setFeedback({ kind: 'error', message: `Allocation did not run: ${err?.message ?? 'please retry.'}` });
    } finally {
      setIsActionPending(false);
    }
  };

  const handleCreateTasks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    setFeedback(null);
    try {
      await api.createTaskBatch(selectedId, { count: taskCountInput });
      setIsTaskModalOpen(false);
      await loadData();
      setFeedback({ kind: 'success', message: `${taskCountInput} tasks created and waiting for allocation.` });
    } catch (err: any) {
      setFeedback({ kind: 'error', message: `Tasks were not created: ${err?.message ?? 'please retry.'}` });
    }
  };

  const handleReleaseAllocation = async (allocation: any) => {
    setFeedback(null);
    try {
      await api.releaseAllocation(allocation.id);
      await loadData();
      setFeedback({ kind: 'success', message: `Task returned to the backlog and ${workerName(allocation.worker_id)}’s capacity restored.` });
    } catch (err: any) {
      setFeedback({ kind: 'error', message: `Release refused: ${err?.message ?? 'please retry.'}` });
    }
  };

  const visible = allocations.filter(a => showReleased || a.status === 'ACTIVE');
  const activeCount = allocations.filter(a => a.status === 'ACTIVE').length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Run"
        title="Task Allocation Engine"
        description="Assign waiting tasks to annotators who have every required skill, have passed calibration and have capacity on the campaign’s operational date."
        actions={
          <>
            <Button size="sm" onClick={() => setIsTaskModalOpen(true)} disabled={!selectedId}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Create tasks
            </Button>
            <Button variant="primary" onClick={handleTriggerAllocation} disabled={!selectedId || unassignedTaskCount === 0 || isActionPending}>
              <Zap className="h-4 w-4" aria-hidden="true" /> {isActionPending ? 'Allocating…' : 'Trigger Allocation Run'}
            </Button>
          </>
        }
      />

      {feedback && <Feedback kind={feedback.kind}>{feedback.message}</Feedback>}
      {!selectedId && campaigns.length === 0 && !isLoading && <EmptyState title="No campaigns yet">Create a campaign first.</EmptyState>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Waiting for allocation" value={unassignedTaskCount.toLocaleString()} tone={unassignedTaskCount ? 'warn' : 'good'} />
        <Stat label="Active allocations" value={activeCount.toLocaleString()} />
        <Stat label="Operational date" value={<span className="text-lg">{formatDate(selected?.operational_date)}</span>} hint={selected?.simulated_clock ? 'Simulation clock' : 'Today (UTC)'} />
      </div>

      <Card title="Routing strategy" subtitle="How to choose among qualified annotators">
        <fieldset>
          <legend className="sr-only">Allocation strategy</legend>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {STRATEGIES.map(option => (
              <label key={option.id} className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition ${strategy === option.id ? 'border-emerald-600 bg-emerald-950/30' : 'border-slate-800 hover:border-slate-600'}`}>
                <input type="radio" name="strategy" value={option.id} checked={strategy === option.id} onChange={() => setStrategy(option.id)} className="mt-1 h-4 min-h-0 w-4 accent-emerald-500" />
                <span>
                  <span className="block font-medium text-slate-100">{option.title}</span>
                  <span className="mt-1 block text-sm text-slate-400">{option.body}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      {lastRun && (
        <Card title="Latest run" subtitle={`${humanize(lastRun.strategy)} · ${formatTime(lastRun.created_at)}`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Considered" value={lastRun.tasks_considered} />
            <Stat label="Allocated" value={lastRun.tasks_allocated} tone="good" />
            <Stat label="Not allocated" value={lastRun.tasks_unallocated} tone={lastRun.tasks_unallocated ? 'warn' : 'neutral'} />
            <Stat label="Annotators used" value={lastRun.workers_used} />
          </div>
          {Object.values(lastRun.unallocated_reason_counts ?? {}).some((n: any) => n > 0) && (
            <ul className="mt-4 space-y-1 text-sm">
              {Object.entries(lastRun.unallocated_reason_counts as Record<string, number>).filter(([, n]) => n > 0).map(([reason, count]) => (
                <li key={reason}><span className="font-medium text-amber-200">{count} × {humanize(reason)}</span><span className="text-slate-400"> — {REASON_EXPLANATIONS[reason] ?? ''}</span></li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card
        title="Allocations"
        subtitle={`${visible.length} shown`}
        actions={
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={showReleased} onChange={e => setShowReleased(e.target.checked)} className="h-4 min-h-0 w-4 accent-emerald-500" />
            Include released
          </label>
        }
      >
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading allocations…</p>
        ) : visible.length === 0 ? (
          <EmptyState title="No active allocations">Run allocation to assign the waiting backlog.</EmptyState>
        ) : (
          <div className="max-h-[520px] overflow-auto" tabIndex={0} role="region" aria-label="Allocations table">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-900 text-xs text-slate-400">
                <tr className="border-b border-slate-800">
                  <th className="py-2 pr-4 font-medium">Task</th>
                  <th className="py-2 pr-4 font-medium">Annotator</th>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Why this annotator</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {visible.slice(0, 300).map((a) => (
                  <tr key={a.id}>
                    <td className="py-2.5 pr-4"><button className="font-mono text-xs text-sky-300 underline-offset-2 hover:underline" onClick={() => setHistoryTaskId(a.task_id)}>{a.task_id}</button></td>
                    <td className="py-2.5 pr-4 text-slate-200">{workerName(a.worker_id)}</td>
                    <td className="py-2.5 pr-4 text-xs text-slate-400">{a.operational_date}</td>
                    <td className="max-w-xs py-2.5 pr-4 text-xs text-slate-400">{a.reason ?? '—'}</td>
                    <td className="py-2.5 pr-4"><StatusBadge status={a.status} /></td>
                    <td className="py-2.5 text-right">
                      {a.status === 'ACTIVE' && (
                        <Button size="sm" variant="ghost" onClick={() => handleReleaseAllocation(a)} title="Only unstarted work can be released" aria-label={`Release ${a.task_id}`}>Release</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length > 300 && <p className="mt-2 text-xs text-slate-400">Showing the 300 most recent of {visible.length}.</p>}
          </div>
        )}
      </Card>

      <Modal isOpen={isTaskModalOpen} onClose={() => setIsTaskModalOpen(false)} title="Create tasks">
        <form onSubmit={handleCreateTasks} className="space-y-4">
          <div>
            <label htmlFor="task-count" className="mb-1 block text-sm font-medium text-slate-300">How many tasks?</label>
            <input
              id="task-count" type="number" min="1" max="5000" required value={taskCountInput}
              onChange={(e) => setTaskCountInput(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
            />
            <p className="mt-1 text-xs text-slate-400">New tasks inherit the campaign’s task type, skills and priority. The total cannot exceed the campaign volume.</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button onClick={() => setIsTaskModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Create tasks</Button>
          </div>
        </form>
      </Modal>
      <TaskHistoryDialog taskId={historyTaskId} onClose={() => setHistoryTaskId(null)} />
    </div>
  );
};
