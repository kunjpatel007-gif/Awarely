import React from 'react';
import { TelemetrySample, JitaiAlert } from '../types';
import { PpgCanvas } from '../components/PpgCanvas';

interface TelemetryPageProps {
  samples: TelemetrySample[];
  hrv: {
    mean_hr_bpm: number;
    sdnn_ms: number;
    rmssd_ms: number;
    is_stressed: boolean;
  };
  latestAlert: JitaiAlert | null;
  eventLog: Array<{ time: string; text: string; isAlert: boolean }>;
  isConnected: boolean;
  onSimulateStress: () => void;
}

export const TelemetryPage: React.FC<TelemetryPageProps> = ({
  samples,
  hrv,
  latestAlert,
  eventLog,
  isConnected,
  onSimulateStress
}) => {
  return (
    <div className="view-panel active-view">
      <div className="page-intro">
        <h1 className="page-headline">Live Vitals Monitor</h1>
        <p className="page-desc">
          Real-time heart rate and pulse waveform from the patient's wearable sensor.
          The system detects stress episodes and adjusts medication reminders accordingly.
        </p>
      </div>

      <div className="telemetry-live-box">
        <div className="telemetry-head">
          <div>
            <span className="panel-title">Pulse Waveform</span>
            <span className="brand-subtitle" style={{ marginTop: '2px' }}>
              Live stream from wearable pulse oximeter
            </span>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span className="mono-dim">
              {isConnected ? `${samples.length} samples received` : 'Waiting for sensor...'}
            </span>
            <button className="btn-outline" onClick={onSimulateStress}>
              Simulate Stress
            </button>
          </div>
        </div>

        <PpgCanvas samples={samples} height={240} showOverlay={false} />

        <div className="telemetry-vital-row" style={{ marginTop: '20px' }}>
          <div className="vital-mini-card">
            <span className="vital-mini-label">Heart Rate</span>
            <div className="vital-mini-val">
              {hrv.mean_hr_bpm > 0 ? (
                <>
                  {hrv.mean_hr_bpm.toFixed(0)}{' '}
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>BPM</span>
                </>
              ) : (
                <span style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>Waiting...</span>
              )}
            </div>
          </div>
          <div className="vital-mini-card">
            <span className="vital-mini-label">Heart Rate Variability</span>
            <div className="vital-mini-val">
              {hrv.sdnn_ms > 0 ? (
                <>
                  {hrv.sdnn_ms.toFixed(1)}{' '}
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>ms</span>
                </>
              ) : (
                <span style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>--</span>
              )}
            </div>
          </div>
          <div className="vital-mini-card">
            <span className="vital-mini-label">Parasympathetic Activity</span>
            <div className="vital-mini-val">
              {hrv.rmssd_ms > 0 ? (
                <>
                  {hrv.rmssd_ms.toFixed(1)}{' '}
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>ms</span>
                </>
              ) : (
                <span style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>--</span>
              )}
            </div>
          </div>
          <div className="vital-mini-card">
            <span className="vital-mini-label">Sensor Status</span>
            <div className="vital-mini-val" style={{ fontSize: '14px', paddingTop: '4px' }}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
          <div className="vital-mini-card">
            <span className="vital-mini-label">Stress Level</span>
            <div
              className="vital-mini-val"
              style={{
                color: hrv.mean_hr_bpm === 0 ? 'var(--text-tertiary)' : hrv.is_stressed ? 'var(--status-critical)' : 'var(--status-healthy)',
                fontSize: '15px',
                paddingTop: '2px'
              }}
            >
              {hrv.mean_hr_bpm === 0 ? 'Waiting...' : hrv.is_stressed ? 'Elevated' : 'Normal'}
            </div>
          </div>
        </div>
      </div>

      {/* Event Timeline */}
      <div className="clinical-panel">
        <div className="panel-header">
          <span className="panel-title">Event Log</span>
        </div>
        <div className="panel-body">
          <div className="timeline-list">
            {eventLog.map((ev, idx) => (
              <div className="timeline-item" key={idx}>
                <span className="time-stamp">{ev.time}</span>
                <span className={`time-event ${ev.isAlert ? 'alert' : ''}`}>{ev.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
