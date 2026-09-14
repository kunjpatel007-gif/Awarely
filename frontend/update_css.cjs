const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'src', 'styles', 'stitch.css');
let css = fs.readFileSync(cssPath, 'utf8');

// Replace Root variables
css = css.replace(/:root \{[\s\S]*?\}/, `:root {
  --bg-base: #F8FAFC;
  --bg-surface: #FFFFFF;
  --bg-subtle: #F1F5F9;
  --bg-elevated: #FFFFFF;
  --border-subtle: #E2E8F0;
  --border-strong: #CBD5E1;
  --border-accent: #94A3B8;
  
  --text-pure: #0F172A;
  --text-primary: #1E293B;
  --text-secondary: #475569;
  --text-tertiary: #64748B;
  --text-dim: #94A3B8;

  /* Clinical Status Indicators */
  --status-healthy: #10B981;
  --status-healthy-glow: rgba(16, 185, 129, 0.25);
  --status-healthy-dim: rgba(16, 185, 129, 0.12);
  
  --status-warn: #F59E0B;
  --status-warn-glow: rgba(245, 158, 11, 0.25);
  --status-warn-dim: rgba(245, 158, 11, 0.12);
  
  --status-critical: #EF4444;
  --status-critical-glow: rgba(239, 68, 68, 0.28);
  --status-critical-dim: rgba(239, 68, 68, 0.12);

  --status-info: #0284C7;
  --status-info-dim: rgba(2, 132, 199, 0.12);

  --font-sans: 'Inter', 'Roboto', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}`);

// Hardcoded dark colors replacement
css = css.replace(/background: #0d0d0d;/g, 'background: var(--bg-surface);');
css = css.replace(/background: #1c1c1c;/g, 'background: var(--bg-subtle);');
css = css.replace(/background: rgba\(10, 10, 10, 0\.85\);/g, 'background: rgba(255, 255, 255, 0.85);');
css = css.replace(/background: rgba\(255,255,255,0\.01\);/g, 'background: rgba(0,0,0,0.01);');
css = css.replace(/background: #0f0f0f;/g, 'background: var(--bg-subtle);');
css = css.replace(/background: #151515;/g, 'background: var(--bg-elevated);');
css = css.replace(/background: #181818;/g, 'background: var(--bg-subtle);');
css = css.replace(/background: #1f1f1f;/g, 'background: var(--bg-surface);');
css = css.replace(/background: #2a2a2a;/g, 'background: var(--bg-elevated);');
css = css.replace(/background: rgba\(255,255,255,0\.04\);/g, 'background: rgba(0,0,0,0.04);');
css = css.replace(/background: rgba\(255,255,255,0\.06\);/g, 'background: rgba(0,0,0,0.06);');
css = css.replace(/background: #161616;/g, 'background: var(--bg-subtle);');
css = css.replace(/background: #090909;/g, 'background: var(--bg-surface);');
css = css.replace(/background: rgba\(10, 10, 10, 0\.7\);/g, 'background: rgba(255, 255, 255, 0.7);');
css = css.replace(/background: #0c0c0c;/g, 'background: var(--bg-subtle);');
css = css.replace(/background: #141414;/g, 'background: var(--bg-subtle);');
css = css.replace(/background: #0b0b0b;/g, 'background: var(--bg-subtle);');
css = css.replace(/border: 1px dashed #3a3a3a;/g, 'border: 1px dashed var(--border-strong);');
css = css.replace(/box-shadow: 0 0 10px rgba\(255,255,255,0\.4\);/g, 'box-shadow: 0 0 10px rgba(0,0,0,0.1);');
css = css.replace(/border: 1px solid #1a1a1a;/g, 'border: 1px solid var(--border-subtle);');
css = css.replace(/color: #a8ecd0;/g, 'color: var(--status-healthy);');
css = css.replace(/color: #f7d896;/g, 'color: var(--status-warn);');
css = css.replace(/color: #f5a4a4;/g, 'color: var(--status-critical);');

// Typography replacement
// Replace font-family: var(--font-mono) with sans for normal text where appropriate, 
// wait, instructions say: "Replace 'JetBrains Mono' usage (except for actual data numbers where monospace makes sense) with a clean sans-serif like 'Inter', 'Roboto', or just standard system-ui."
// I can just replace var(--font-mono) with var(--font-sans) in normal titles and texts, but keep it in stats.
// Let's replace var(--font-mono) with var(--font-sans) across specific classes.
css = css.replace(/\.brand-subtitle \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.nav-badge \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.sys-status-label \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.patient-context-pill \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.topbar-right \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.meta-label \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.clinical-badge \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.btn-action \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.track-scale-marks \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.ci-point-label \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.ci-stats-row \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.shap-val \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.shap-impact-text \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.vital-mini-label \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.waveform-overlay \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.jitai-rec-title \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.pipe-node-desc \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.pipe-arrow \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.api-contract-box \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));
css = css.replace(/\.time-stamp \{[\s\S]*?\}/, match => match.replace('var(--font-mono)', 'var(--font-sans)'));


// Add hover effects to .clinical-panel and .diagnostic-card
// We will replace .clinical-panel and .diagnostic-card blocks
if(!css.includes('.clinical-panel:hover')) {
  css += `
.clinical-panel {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.clinical-panel:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05);
}
.diagnostic-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.diagnostic-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05);
}
.stat-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05);
}
.jitai-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.jitai-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05);
}
`;
}

fs.writeFileSync(cssPath, css);
console.log('CSS updated');
