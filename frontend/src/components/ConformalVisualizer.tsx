import React from 'react';
import { ConfidenceInterval } from '../types';

interface ConformalVisualizerProps {
  pointEstimate: number; // 0.0 - 1.0
  ci90: ConfidenceInterval;
  ci80: ConfidenceInterval;
  requiresReview: boolean;
  reviewReason?: string | null;
}

export const ConformalVisualizer: React.FC<ConformalVisualizerProps> = ({
  pointEstimate,
  ci90,
  ci80,
  requiresReview,
  reviewReason
}) => {
  // Convert 0.0 - 1.0 to percentage strings
  const pointPct = Math.min(100, Math.max(0, pointEstimate * 100));
  const l90Pct = Math.min(100, Math.max(0, ci90.lower * 100));
  const u90Pct = Math.min(100, Math.max(0, ci90.upper * 100));
  const w90Pct = Math.max(0, u90Pct - l90Pct);

  const l80Pct = Math.min(100, Math.max(0, ci80.lower * 100));
  const u80Pct = Math.min(100, Math.max(0, ci80.upper * 100));
  const w80Pct = Math.max(0, u80Pct - l80Pct);

  const dispersionPct = Math.round((ci90.width / 2) * 1000) / 10;

  return (
    <div className="uncertainty-box">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="panel-title">Conformal Quantile Regression (Uncertainty Quantification)</div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Guaranteed coverage intervals derived via MAPIE CQR calibration. Epistemic uncertainty arbitrates human review.
          </p>
        </div>
        <span className="clinical-badge badge-neutral">COVERAGE: 90% CONFORMAL</span>
      </div>

      <div className="conformal-track">
        <div className="track-scale-marks">
          <span>0% (Absolute Non-Adherence)</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100% (Full Adherence)</span>
        </div>

        {/* 80% CI Subtle Band */}
        <div
          className="ci-band-80"
          style={{
            left: `${l80Pct}%`,
            width: `${w80Pct}%`
          }}
          title={`80% CI: [${(ci80.lower * 100).toFixed(1)}% - ${(ci80.upper * 100).toFixed(1)}%]`}
        />

        {/* 90% CI Primary Band */}
        <div
          className="ci-band-90"
          style={{
            left: `${l90Pct}%`,
            width: `${w90Pct}%`
          }}
          title={`90% CI: [${(ci90.lower * 100).toFixed(1)}% - ${(ci90.upper * 100).toFixed(1)}%]`}
        />

        {/* Point Estimate Dot */}
        <div className="ci-point-marker" style={{ left: `${pointPct}%` }}>
          <span className="ci-point-label">
            ● {pointPct.toFixed(1)}% (PDC Est)
          </span>
        </div>
      </div>

      <div className="ci-interval-legend">
        <div className="ci-stats-row">
          <div>
            <span className="mono-dim">Lower Bound: </span>
            <span className="mono-val">{(ci90.lower * 100).toFixed(1)}%</span>
          </div>
          <div>
            <span className="mono-dim">Point Estimate: </span>
            <span className="mono-val">{(pointEstimate * 100).toFixed(1)}%</span>
          </div>
          <div>
            <span className="mono-dim">Upper Bound: </span>
            <span className="mono-val">{(ci90.upper * 100).toFixed(1)}%</span>
          </div>
          <div>
            <span className="mono-dim">Calibrated Dispersion: </span>
            <span className="mono-val">±{dispersionPct.toFixed(1)}%</span>
          </div>
        </div>
        <div className="mono-dim" style={{ fontSize: '10px' }}>
          Threshold for Human Review: &gt; 40% Interval Width or Out-of-Bounds
        </div>
      </div>

      {requiresReview ? (
        <div className="safety-alert-strip alert-review">
          <span className="dot amber" style={{ marginTop: '3px' }} />
          <div>
            <strong>DEFERRED TO CLINICAL HUMAN REVIEW QUEUE</strong>
            <div style={{ fontSize: '11.5px', opacity: 0.9, marginTop: '2px' }}>
              {reviewReason || `Prediction interval width is ${(ci90.width * 100).toFixed(1)}% (> 40% clinical safety limit). Manual review required.`}
            </div>
          </div>
        </div>
      ) : (
        <div className="safety-alert-strip alert-safe">
          <span className="dot green" style={{ marginTop: '3px' }} />
          <div>
            <strong>MODEL CONFIDENCE WITHIN NOMINAL CLINICAL BOUNDS</strong>
            <div style={{ fontSize: '11.5px', opacity: 0.9, marginTop: '2px' }}>
              Prediction interval width is {(ci90.width * 100).toFixed(1)}% (≤ 40% threshold). Automated gentle reminders authorized.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
