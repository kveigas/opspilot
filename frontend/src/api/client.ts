/// <reference types="vite/client" />

const BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '')}/api/v1`
  : '/api/v1';

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || `Request failed with status ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Health
  getHealth: () => fetchApi<{ status: string; service: string; phase: string }>('/health'),

  // Campaigns
  getCampaigns: (status?: string) =>
    fetchApi<any[]>(`/campaigns${status ? `?status=${status}` : ''}`),
  getCampaign: (id: string) => fetchApi<any>(`/campaigns/${id}`),
  createCampaign: (data: any) =>
    fetchApi<any>('/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCampaign: (id: string, data: any) =>
    fetchApi<any>(`/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Workers
  getWorkers: () => fetchApi<any[]>('/workers'),
  getWorker: (id: string) => fetchApi<any>(`/workers/${id}`),
  createWorker: (data: any) =>
    fetchApi<any>('/workers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateWorker: (id: string, data: any) =>
    fetchApi<any>(`/workers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Capacity
  getWorkerCapacity: (workerId: string, date: string) =>
    fetchApi<any>(`/workers/${workerId}/capacity?date=${date}`),
  getCapacity: (workerId: string, date: string) =>
    fetchApi<any>(`/workers/${workerId}/capacity?date=${date}`),
  upsertWorkerCapacity: (data: any) =>
    fetchApi<any>('/workers/capacity', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  upsertCapacity: (data: any) =>
    fetchApi<any>('/workers/capacity', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Calibration
  getCalibrations: () => fetchApi<any[]>('/calibrations'),
  createCalibrationRound: (data: any) =>
    fetchApi<any>('/calibrations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createCalibration: (data: any) =>
    fetchApi<any>('/calibrations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  recordCalibrationResult: (roundId: string, data: any) =>
    fetchApi<any>(`/calibrations/${roundId}/results`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Qualifications
  checkQualification: (workerId: string, campaignId: string) =>
    fetchApi<any>(`/qualifications/check?worker_id=${workerId}&campaign_id=${campaignId}`),

  // Audit Logs
  getAuditLogs: () => fetchApi<any[]>('/audit-logs'),

  // Tasks & Execution
  createTaskBatch: (campaignId: string, data: { count: number; required_skill_tags?: string[]; priority?: string }) =>
    fetchApi<any[]>(`/campaigns/${campaignId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getTasks: (params?: { campaign_id?: string; state?: string; worker_id?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.campaign_id) query.append('campaign_id', params.campaign_id);
    if (params?.state) query.append('state', params.state);
    if (params?.worker_id) query.append('worker_id', params.worker_id);
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.offset) query.append('offset', params.offset.toString());
    const queryString = query.toString();
    return fetchApi<any[]>(`/tasks${queryString ? `?${queryString}` : ''}`);
  },
  getTask: (taskId: string) => fetchApi<any>(`/tasks/${taskId}`),
  updateTaskState: (taskId: string, state: string, reason?: string) =>
    fetchApi<any>(`/tasks/${taskId}/state`, {
      method: 'PATCH',
      body: JSON.stringify({ state, reason }),
    }),
  getCampaignExecution: (campaignId: string) => fetchApi<any>(`/campaigns/${campaignId}/execution`),

  // Allocations
  triggerAllocation: (data: { campaign_id: string; operational_date: string; max_tasks_to_allocate?: number }) =>
    fetchApi<any>('/allocations/trigger', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getAllocations: (params?: { campaign_id?: string; worker_id?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.campaign_id) query.append('campaign_id', params.campaign_id);
    if (params?.worker_id) query.append('worker_id', params.worker_id);
    if (params?.status) query.append('status', params.status);
    const queryString = query.toString();
    return fetchApi<any[]>(`/allocations${queryString ? `?${queryString}` : ''}`);
  },
  releaseAllocation: (allocationId: string, reason: string = 'MANUAL_RELEASE') =>
    fetchApi<any>(`/allocations/${allocationId}/release?reason=${encodeURIComponent(reason)}`, {
      method: 'POST',
    }),

  // Phase 3: QA & Reviews
  getReviews: (params?: { campaign_id?: string; task_id?: string; reviewer_id?: string }) => {
    const query = new URLSearchParams();
    if (params?.campaign_id) query.append('campaign_id', params.campaign_id);
    if (params?.task_id) query.append('task_id', params.task_id);
    if (params?.reviewer_id) query.append('reviewer_id', params.reviewer_id);
    const queryString = query.toString();
    return fetchApi<any[]>(`/reviews${queryString ? `?${queryString}` : ''}`);
  },
  submitReview: (data: { task_id: string; reviewer_id: string; verdict: string; reason_code?: string; comment?: string }) =>
    fetchApi<any>('/reviews', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  sampleSubmittedTasks: (campaignId: string) =>
    fetchApi<any>(`/campaigns/${campaignId}/reviews/sample`, {
      method: 'POST',
    }),

  // Phase 3: Escalations
  getEscalations: (params?: { campaign_id?: string; status?: string; severity?: string }) => {
    const query = new URLSearchParams();
    if (params?.campaign_id) query.append('campaign_id', params.campaign_id);
    if (params?.status) query.append('status', params.status);
    if (params?.severity) query.append('severity', params.severity);
    const queryString = query.toString();
    return fetchApi<any[]>(`/escalations${queryString ? `?${queryString}` : ''}`);
  },
  createEscalation: (data: { campaign_id: string; task_id?: string; owner_id?: string; title: string; description: string; severity?: string; category?: string; blocker?: boolean; due_at?: string }) =>
    fetchApi<any>('/escalations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateEscalationStatus: (escalationId: string, data: { status: string; owner_id?: string; resolution?: string; target_task_state?: string }) =>
    fetchApi<any>(`/escalations/${escalationId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Phase 3: SLA Engine
  getCampaignSLA: (campaignId: string, date?: string) =>
    fetchApi<any>(`/campaigns/${campaignId}/sla${date ? `?date=${date}` : ''}`),

  // Phase 3: Delivery Readiness Engine
  getDeliveryReadiness: (campaignId: string) =>
    fetchApi<any>(`/campaigns/${campaignId}/delivery-readiness`),

  // Phase 3: Today Manager Cockpit
  getTodayCockpit: () => fetchApi<any>('/today'),

  // Phase 4: Public Demo API
  bootstrapDemo: (reset: boolean = false) =>
    fetchApi<any>(`/demo/bootstrap${reset ? '?reset=true' : ''}`, { method: 'POST' }),
  advanceDemoWorkday: (campaignId?: string) =>
    fetchApi<any>(`/demo/advance-workday${campaignId ? `?campaign_id=${campaignId}` : ''}`, { method: 'POST' }),
  resetDemo: () => fetchApi<any>('/demo/reset', { method: 'POST' }),
  getDemoProvenance: () => fetchApi<any>('/demo/provenance'),
};
