import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Campaign, CampaignPriority } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { Plus, Target, Calendar, CheckCircle2, XCircle } from 'lucide-react';
import { useCampaigns } from '../state/CampaignContext';

export const CampaignsPage: React.FC = () => {
  const { refresh: refreshShared } = useCampaigns();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<{
    name: string;
    client_name: string;
    task_type: string;
    description: string;
    total_volume: number;
    target_quality_pct: number;
    review_sampling_pct: number;
    qa_policy: 'FLAT' | 'ADAPTIVE';
    target_daily_throughput: number;
    start_date: string;
    due_date: string;
    priority: CampaignPriority;
    calibration_required: boolean;
    required_annotators: number;
    required_reviewers: number;
    skillsInput: string;
  }>({
    name: '',
    client_name: '',
    task_type: 'TEXT_ANNOTATION',
    description: '',
    total_volume: 1000,
    target_quality_pct: 95.0,
    review_sampling_pct: 20.0,
    qa_policy: 'ADAPTIVE',
    target_daily_throughput: 100,
    start_date: '2026-08-12',
    due_date: '2026-08-25',
    priority: 'MEDIUM',
    calibration_required: true,
    required_annotators: 5,
    required_reviewers: 1,
    skillsInput: 'de, rlhf',
  });

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const data = await api.getCampaigns();
      setCampaigns(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.due_date <= form.start_date) {
      setError('Due date must be strictly greater than start date');
      return;
    }

    const skills = form.skillsInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    try {
      await api.createCampaign({
        ...form,
        total_volume: Number(form.total_volume),
        target_quality_pct: Number(form.target_quality_pct),
        review_sampling_pct: Number(form.review_sampling_pct),
        target_daily_throughput: Number(form.target_daily_throughput),
        required_annotators: Number(form.required_annotators),
        required_reviewers: Number(form.required_reviewers),
        required_skills: skills,
      });

      setIsModalOpen(false);
      loadCampaigns();
      void refreshShared();
    } catch (err: any) {
      setError(err.message || 'Failed to create campaign');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ops-text">Campaign Intake & Operational Config</h1>
          <p className="text-sm text-ops-muted mt-1">Configure volume, quality targets, throughput, and calibration rules</p>
        </div>
        <button
          onClick={() => {
            setError(null);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-ops-primary hover:bg-ops-primary-hover text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Create Campaign
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-ops-muted">Loading campaigns...</div>
      ) : campaigns.length === 0 ? (
        <div className="bg-ops-card border border-ops-border rounded-xl p-12 text-center">
          <Target className="w-12 h-12 text-ops-muted mx-auto mb-3" />
          <h3 className="text-lg font-bold text-ops-text">No Campaigns Found</h3>
          <p className="text-sm text-ops-muted mt-1 max-w-md mx-auto">
            Create your first campaign to define task volume, quality standards, and worker skill requirements.
          </p>
        </div>
      ) : (
        <div className="bg-ops-card border border-ops-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Campaign table">
            <table className="w-full text-left text-sm">
              <thead className="bg-ops-bg/80 text-ops-muted uppercase text-xs border-b border-ops-border">
                <tr>
                  <th className="px-6 py-3.5 font-semibold">Campaign / Client</th>
                  <th className="px-6 py-3.5 font-semibold">Task Type</th>
                  <th className="px-6 py-3.5 font-semibold">Volume & Throughput</th>
                  <th className="px-6 py-3.5 font-semibold">Schedule</th>
                  <th className="px-6 py-3.5 font-semibold">Calibration</th>
                  <th className="px-6 py-3.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ops-border/60">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-ops-hover/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-ops-text">{c.name}</div>
                      <div className="text-xs text-ops-muted">{c.client_name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-900 border border-slate-800 text-slate-300 font-mono">
                        {c.task_type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-ops-text">{c.total_volume.toLocaleString()} tasks</div>
                      <div className="text-xs text-ops-muted">
                        Target: {c.target_daily_throughput}/day • QA: {c.qa_policy === 'ADAPTIVE' ? 'adaptive' : 'flat'} from {c.review_sampling_pct}%
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-ops-text flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-ops-muted" />
                        {c.start_date} → {c.due_date}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {c.calibration_required ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Required
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-ops-muted">
                          <XCircle className="w-3.5 h-3.5" /> Optional
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create New Campaign">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-950/80 border border-red-800 text-red-300 rounded-lg text-sm">{error}</div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="camp-name" className="block text-xs font-semibold text-ops-muted mb-1">Campaign Name</label>
              <input
                id="camp-name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
                placeholder="Multilingual RLHF Campaign"
              />
            </div>
            <div>
              <label htmlFor="camp-client" className="block text-xs font-semibold text-ops-muted mb-1">Client Name</label>
              <input
                id="camp-client"
                type="text"
                required
                value={form.client_name}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
                placeholder="Global AI Ops"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="camp-type" className="block text-xs font-semibold text-ops-muted mb-1">Task Type</label>
              <select
                id="camp-type"
                value={form.task_type}
                onChange={(e) => setForm({ ...form, task_type: e.target.value })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
              >
                <option value="TEXT_ANNOTATION">TEXT_ANNOTATION</option>
                <option value="PREFERENCE_RANKING">PREFERENCE_RANKING</option>
                <option value="MULTIMODAL_EVAL">MULTIMODAL_EVAL</option>
                <option value="CODE_GENERATION_QA">CODE_GENERATION_QA</option>
              </select>
            </div>
            <div>
              <label htmlFor="camp-priority" className="block text-xs font-semibold text-ops-muted mb-1">Priority</label>
              <select
                id="camp-priority"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as CampaignPriority })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="URGENT">URGENT</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="camp-volume" className="block text-xs font-semibold text-ops-muted mb-1">Total Volume</label>
              <input
                id="camp-volume"
                type="number"
                min="1"
                required
                value={form.total_volume}
                onChange={(e) => setForm({ ...form, total_volume: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
              />
            </div>
            <div>
              <label htmlFor="camp-rate" className="block text-xs font-semibold text-ops-muted mb-1">Target Daily Rate</label>
              <input
                id="camp-rate"
                type="number"
                min="1"
                required
                value={form.target_daily_throughput}
                onChange={(e) => setForm({ ...form, target_daily_throughput: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
              />
            </div>
            <div>
              <label htmlFor="camp-sampling" className="block text-xs font-semibold text-ops-muted mb-1">QA Sampling %</label>
              <input
                id="camp-sampling"
                type="number"
                min="0"
                max="100"
                required
                value={form.review_sampling_pct}
                onChange={(e) => setForm({ ...form, review_sampling_pct: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
              />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="block text-xs font-semibold text-ops-muted mb-1">QA sampling policy</legend>
            {([
              ['ADAPTIVE', 'Adaptive (recommended)', 'Review effort follows each annotator’s QA record: proven annotators are spot-checked, new or struggling annotators are reviewed heavily. The sampling % is the base rate.'],
              ['FLAT', 'Flat', 'Every annotator is reviewed at the same sampling %.'],
            ] as const).map(([value, title, body]) => (
              <label key={value} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${form.qa_policy === value ? 'border-emerald-600 bg-emerald-950/30' : 'border-ops-border'}`}>
                <input type="radio" name="qa_policy" value={value} checked={form.qa_policy === value} onChange={() => setForm({ ...form, qa_policy: value })} className="mt-1 h-4 min-h-0 w-4 accent-emerald-500" />
                <span><span className="block text-sm font-medium text-ops-text">{title}</span><span className="block text-xs text-ops-muted">{body}</span></span>
              </label>
            ))}
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="camp-start" className="block text-xs font-semibold text-ops-muted mb-1">Start Date</label>
              <input
                id="camp-start"
                type="date"
                required
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
              />
            </div>
            <div>
              <label htmlFor="camp-due" className="block text-xs font-semibold text-ops-muted mb-1">Due Date</label>
              <input
                id="camp-due"
                type="date"
                required
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
              />
            </div>
          </div>

          <div>
            <label htmlFor="camp-skills" className="block text-xs font-semibold text-ops-muted mb-1">Required Skill Tags (comma-separated)</label>
            <input
                id="camp-skills"
              type="text"
              value={form.skillsInput}
              onChange={(e) => setForm({ ...form, skillsInput: e.target.value })}
              className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
              placeholder="de, rlhf, medical"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="calib_req"
              checked={form.calibration_required}
              onChange={(e) => setForm({ ...form, calibration_required: e.target.checked })}
              className="rounded bg-ops-bg border-ops-border text-ops-primary focus:ring-0"
            />
            <label htmlFor="calib_req" className="text-sm font-medium text-ops-text">
              Calibration Required for Allocation Eligibility
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-ops-border">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 border border-ops-border hover:bg-ops-hover text-ops-muted rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-ops-primary hover:bg-ops-primary-hover text-white rounded-lg text-sm font-semibold transition-colors"
            >
              Create Campaign
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
