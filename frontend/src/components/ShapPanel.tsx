import React from 'react';

interface ShapPanelProps {
  explanation: Record<string, string>;
}

export const ShapPanel: React.FC<ShapPanelProps> = ({ explanation }) => {
  const entries = Object.entries(explanation);

  return (
    <div className="shap-panel">
      <div className="panel-header panel-header--flush">
        <div>
          <span className="panel-title">Why This Prediction?</span>
          <span className="brand-subtitle">
            Key factors that influenced this patient's adherence score
          </span>
        </div>
      </div>

      <div className="shap-list">
        {entries.length === 0 ? (
          <div className="mono-dim shap-empty">No significant contributing factors identified.</div>
        ) : (
          entries.map(([feature, valStr], index) => {
            const numVal = parseFloat(valStr.replace('+', ''));
            const isPos = numVal > 0;
            const barWidth = Math.min(100, Math.max(10, Math.abs(numVal) * 200));

            return (
              <div className={`shap-item ${index > 3 ? 'shap-item--minor' : ''}`} key={feature}>
                <span className="shap-name">{feature.replace(/_/g, ' ')}</span>
                <span className="shap-val">{valStr}</span>
                <div className="shap-bar-container" aria-hidden="true">
                  <div
                    className={`shap-bar-fill ${isPos ? 'pos' : 'neg'}`}
                    style={{ '--bar-width': `${barWidth / 2}%` } as React.CSSProperties}
                  />
                </div>
                <span className={`shap-impact-text ${isPos ? 'impact-pos' : 'impact-neg'}`}>
                  {isPos ? '↑ Increases Risk' : '↓ Lowers Risk'}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
