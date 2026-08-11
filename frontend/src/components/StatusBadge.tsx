import React from 'react';

interface Props {
  status: string;
  type?: 'campaign' | 'worker' | 'qualification' | 'calibration' | 'sla';
}

export const StatusBadge: React.FC<Props> = ({ status }) => {
  let style = 'bg-gray-800 text-gray-300 border-gray-700';

  switch (status.toUpperCase()) {
    case 'ACTIVE':
    case 'AVAILABLE':
    case 'PASSED':
    case 'ON_TRACK':
    case 'HEALTHY':
      style = 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60';
      break;
    case 'AT_RISK':
    case 'RETRY_REQUIRED':
    case 'BUSY':
    case 'PAUSED':
      style = 'bg-amber-950/80 text-amber-400 border-amber-800/60';
      break;
    case 'CRITICAL':
    case 'FAILED':
    case 'INACTIVE':
      style = 'bg-red-950/80 text-red-400 border-red-800/60';
      break;
    case 'NOT_STARTED':
    case 'DRAFT':
      style = 'bg-slate-900 text-slate-400 border-slate-800';
      break;
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold border ${style}`}>
      {status}
    </span>
  );
};
