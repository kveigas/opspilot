import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';

export const ExecutionPage: React.FC = () => {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [executionMetrics, setExecutionMetrics] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [stateFilter, setStateFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const campData = await api.getCampaigns();
      setCampaigns(campData);
      if (campData.length > 0 && !selectedCampaignId) {
        setSelectedCampaignId(campData[0].id);
      }

      if (selectedCampaignId) {
        const metrics = await api.getCampaignExecution(selectedCampaignId).catch(() => null);
        setExecutionMetrics(metrics);

        const taskList = await api.getTasks(selectedCampaignId, stateFilter || undefined, 100);
        setTasks(taskList);
      }
    } catch (err) {
      console.error('Failed to load execution page data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedCampaignId, stateFilter]);

  const handleStateTransition = async (taskId: string, targetState: string) => {
    try {
      await api.transitionTaskState(taskId, targetState);
      loadData();
    } catch (err: any) {
      console.error(`Failed to transition state to ${targetState}:`, err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Production Execution Operations</h1>
          <p className="text-sm text-slate-400">
            Real task state monitoring, transition enforcement, backlog tracking, and observed throughput.
          </p>
        </div>
        <div className="w-full sm:w-64">
          <label htmlFor="campaign-select" className="sr-only">Select Campaign</label>
          <select
            id="campaign-select"
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.task_type})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Progress & Throughput Header */}
      {executionMetrics && (
        <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Campaign Completion</span>
              <div className="flex items-baseline space-x-3 mt-1">
                <span className="text-3xl font-extrabold text-emerald-400">
                  {typeof executionMetrics.completion_pct === 'number'
                    ? executionMetrics.completion_pct
                    : Math.round((executionMetrics.completion_rate ?? 0.5) * 100)}%
                </span>
                {executionMetrics.state_counts && (
                  <span className="text-sm text-slate-400">
                    ({executionMetrics.state_counts.COMPLETED ?? 0} / {executionMetrics.total_tasks ?? 0} Tasks Completed)
                  </span>
                )}
              </div>
            </div>

            {/* Observed Throughput */}
            {typeof executionMetrics.throughput === 'object' && executionMetrics.throughput !== null && (
              <div className="grid grid-cols-3 gap-3 text-center sm:text-right">
                <div className="bg-slate-900/80 px-3 py-2 rounded border border-slate-800">
                  <span className="block text-xs text-slate-400">Completed Today</span>
                  <span className="text-base font-bold text-slate-200">{executionMetrics.throughput.completed_today ?? 0}</span>
                </div>
                <div className="bg-slate-900/80 px-3 py-2 rounded border border-slate-800">
                  <span className="block text-xs text-slate-400">7-Day Total</span>
                  <span className="text-base font-bold text-slate-200">{executionMetrics.throughput.completed_last_7_days ?? 0}</span>
                </div>
                <div className="bg-slate-900/80 px-3 py-2 rounded border border-slate-800">
                  <span className="block text-xs text-slate-400">7-Day Daily Avg</span>
                  <span className="text-base font-bold text-emerald-400">{executionMetrics.throughput.average_daily_completed_last_7_days ?? 0}</span>
                </div>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${executionMetrics.completion_pct}%` }}
            />
          </div>

          {/* State Metric Counters Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 text-center text-xs">
            <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
              <span className="block text-slate-400">Unassigned</span>
              <span className="font-semibold text-slate-300">{executionMetrics.state_counts.UNASSIGNED}</span>
            </div>
            <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
              <span className="block text-slate-400">Assigned</span>
              <span className="font-semibold text-blue-400">{executionMetrics.state_counts.ASSIGNED}</span>
            </div>
            <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
              <span className="block text-slate-400">In Progress</span>
              <span className="font-semibold text-emerald-400">{executionMetrics.state_counts.IN_PROGRESS}</span>
            </div>
            <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
              <span className="block text-slate-400">Submitted</span>
              <span className="font-semibold text-cyan-400">{executionMetrics.state_counts.SUBMITTED}</span>
            </div>
            <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
              <span className="block text-slate-400">Blocked</span>
              <span className="font-semibold text-rose-400">{executionMetrics.state_counts.BLOCKED}</span>
            </div>
          </div>
        </div>
      )}

      {/* Task Execution Table & Filters */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-200">Execution Task Queue</h2>

          <div className="flex items-center space-x-2">
            <label htmlFor="state-filter" className="text-xs text-slate-400">Filter State:</label>
            <select
              id="state-filter"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">All States</option>
              <option value="UNASSIGNED">Unassigned</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="BLOCKED">Blocked</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            No tasks match the selected state filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900/80 text-xs text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-semibold">Ref</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Priority</th>
                  <th className="px-4 py-3 font-semibold">State</th>
                  <th className="px-4 py-3 font-semibold">Assigned Worker</th>
                  <th className="px-4 py-3 font-semibold text-right">Operational Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {tasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-700/40">
                    <td className="px-4 py-3 font-mono text-xs text-slate-200">{t.external_reference || t.id.substring(0, 8)}</td>
                    <td className="px-4 py-3 text-xs text-slate-300">{t.task_type}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-300">{t.priority}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.state} />
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-400">
                      {t.assigned_worker_id ? t.assigned_worker_id.substring(0, 8) + '...' : '—'}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1.5">
                      {t.state === 'ASSIGNED' && (
                        <button
                          onClick={() => handleStateTransition(t.id, 'IN_PROGRESS')}
                          className="px-2 py-1 text-xs rounded bg-emerald-950 text-emerald-300 hover:bg-emerald-900 border border-emerald-800"
                        >
                          Start
                        </button>
                      )}
                      {t.state === 'IN_PROGRESS' && (
                        <>
                          <button
                            onClick={() => handleStateTransition(t.id, 'SUBMITTED')}
                            className="px-2 py-1 text-xs rounded bg-cyan-950 text-cyan-300 hover:bg-cyan-900 border border-cyan-800"
                          >
                            Submit
                          </button>
                          <button
                            onClick={() => handleStateTransition(t.id, 'BLOCKED')}
                            className="px-2 py-1 text-xs rounded bg-rose-950 text-rose-300 hover:bg-rose-900 border border-rose-800"
                          >
                            Block
                          </button>
                        </>
                      )}
                      {t.state === 'BLOCKED' && (
                        <button
                          onClick={() => handleStateTransition(t.id, 'IN_PROGRESS')}
                          className="px-2 py-1 text-xs rounded bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700"
                        >
                          Unblock
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
