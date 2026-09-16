import React from 'react';
import { JitaiAlert } from '../types';

interface JitaiPanelProps {
  isStressed: boolean;
  latestAlert: JitaiAlert | null;
}

export const JitaiPanel: React.FC<JitaiPanelProps> = ({ isStressed, latestAlert }) => {
  return (
    <div className={`clinical-panel jitai-panel ${isStressed ? 'jitai-panel--stressed' : ''}`}>
      <div className="panel-header panel-header--flush">
        <div>
          <span className="panel-title">Smart Reminder System</span>
          <span className="brand-subtitle">
            Adjusts medication reminders based on patient stress levels
          </span>
        </div>
        <span className={`clinical-badge ${isStressed ? 'badge-high-risk' : 'badge-normal'}`}>
          <span className={`dot ${isStressed ? 'red is-live' : 'green'}`} aria-hidden="true" />
          {isStressed ? 'Stress Detected' : 'Normal'}
        </span>
      </div>

      <div className="jitai-badge-row">
        <div className="jitai-state-text">
          Current Patient State:{' '}
          <strong className={isStressed ? 'tone-critical' : 'tone-pure'}>
            {isStressed
              ? 'Elevated Stress — Low Heart Rate Variability'
              : 'Relaxed — Normal Heart Rate'}
          </strong>
        </div>
      </div>

      <div
        className={`jitai-rec-box ${isStressed ? 'accent-critical' : 'accent-healthy'}`}
        aria-live="polite"
      >
        <div className="jitai-rec-title">Recommended Action</div>
        <div className="jitai-rec-content">
          {isStressed ? (
            latestAlert?.msg ||
            'Patient exhibiting sympathetic overdrive. Deferring non-critical adherence protocols to minimize cognitive load.'
          ) : (
            'Autonomic tone nominal. Standard adherence protocols active and scheduled.'
          )}
        </div>
      </div>

    </div>
  );
};
