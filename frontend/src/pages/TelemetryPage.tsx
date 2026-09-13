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
        <h1 className="page-headline">Dedicated Biosignal Telemetry Stream</h1>
        <p className="page-desc">
          Direct streaming visualization of raw photoplethysmogram waveforms from edge IoT sensors
          (ESP32 microcontrollers with MAX30102 pulse oximetry modules). Closed-loop JITAI engine detects
          autonomic stress events and broadcasts interventions.
        </p>
      </div>

      <div className="telemetry-live-box">
        <div className="telemetry-head">
          <div>
            <span className="panel-title">Expanded Photoplethysmogram Analysis (50 Hz)</span>
            <span className="brand-subtitle" style={{ marginTop: '2px' }}>
              Systolic Peak &amp; Dicrotic Notch Biosignal Stream
            </span>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span className="mono-dim">
              PACKETS BUFFERED: {samples.length} | BROKER: {isConnected ? 'ONLINE' : 'DISCONNECTED'}
            </span>
            <button className="btn-outline" onClick={onSimulateStress}>
              Trigger Stress Episode
            </button>
          </div>
        </div>

        <PpgCanvas samples={samples} height={240} showOverlay={false} />

        <div className="telemetry-vital-row" style={{ marginTop: '20px' }}>
          <div className="vital-mini-card">
            <span className="vital-mini-label">Heart Rate (PR)</span>
            <div className="vital-mini-val">
              {hrv.mean_hr_bpm > 0 ? (
                <>
                  {hrv.mean_hr_bpm.toFixed(0)}{' '}
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>BPM</span>
                </>
              ) : (
                <span style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>STANDBY</span>
              )}
            </div>
          </div>
          <div className="vital-mini-card">
            <span className="vital-mini-label">SDNN (HRV)</span>
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
            <span className="vital-mini-label">RMSSD</span>
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
            <span className="vital-mini-label">Sampling Rate</span>
            <div className="vital-mini-val">
              {isConnected ? '50.0' : '0.0'} <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Hz</span>
            </div>
          </div>
          <div className="vital-mini-card">
            <span className="vital-mini-label">Autonomic Detector</span>
            <div
              className="vital-mini-val"
              style={{
                color: hrv.mean_hr_bpm === 0 ? 'var(--text-tertiary)' : hrv.is_stressed ? 'var(--status-critical)' : 'var(--status-healthy)',
                fontSize: '15px',
                paddingTop: '2px'
              }}
            >
              {hrv.mean_hr_bpm === 0 ? 'STANDBY' : hrv.is_stressed ? 'ACUTE STRESS' : 'HOMEOSTASIS'}
            </div>
          </div>
        </div>
      </div>

      {/* Telemetry Audit Timeline */}
      <div className="clinical-panel">
        <div className="panel-header">
          <span className="panel-title">Real-Time Biosignal Event Stream Log</span>
          <span className="mono-dim">Live audit log from WebSocket broker</span>
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
