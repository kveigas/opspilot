import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Worker, WorkerRole, WorkerAvailability } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { Plus, Users, Calendar } from 'lucide-react';

export const WorkforcePage: React.FC = () => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCapacityModalOpen, setIsCapacityModalOpen] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<{
    name: string;
    email: string;
    role: WorkerRole;
    timezone: string;
    default_max_daily_capacity: number;
    availability: WorkerAvailability;
    is_active: boolean;
    skillsInput: string;
  }>({
    name: '',
    email: '',
    role: 'ANNOTATOR',
    timezone: 'UTC',
    default_max_daily_capacity: 30,
    availability: 'AVAILABLE',
    is_active: true,
    skillsInput: 'de, rlhf',
  });

  const [capForm, setCapForm] = useState({
    capacity_date: '2026-08-12',
    max_daily_capacity: 30,
    allocated_for_date: 0,
  });

  const loadWorkers = async () => {
    try {
      setLoading(true);
      const data = await api.getWorkers();
      setWorkers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkers();
  }, []);

  const handleCreateWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const skills = createForm.skillsInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    try {
      await api.createWorker({
        ...createForm,
        default_max_daily_capacity: Number(createForm.default_max_daily_capacity),
        skills,
      });

      setIsCreateModalOpen(false);
      loadWorkers();
    } catch (err: any) {
      setError(err.message || 'Failed to create worker');
    }
  };

  const openCapacityEditor = async (w: Worker) => {
    setSelectedWorker(w);
    try {
      const c = await api.getCapacity(w.id, capForm.capacity_date);
      setCapForm({
        capacity_date: c.capacity_date,
        max_daily_capacity: c.max_daily_capacity,
        allocated_for_date: c.allocated_for_date,
      });
      setIsCapacityModalOpen(true);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleSaveCapacity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorker) return;
    setError(null);

    if (Number(capForm.allocated_for_date) > Number(capForm.max_daily_capacity)) {
      setError('Allocated load cannot exceed max daily capacity');
      return;
    }

    try {
      await api.upsertCapacity({
        worker_id: selectedWorker.id,
        capacity_date: capForm.capacity_date,
        max_daily_capacity: Number(capForm.max_daily_capacity),
        allocated_for_date: Number(capForm.allocated_for_date),
      });

      setIsCapacityModalOpen(false);
      loadWorkers();
    } catch (err: any) {
      setError(err.message || 'Failed to update capacity');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ops-text">Workforce Roster & Date Capacity</h1>
          <p className="text-sm text-ops-muted mt-1">Manage worker identity, roles, skills, and date-scoped capacities</p>
        </div>
        <button
          onClick={() => {
            setError(null);
            setIsCreateModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-ops-primary hover:bg-ops-primary-hover text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Worker
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-ops-muted">Loading workforce roster...</div>
      ) : workers.length === 0 ? (
        <div className="bg-ops-card border border-ops-border rounded-xl p-12 text-center">
          <Users className="w-12 h-12 text-ops-muted mx-auto mb-3" />
          <h3 className="text-lg font-bold text-ops-text">No Workers Registered</h3>
          <p className="text-sm text-ops-muted mt-1 max-w-md mx-auto">
            Add qualified annotators and reviewers to build your campaign operational workforce.
          </p>
        </div>
      ) : (
        <div className="bg-ops-card border border-ops-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ops-bg/80 text-ops-muted uppercase text-xs border-b border-ops-border">
                <tr>
                  <th className="px-6 py-3.5 font-semibold">Worker / Email</th>
                  <th className="px-6 py-3.5 font-semibold">Role & Timezone</th>
                  <th className="px-6 py-3.5 font-semibold">Skill Tags</th>
                  <th className="px-6 py-3.5 font-semibold">Default Capacity</th>
                  <th className="px-6 py-3.5 font-semibold">Qualifications</th>
                  <th className="px-6 py-3.5 font-semibold">Availability</th>
                  <th className="px-6 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ops-border/60">
                {workers.map((w) => (
                  <tr key={w.id} className="hover:bg-ops-hover/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-ops-text">{w.name}</div>
                      <div className="text-xs text-ops-muted">{w.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-900 border border-slate-800 text-slate-300 font-mono font-medium">
                        {w.role}
                      </span>
                      <div className="text-xs text-ops-muted mt-0.5">{w.timezone}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {w.skills.map((s) => (
                          <span key={s} className="px-2 py-0.5 rounded text-[11px] bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-semibold text-ops-text">
                      {w.default_max_daily_capacity}/day
                    </td>
                    <td className="px-6 py-4">
                      {w.qualifications.length === 0 ? (
                        <span className="text-xs text-ops-muted">Uncalibrated</span>
                      ) : (
                        <div className="space-y-1">
                          {w.qualifications.map((q) => (
                            <StatusBadge key={q.campaign_id} status={q.status} />
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={w.availability} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openCapacityEditor(w)}
                        className="px-3 py-1 bg-ops-bg border border-ops-border hover:bg-ops-hover text-ops-text text-xs rounded font-medium transition-colors inline-flex items-center gap-1"
                      >
                        <Calendar className="w-3 h-3 text-ops-muted" /> Date Capacity
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Worker Modal */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Register New Worker">
        <form onSubmit={handleCreateWorker} className="space-y-4">
          {error && <div className="p-3 bg-red-950/80 border border-red-800 text-red-300 rounded-lg text-sm">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ops-muted mb-1">Full Name</label>
              <input
                type="text"
                required
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
                placeholder="Elena Rostova"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ops-muted mb-1">Email Address</label>
              <input
                type="email"
                required
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
                placeholder="elena.rostova@example.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ops-muted mb-1">Operational Role</label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as WorkerRole })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
              >
                <option value="ANNOTATOR">ANNOTATOR</option>
                <option value="REVIEWER">REVIEWER</option>
                <option value="LEAD">LEAD</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ops-muted mb-1">Timezone</label>
              <input
                type="text"
                value={createForm.timezone}
                onChange={(e) => setCreateForm({ ...createForm, timezone: e.target.value })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
                placeholder="UTC"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ops-muted mb-1">Default Max Daily Capacity</label>
              <input
                type="number"
                min="1"
                required
                value={createForm.default_max_daily_capacity}
                onChange={(e) => setCreateForm({ ...createForm, default_max_daily_capacity: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ops-muted mb-1">Availability</label>
              <select
                value={createForm.availability}
                onChange={(e) => setCreateForm({ ...createForm, availability: e.target.value as WorkerAvailability })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
              >
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="BUSY">BUSY</option>
                <option value="ON_LEAVE">ON_LEAVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ops-muted mb-1">Skill Tags (comma-separated)</label>
            <input
              type="text"
              value={createForm.skillsInput}
              onChange={(e) => setCreateForm({ ...createForm, skillsInput: e.target.value })}
              className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
              placeholder="de, rlhf, medical"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-ops-border">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 border border-ops-border hover:bg-ops-hover text-ops-muted rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-ops-primary hover:bg-ops-primary-hover text-white rounded-lg text-sm font-semibold transition-colors"
            >
              Register Worker
            </button>
          </div>
        </form>
      </Modal>

      {/* Date Capacity Editor Modal */}
      <Modal isOpen={isCapacityModalOpen} onClose={() => setIsCapacityModalOpen(false)} title={`Date Capacity — ${selectedWorker?.name}`}>
        <form onSubmit={handleSaveCapacity} className="space-y-4">
          {error && <div className="p-3 bg-red-950/80 border border-red-800 text-red-300 rounded-lg text-sm">{error}</div>}

          <div>
            <label className="block text-xs font-semibold text-ops-muted mb-1">Capacity Date</label>
            <input
              type="date"
              required
              value={capForm.capacity_date}
              onChange={(e) => setCapForm({ ...capForm, capacity_date: e.target.value })}
              className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ops-muted mb-1">Max Daily Capacity</label>
              <input
                type="number"
                min="1"
                required
                value={capForm.max_daily_capacity}
                onChange={(e) => setCapForm({ ...capForm, max_daily_capacity: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ops-muted mb-1">Allocated Load for Date</label>
              <input
                type="number"
                min="0"
                required
                value={capForm.allocated_for_date}
                onChange={(e) => setCapForm({ ...capForm, allocated_for_date: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
              />
            </div>
          </div>

          <div className="p-3 bg-ops-bg/60 border border-ops-border rounded-lg text-xs text-ops-muted flex justify-between">
            <span>Derived Remaining Capacity:</span>
            <span className="font-bold text-emerald-400">
              {Math.max(0, capForm.max_daily_capacity - capForm.allocated_for_date)} tasks
            </span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-ops-border">
            <button
              type="button"
              onClick={() => setIsCapacityModalOpen(false)}
              className="px-4 py-2 border border-ops-border hover:bg-ops-hover text-ops-muted rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-ops-primary hover:bg-ops-primary-hover text-white rounded-lg text-sm font-semibold transition-colors"
            >
              Save Capacity
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
