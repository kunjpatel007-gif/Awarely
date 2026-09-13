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
          <span className="panel-title">Just-In-Time Adaptive Intervention (JITAI)</span>
          <span className="brand-subtitle" style={{ marginTop: '2px' }}>
            Autonomic Stress Modulated Reminder System
          </span>
        </div>
        <span className={`clinical-badge ${isStressed ? 'badge-high-risk' : 'badge-normal'}`}>
          <span className={`dot ${isStressed ? 'red' : 'green'}`} />
          {isStressed ? 'STRESS TRIGGERED' : 'MONITORING'}
        </span>
      </div>

      <div className="jitai-badge-row">
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          Active Physiological State:{' '}
          <strong style={{ color: isStressed ? 'var(--status-critical)' : 'var(--text-pure)' }}>
            {isStressed
              ? 'Acute Sympathetic Hyperarousal / Low HRV'
              : 'Eustress / Normal Autonomic Baseline'}
          </strong>
        </div>
      </div>

      <div className="jitai-rec-box">
        <div className="jitai-rec-title">Recommended System Action</div>
        <div className="jitai-rec-content">
          {isStressed ? (
            latestAlert?.msg ||
            'High stress detected. Softening reminders to prevent burnout and cognitive fatigue. Delaying non-critical escalation.'
          ) : (
            'Standard gentle SMS and in-app medication notification scheduled for 08:00 AM. No cognitive friction detected.'
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
        Clinical Rule: JITAI modulates reminder aggression and delivery timing based on HRV stress
        triggers to prevent notification fatigue and burnout. It does <em>not</em> modify drug pharmacological dosages.
      </div>
    </div>
  );
};
