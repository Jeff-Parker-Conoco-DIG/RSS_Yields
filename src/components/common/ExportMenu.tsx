import React, { useState } from 'react';

interface ExportMenuProps {
  onExportExcel: () => void;
  onExportPdf: () => void;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({ onExportExcel, onExportPdf }) => {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'none',
          border: '1px solid #555',
          borderRadius: 4,
          color: '#ccc',
          padding: '4px 12px',
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        Export
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            background: '#2a2a2a',
            border: '1px solid #555',
            borderRadius: 4,
            zIndex: 100,
            minWidth: 120,
          }}
        >
          <button
            onClick={() => { onExportExcel(); setOpen(false); }}
            style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', textAlign: 'left' }}
          >
            Excel (.xlsx)
          </button>
          <button
            onClick={() => { onExportPdf(); setOpen(false); }}
            style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', textAlign: 'left' }}
          >
            PDF Report
          </button>
        </div>
      )}
    </div>
  );
};
