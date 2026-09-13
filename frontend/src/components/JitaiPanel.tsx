import React from 'react';
import { JitaiAlert } from '../types';

interface JitaiPanelProps {
  isStressed: boolean;
  latestAlert: JitaiAlert | null;
}

export const JitaiPanel: React.FC<JitaiPanelProps> = ({ isStressed, latestAlert }) => {
  return (
    <div className="clinical-panel" style={{ padding: '20px' }}>
      <div className="panel-header" style={{ padding: '0 0 14px 0', background: 'transparent' }}>
        <div>
          <span className="panel-title">Smart Reminder System</span>
          <span className="brand-subtitle" style={{ marginTop: '2px' }}>
            Adjusts medication reminders based on patient stress levels
          </span>
        </div>
        <span className={`clinical-badge ${isStressed ? 'badge-high-risk' : 'badge-normal'}`}>
          <span className={`dot ${isStressed ? 'red' : 'green'}`} />
          {isStressed ? 'Stress Detected' : 'Normal'}
        </span>
      </div>

      <div className="jitai-badge-row">
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          Current Patient State:{' '}
          <strong style={{ color: isStressed ? 'var(--status-critical)' : 'var(--text-pure)' }}>
            {isStressed
              ? 'Elevated Stress — Low Heart Rate Variability'
              : 'Relaxed — Normal Heart Rate'}
          </strong>
        </div>
      </div>

      <div className="jitai-rec-box">
        <div className="jitai-rec-title">Recommended Action</div>
        <div className="jitai-rec-content">
          {isStressed ? (
            latestAlert?.msg ||
            'Patient is stressed. Softening reminders to avoid adding pressure. Non-urgent notifications delayed.'
          ) : (
            'Patient is calm. Standard gentle medication reminder scheduled for 08:00 AM.'
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: '14px',
          fontSize: '11px',
          color: 'var(--text-tertiary)',
          lineHeight: '1.5',
          borderLeft: '2px solid var(--border-strong)',
          paddingLeft: '10px'
        }}
      >
        Note: This system only adjusts the timing and tone of reminders.
        It does <em>not</em> modify medication dosages.
      </div>
    </div>
  );
};
