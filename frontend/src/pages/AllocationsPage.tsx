import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';

export const AllocationsPage: React.FC = () => {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [operationalDate, setOperationalDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [unassignedTaskCount, setUnassignedTaskCount] = useState<number>(0);
  const [lastRun, setLastRun] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Modal State for Task Creation
  const [isTaskModalOpen, setIsTaskModalOpen] = useState<boolean>(false);
  const [taskCountInput, setTaskCountInput] = useState<number>(50);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const campData = await api.getCampaigns();
      setCampaigns(campData);
      if (campData.length > 0 && !selectedCampaignId) {
        setSelectedCampaignId(campData[0].id);
      }

      if (selectedCampaignId) {
        const allocData = await api.getCampaignAllocations(selectedCampaignId).catch(() => []);
        setAllocations(allocData);

        const tasksData = await api.getTasks(selectedCampaignId, 'UNASSIGNED', 1000).catch(() => []);
        setUnassignedTaskCount(tasksData.length);
      }
    } catch (err) {
      console.error('Failed to load allocations page data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedCampaignId]);

  const handleTriggerAllocation = async () => {
    if (!selectedCampaignId) return;
    try {
      const run = await api.triggerAllocationRun({
        campaign_id: selectedCampaignId,
        operational_date: operationalDate,
      });
      setLastRun(run);
      loadData();
    } catch (err: any) {
      console.error('Allocation run failed:', err);
    }
  };

  const handleCreateTasks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaignId) return;
    try {
      await api.createTaskBatch(selectedCampaignId, { count: taskCountInput });
      setIsTaskModalOpen(false);
      loadData();
    } catch (err: any) {
      console.error('Failed to create task batch:', err);
    }
  };

  const handleReleaseAllocation = async (allocId: string) => {
    try {
      await api.transitionTaskState(allocId, 'UNASSIGNED', 'MANUAL_RELEASE');
      loadData();
    } catch (err: any) {
      console.error('Failed to release allocation:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Task Allocation Engine</h1>
          <p className="text-sm text-slate-400">
            Deterministic rules-based allocation respecting skill requirements, qualification, and date-scoped capacity.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsTaskModalOpen(true)}
            className="px-3 py-2 text-xs font-semibold rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            + Create Task Batch
          </button>
          <button
            onClick={handleTriggerAllocation}
            disabled={!selectedCampaignId || unassignedTaskCount === 0}
            className="px-4 py-2 text-xs font-bold rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-sm transition"
          >
            ⚡ Trigger Allocation Run
          </button>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="campaign-select" className="block text-xs font-medium text-slate-400 mb-1">Target Campaign</label>
          <select
            id="campaign-select"
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.task_type})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="operational-date" className="block text-xs font-medium text-slate-400 mb-1">Operational Date</label>
          <input
            id="operational-date"
            type="date"
            value={operationalDate}
            onChange={(e) => setOperationalDate(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex flex-col justify-center">
          <span className="text-xs text-slate-400">Unallocated Backlog</span>
          <span className="text-xl font-bold text-amber-400">{unassignedTaskCount} Tasks</span>
        </div>
      </div>

      {/* Last Allocation Run Results */}
      {lastRun && (
        <div className="bg-slate-800/60 border border-emerald-900/60 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-emerald-400">Latest Allocation Run Results</h2>
            <span className="text-xs text-slate-400">{new Date(lastRun.created_at).toLocaleTimeString()}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
              <span className="block text-xs text-slate-400">Considered</span>
              <span className="text-lg font-bold text-slate-200">{lastRun.tasks_considered}</span>
            </div>
            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
              <span className="block text-xs text-slate-400">Allocated</span>
              <span className="text-lg font-bold text-emerald-400">{lastRun.tasks_allocated}</span>
            </div>
            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
              <span className="block text-xs text-slate-400">Unallocated</span>
              <span className="text-lg font-bold text-amber-400">{lastRun.tasks_unallocated}</span>
            </div>
            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
              <span className="block text-xs text-slate-400">Workers Used</span>
              <span className="text-lg font-bold text-slate-200">{lastRun.workers_used}</span>
            </div>
            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
              <span className="block text-xs text-slate-400">Capacity Consumed</span>
              <span className="text-lg font-bold text-slate-200">{lastRun.capacity_consumed}</span>
            </div>
          </div>

          {/* Reason Breakdown */}
          {lastRun.unallocated_reason_counts && (
            <div className="mt-2 text-xs text-slate-400 flex flex-wrap gap-2">
              <span className="font-semibold text-slate-300">Unallocated Reason Breakdown:</span>
              {Object.entries(lastRun.unallocated_reason_counts as Record<string, number>).map(([reason, count]) => (
                <span key={reason} className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                  {reason}: <strong className="text-slate-100">{count}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Allocations Table */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Active Task Allocations</h2>
          <span className="text-xs text-slate-400">{allocations.length} Active Records</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading allocations...</div>
        ) : allocations.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            No active allocations found for this campaign. Trigger an allocation run above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900/80 text-xs text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-semibold">Allocation ID</th>
                  <th className="px-4 py-3 font-semibold">Task ID</th>
                  <th className="px-4 py-3 font-semibold">Worker ID</th>
                  <th className="px-4 py-3 font-semibold">Operational Date</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {allocations.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-700/40">
                    <td className="px-4 py-3 text-xs font-mono text-slate-400">{a.id.substring(0, 8)}...</td>
                    <td className="px-4 py-3 font-mono text-slate-200">{a.task_id.substring(0, 8)}...</td>
                    <td className="px-4 py-3 font-mono text-emerald-400">{a.worker_id.substring(0, 8)}...</td>
                    <td className="px-4 py-3 text-xs">{a.operational_date}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleReleaseAllocation(a.id)}
                        className="px-2.5 py-1 text-xs font-medium rounded bg-rose-950/80 text-rose-300 hover:bg-rose-900 border border-rose-800 transition"
                      >
                        Release
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create Task Batch */}
      <Modal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        title="Create Campaign Task Batch"
      >
        <form onSubmit={handleCreateTasks} className="space-y-4">
          <div>
            <label htmlFor="task-count" className="block text-xs font-medium text-slate-400 mb-1">Batch Count</label>
            <input
              id="task-count"
              type="number"
              min="1"
              max="2000"
              value={taskCountInput}
              onChange={(e) => setTaskCountInput(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              Tasks will inherit campaign defaults (task type, required skill tags, priority).
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={() => setIsTaskModalOpen(false)}
              className="px-3 py-1.5 text-xs rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-500"
            >
              Create Tasks
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
