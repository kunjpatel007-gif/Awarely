import React, { useEffect, useRef } from 'react';
import { TelemetrySample } from '../types';

interface PpgCanvasProps {
  samples: TelemetrySample[];
  height?: number;
  showOverlay?: boolean;
}

export const PpgCanvas: React.FC<PpgCanvasProps> = ({ samples, height = 140, showOverlay = true }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.parentElement?.clientWidth || 1200;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Dark background
    ctx.fillStyle = '#090909';
    ctx.fillRect(0, 0, width, height);

    // Subtle grid lines
    ctx.strokeStyle = '#181818';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Determine points to draw
    const points: number[] = samples.map(s => s.ppg);

    if (points.length < 2) {
      // Draw flat baseline and standby notice
      ctx.beginPath();
      ctx.strokeStyle = '#222222';
      ctx.lineWidth = 1;
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      ctx.fillStyle = '#636363';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('STANDBY — Acquiring 50Hz Telemetry Stream', width / 2, height / 2 - 10);
      return;
    }

    // Draw PPG Waveform in a sweeping clinical ECG style
    ctx.beginPath();
    ctx.strokeStyle = '#39d98a';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const WINDOW_MS = 4000; // 4 seconds sweep
    let lastX = -1;
    let currentX = 0;

    samples.forEach((sample, idx) => {
      const clamped = Math.max(0, Math.min(1.2, sample.ppg));
      const y = height - (clamped * (height - 30) + 15);
      const x = ((sample.timestamp % WINDOW_MS) / WINDOW_MS) * width;

      if (idx === samples.length - 1) {
        currentX = x;
      }

      if (lastX === -1 || x < lastX) {
        // Wrapped around or first point, move without drawing
        ctx.moveTo(x, y);
      } else {
        // Within the same sweep, draw line
        ctx.lineTo(x, y);
      }
      lastX = x;
    });

    ctx.stroke();

    // Draw the blanking bar (erases a chunk ahead of the sweep)
    ctx.fillStyle = '#090909';
    ctx.fillRect(currentX, 0, width * 0.05, height);

    // Draw the glowing vertical sweep cursor
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(57, 217, 138, 0.8)';
    ctx.lineWidth = 2;
    ctx.moveTo(currentX, 0);
    ctx.lineTo(currentX, height);
    ctx.stroke();

    // Add a glowing halo to the cursor
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(57, 217, 138, 0.2)';
    ctx.lineWidth = 6;
    ctx.moveTo(currentX, 0);
    ctx.lineTo(currentX, height);
    ctx.stroke();
  }, [samples, height]);

  return (
    <div className="waveform-container" style={{ height: `${height}px` }}>
      <canvas ref={canvasRef} className="waveform-canvas" />
      {showOverlay && (
        <div className="waveform-overlay">
          <span>SAMPLING: 50 SPS</span>
          <span>FILTER: CHEBYSHEV II</span>
          <span>BANDPASS: 0.5 - 5.0 Hz</span>
        </div>
      )}
    </div>
  );
};
