import React from 'react';
import { YIELD_COLORS } from '../../constants';

interface StatusBadgeProps {
  value: number | null;
  threshold: number;
  label?: string;
}

function getStatus(value: number | null, threshold: number): 'good' | 'warning' | 'bad' | 'neutral' {
  if (value == null) return 'neutral';
  const abs = Math.abs(value);
  if (abs <= threshold * 0.5) return 'good';
  if (abs <= threshold) return 'warning';
  return 'bad';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ value, threshold, label }) => {
  const status = getStatus(value, threshold);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        backgroundColor: YIELD_COLORS[status],
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {label ?? (value != null ? value.toFixed(2) : '—')}
    </span>
  );
};
