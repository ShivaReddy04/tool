import React from 'react';

interface Props {
  open: boolean;
  title?: string;
  children?: React.ReactNode;
  onClose: () => void;
}

export const ApprovalModal: React.FC<Props> = ({ open, title, children, onClose }) => {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', padding: 20, minWidth: 400, borderRadius: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <strong>{title}</strong>
          <button onClick={onClose}>X</button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
};
