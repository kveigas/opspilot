const dateFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Calendar dates from the API (YYYY-MM-DD) are local dates, not instants. */
export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return value;
  return dateFormatter.format(new Date(y, m - 1, d));
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
}

export function formatTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : timeFormatter.format(date);
}

export function pct(value?: number | null, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function number(value?: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString();
}

const ACRONYMS = new Set(['sla', 'qa', 'id', 'api', 'ai']);

/** CAPACITY_BUFFER_LOW -> Capacity buffer low; SLA_STATUS_CHANGED -> SLA status changed */
export function humanize(code?: string | null): string {
  if (!code) return '—';
  const words = code.toLowerCase().split('_').filter(Boolean).map(w => (ACRONYMS.has(w) ? w.toUpperCase() : w));
  if (words.length === 0) return code;
  return [words[0][0].toUpperCase() + words[0].slice(1), ...words.slice(1)].join(' ');
}

export const REASON_EXPLANATIONS: Record<string, string> = {
  INSUFFICIENT_CAPACITY: 'Qualified capacity is below the daily rate needed to finish on time.',
  CAPACITY_BUFFER_LOW: 'Capacity only just covers the required daily rate; any absence puts the date at risk.',
  CAMPAIGN_OVERDUE: 'The due date has passed with work remaining.',
  ZERO_ELIGIBLE_CAPACITY: 'No qualified, available annotator has capacity today.',
  CRITICAL_ESCALATION_OPEN: 'A critical escalation is open and blocks affected work.',
  REVIEW_BACKLOG_CRITICAL: 'More than half of submitted work is still waiting for QA sampling.',
  REVIEW_BACKLOG_HIGH: 'More than a quarter of submitted work is waiting for QA sampling.',
  BLOCKER_VOLUME_CRITICAL: 'More than 15 tasks are blocked.',
  BLOCKER_VOLUME_HIGH: 'More than 5 tasks are blocked.',
  NO_ELIGIBLE_WORKER: 'No worker satisfies the campaign requirements.',
  NO_CAPACITY: 'Qualified workers have no remaining capacity on this date.',
  MISSING_REQUIRED_SKILL: 'No available worker has every required skill.',
  QUALIFICATION_REQUIRED: 'Workers with the skills have not passed calibration.',
  NO_ACTIVE_ANNOTATOR: 'No active annotator is available.',
};

export function shortId(id?: string | null): string {
  if (!id) return '—';
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
