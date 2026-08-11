export type CampaignPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'DELIVERED' | 'ARCHIVED';

export interface Campaign {
  id: string;
  name: string;
  client_name: string;
  task_type: string;
  description?: string;
  total_volume: number;
  target_quality_pct: number;
  review_sampling_pct: number;
  target_daily_throughput: number;
  start_date: string;
  due_date: string;
  priority: CampaignPriority;
  status: CampaignStatus;
  calibration_required: boolean;
  required_annotators: number;
  required_reviewers: number;
  created_at: string;
  updated_at: string;
  required_skills: string[];
}

export type WorkerRole = 'ANNOTATOR' | 'REVIEWER' | 'LEAD';
export type WorkerAvailability = 'AVAILABLE' | 'BUSY' | 'ON_LEAVE' | 'INACTIVE';

export interface WorkerQualificationSummary {
  campaign_id: string;
  status: string;
  score?: number;
  attempts_used: number;
}

export interface Worker {
  id: string;
  name: string;
  email: string;
  role: WorkerRole;
  timezone: string;
  default_max_daily_capacity: number;
  availability: WorkerAvailability;
  is_active: boolean;
  created_at: string;
  skills: string[];
  qualifications: WorkerQualificationSummary[];
}

export interface WorkerDailyCapacity {
  id: string;
  worker_id: string;
  capacity_date: string;
  max_daily_capacity: number;
  allocated_for_date: number;
  remaining_capacity_for_date: number;
}

export interface CalibrationResult {
  id: string;
  round_id: string;
  worker_id: string;
  score_pct: number;
  passed: boolean;
  attempt_number: number;
  evaluated_at: string;
}

export interface CalibrationRound {
  id: string;
  campaign_id: string;
  domain_tag: string;
  total_test_tasks: number;
  pass_threshold_pct: number;
  max_allowed_attempts: number;
  status: string;
  created_at: string;
  results: CalibrationResult[];
}

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  created_at: string;
}
