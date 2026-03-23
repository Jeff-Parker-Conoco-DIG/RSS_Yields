import React from 'react';

interface RefreshButtonProps {
  onClick: () => void;
  loading?: boolean;
}

export const RefreshButton: React.FC<RefreshButtonProps> = ({ onClick, loading }) => (
  <button
    onClick={onClick}
    disabled={loading}
    style={{
      background: 'none',
      border: '1px solid #555',
      borderRadius: 4,
      color: '#ccc',
      padding: '4px 12px',
      cursor: loading ? 'wait' : 'pointer',
      fontSize: 13,
    }}
  >
    {loading ? 'Loading...' : 'Refresh'}
  </button>
);
