export interface RouteDef {
  id: string;
  label: string;
  group: 'Overview' | 'Set up' | 'Run' | 'Quality' | 'Deliver';
  shortcut: string;
}

export const ROUTES: RouteDef[] = [
  { id: 'today', label: 'Today', group: 'Overview', shortcut: '1' },
  { id: 'campaigns', label: 'Campaigns', group: 'Set up', shortcut: '2' },
  { id: 'workforce', label: 'Workforce', group: 'Set up', shortcut: '3' },
  { id: 'calibration', label: 'Calibration', group: 'Set up', shortcut: '4' },
  { id: 'allocations', label: 'Allocate', group: 'Run', shortcut: '5' },
  { id: 'execution', label: 'Execute', group: 'Run', shortcut: '6' },
  { id: 'qa', label: 'QA review', group: 'Quality', shortcut: '7' },
  { id: 'quality', label: 'Quality insights', group: 'Quality', shortcut: '8' },
  { id: 'delivery', label: 'Delivery', group: 'Deliver', shortcut: '9' },
];

export const DEFAULT_ROUTE = 'today';

export function routeFromHash(hash: string): string {
  const id = hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES.some(r => r.id === id) ? id : DEFAULT_ROUTE;
}
