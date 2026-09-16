import React from 'react';

export const SystemModelsPage: React.FC = () => {
  return (
    <div className="view-panel active-view view-stagger">
      <div className="page-intro">
        <h1 className="page-headline">How It Works</h1>
        <p className="page-desc">
          Our system uses two complementary approaches to help clinicians identify patients
          who may be struggling with medication adherence — without ever assuming non-compliance.
        </p>
      </div>

      <div className="pipeline-page">
        <div className="pipeline-view-container">
          {/* Stream 1 */}
          <div className="pipeline-flow-card">
            <span className="section-label tone-info">
              REAL-TIME MONITORING
            </span>
            <div className="pipeline-steps">
              <div className="pipe-node">
                <div className="pipe-node-title">Wearable Sensor</div>
                <div className="pipe-node-desc">Pulse oximeter on patient's finger</div>
              </div>
              <div className="pipe-arrow" aria-hidden="true" />
              <div className="pipe-node">
                <div className="pipe-node-title">Pulse Analysis</div>
                <div className="pipe-node-desc">Heart rate and variability</div>
              </div>
              <div className="pipe-arrow" aria-hidden="true" />
              <div className="pipe-node">
                <div className="pipe-node-title">Stress Detection</div>
                <div className="pipe-node-desc">Identifies elevated stress</div>
              </div>
              <div className="pipe-arrow" aria-hidden="true" />
              <div className="pipe-node pipe-node--terminal accent-info">
                <div className="pipe-node-title">Smart Reminders</div>
                <div className="pipe-node-desc">Adjusts timing based on stress</div>
              </div>
            </div>
          </div>

          {/* Stream 2 */}
          <div className="pipeline-flow-card">
            <span className="section-label tone-healthy">
              HEALTH RECORDS ANALYSIS
            </span>
            <div className="pipeline-steps">
              <div className="pipe-node">
                <div className="pipe-node-title">Health Records</div>
                <div className="pipe-node-desc">Pharmacy refills & appointments</div>
              </div>
              <div className="pipe-arrow" aria-hidden="true" />
              <div className="pipe-node">
                <div className="pipe-node-title">Pattern Detection</div>
                <div className="pipe-node-desc">Indirect behavioral signals</div>
              </div>
              <div className="pipe-arrow" aria-hidden="true" />
              <div className="pipe-node">
                <div className="pipe-node-title">Adherence Prediction</div>
                <div className="pipe-node-desc">Estimates medication compliance</div>
              </div>
              <div className="pipe-arrow" aria-hidden="true" />
              <div className="pipe-node">
                <div className="pipe-node-title">Confidence Check</div>
                <div className="pipe-node-desc">Flags uncertain predictions</div>
              </div>
              <div className="pipe-arrow" aria-hidden="true" />
              <div className="pipe-node">
                <div className="pipe-node-title">Explanation</div>
                <div className="pipe-node-desc">Shows why the prediction was made</div>
              </div>
              <div className="pipe-arrow" aria-hidden="true" />
              <div className="pipe-node pipe-node--terminal accent-warn">
                <div className="pipe-node-title">Clinician Review</div>
                <div className="pipe-node-desc">Human judgement for uncertain cases</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
