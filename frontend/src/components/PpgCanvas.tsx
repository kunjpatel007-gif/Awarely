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
      ctx.fillText('STANDBY — Awaiting 50Hz ESP32 Hardware Telemetry Stream', width / 2, height / 2 - 10);
      return;
    }

    // Draw PPG Waveform
    ctx.beginPath();
    ctx.strokeStyle = '#39d98a';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const step = width / (points.length - 1);

    points.forEach((val, idx) => {
      // Normalize to canvas height with margins
      // Expected ppg is roughly 0.0 - 1.0
      const clamped = Math.max(0, Math.min(1.2, val));
      const y = height - (clamped * (height - 30) + 15);
      const x = idx * step;

      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Subtle gradient glow below wave
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(57, 217, 138, 0.15)');
    gradient.addColorStop(1, 'rgba(57, 217, 138, 0.0)');
    ctx.fillStyle = gradient;
    ctx.fill();

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
