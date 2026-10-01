import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Modal } from './Modal';
import { StatusBadge } from './StatusBadge';
import { TierBadge } from './ui';
import { formatDateTime, humanize, pct } from '../lib/format';
import { useWorkerNames } from '../state/useWorkerNames';

/** Everything known about one task: state, sampling design, reviews, allocations and audit trail. */
export const TaskHistoryDialog: React.FC<{ taskId: string | null; onClose: () => void }> = ({ taskId, onClose }) => {
  const [history, setHistory] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const workerName = useWorkerNames();

  useEffect(() => {
    if (!taskId) return;
    let alive = true;
    setHistory(null);
    setError(null);
    api.getTaskHistory(taskId)
      .then(data => { if (alive) setHistory(data); })
      .catch(() => { if (alive) setError('Task history could not be loaded.'); });
    return () => { alive = false; };
  }, [taskId]);

  const task = history?.task;
  return (
    <Modal isOpen={Boolean(taskId)} onClose={onClose} title={`Task ${task?.external_reference ?? taskId ?? ''}`}>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {!history && !error && <p className="text-sm text-slate-400">Loading task history…</p>}
      {task && (
        <div className="space-y-6 text-sm">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div><dt className="text-xs text-slate-400">State</dt><dd className="mt-1"><StatusBadge status={task.state} /></dd></div>
            <div><dt className="text-xs text-slate-400">Priority</dt><dd className="mt-1 text-slate-100">{humanize(task.priority)}</dd></div>
            <div><dt className="text-xs text-slate-400">Annotator</dt><dd className="mt-1 text-slate-100">{workerName(task.assigned_worker_id)}</dd></div>
            <div><dt className="text-xs text-slate-400">Rework attempts</dt><dd className="mt-1 text-slate-100">{task.rework_count} of 3</dd></div>
            <div>
              <dt className="text-xs text-slate-400">QA sampling</dt>
              <dd className="mt-1 flex items-center gap-2 text-slate-100">
                {task.qa_sample_probability != null ? <>{pct(task.qa_sample_probability, 0)} <TierBadge tier={task.qa_sampling_tier} /></> : 'Not sampled yet'}
              </dd>
            </div>
            <div><dt className="text-xs text-slate-400">Skills</dt><dd className="mt-1 text-slate-100">{(task.required_skills ?? []).join(', ') || '—'}</dd></div>
          </dl>

          <section>
            <h4 className="mb-2 font-semibold text-slate-100">QA reviews</h4>
            {history.reviews.length === 0 ? <p className="text-slate-400">No reviews recorded.</p> : (
              <ul className="space-y-2">
                {history.reviews.map((r: any) => (
                  <li key={r.id} className="rounded-md bg-slate-950/60 px-3 py-2">
                    <span className="font-medium text-slate-100">{humanize(r.verdict)}</span>
                    {r.reason_code && <span className="text-slate-400"> · {humanize(r.reason_code)}</span>}
                    <span className="text-slate-400"> · {workerName(r.reviewer_id)} · {formatDateTime(r.created_at)}</span>
                    {r.comment && <p className="mt-1 text-xs text-slate-400">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="mb-2 font-semibold text-slate-100">Allocations</h4>
            {history.allocations.length === 0 ? <p className="text-slate-400">Never allocated.</p> : (
              <ul className="space-y-2">
                {history.allocations.map((a: any) => (
                  <li key={a.id} className="rounded-md bg-slate-950/60 px-3 py-2">
                    <span className="text-slate-100">{workerName(a.worker_id)}</span>
                    <span className="text-slate-400"> · {a.operational_date} · {humanize(a.status)}</span>
                    {a.reason && <p className="mt-1 text-xs text-slate-400">{a.reason}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="mb-2 font-semibold text-slate-100">Audit trail</h4>
            {history.events.length === 0 ? <p className="text-slate-400">No task-level events.</p> : (
              <ol className="space-y-1.5 border-l border-slate-800 pl-4">
                {history.events.map((e: any, index: number) => (
                  <li key={`${e.created_at}-${index}`} className="text-xs text-slate-400">
                    <span className="text-slate-400">{formatDateTime(e.created_at)}</span> — {e.summary}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
};
