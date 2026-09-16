import React from 'react';
import { ConfidenceInterval } from '../types';

interface ConformalVisualizerProps {
  pointEstimate: number;
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
  const pointPct = Math.min(100, Math.max(0, pointEstimate * 100));
  const l90Pct = Math.min(100, Math.max(0, ci90.lower * 100));
  const u90Pct = Math.min(100, Math.max(0, ci90.upper * 100));
  const w90Pct = Math.max(0, u90Pct - l90Pct);

  const l80Pct = Math.min(100, Math.max(0, ci80.lower * 100));
  const u80Pct = Math.min(100, Math.max(0, ci80.upper * 100));
  const w80Pct = Math.max(0, u80Pct - l80Pct);

  return (
    <div className="uncertainty-box">
      <div className="uncertainty-head">
        <div>
          <div className="panel-title">Prediction Confidence Range</div>
          <p className="uncertainty-desc">
            Shows how confident our model is about this patient's adherence score.
            Wider ranges mean less certainty.
          </p>
        </div>
        <span className="clinical-badge badge-neutral">90% Confidence</span>
      </div>

      <div
        className="conformal-track"
        role="img"
        aria-label={`Adherence estimate ${(pointEstimate * 100).toFixed(1)}%. 90% range ${(ci90.lower * 100).toFixed(1)}% to ${(ci90.upper * 100).toFixed(1)}%. 80% range ${(ci80.lower * 100).toFixed(1)}% to ${(ci80.upper * 100).toFixed(1)}%.`}
      >
        <div className="track-scale-marks" aria-hidden="true">
          <span>0% (Non-Adherent)</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100% (Fully Adherent)</span>
        </div>

        <div
          className="ci-band-80"
          style={{
            '--ci-left': `${l80Pct}%`,
            '--ci-width': `${w80Pct}%`
          } as React.CSSProperties}
          title={`80% CI: [${(ci80.lower * 100).toFixed(1)}% - ${(ci80.upper * 100).toFixed(1)}%]`}
        />

        <div
          className="ci-band-90"
          style={{
            '--ci-left': `${l90Pct}%`,
            '--ci-width': `${w90Pct}%`
          } as React.CSSProperties}
          title={`90% CI: [${(ci90.lower * 100).toFixed(1)}% - ${(ci90.upper * 100).toFixed(1)}%]`}
        />

        <div
          className="ci-point-marker"
          style={{ '--ci-point': `${pointPct}%` } as React.CSSProperties}
        >
          <span className="ci-point-label">
            ● {pointPct.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="ci-interval-legend">
        <div className="ci-stats-row">
          <div className="ci-stat-chip">
            <span className="mono-dim">Lower: </span>
            <span className="mono-val">{(ci90.lower * 100).toFixed(1)}%</span>
          </div>
          <div className="ci-stat-chip">
            <span className="mono-dim">Estimate: </span>
            <span className="mono-val">{(pointEstimate * 100).toFixed(1)}%</span>
          </div>
          <div className="ci-stat-chip">
            <span className="mono-dim">Upper: </span>
            <span className="mono-val">{(ci90.upper * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {requiresReview ? (
        <div className="safety-alert-strip alert-review">
          <span className="dot amber" aria-hidden="true" />
          <div>
            <strong>Clinician Review Recommended</strong>
            <div className="safety-alert-detail">
              {reviewReason || `The prediction range is wide (${(ci90.width * 100).toFixed(1)}%), indicating the model is uncertain. Please review this patient manually.`}
            </div>
          </div>
        </div>
      ) : (
        <div className="safety-alert-strip alert-safe">
          <span className="dot green" aria-hidden="true" />
          <div>
            <strong>Prediction Confidence: Good</strong>
            <div className="safety-alert-detail">
              The prediction range is narrow ({(ci90.width * 100).toFixed(1)}%), indicating high model confidence.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
