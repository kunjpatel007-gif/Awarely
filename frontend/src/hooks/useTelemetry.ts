import { useEffect, useRef, useState, useCallback } from 'react';
import { TelemetrySample, JitaiAlert, TelemetrySnapshot } from '../types';
import { WS_BASE_URL, fetchLatestTelemetry } from '../services/api';

export interface UseTelemetryReturn {
  samples: TelemetrySample[];
  latestSnapshot: TelemetrySnapshot | null;
  latestAlert: JitaiAlert | null;
  isConnected: boolean;
  hrv: {
    mean_hr_bpm: number;
    sdnn_ms: number;
    rmssd_ms: number;
    is_stressed: boolean;
  };
  eventLog: Array<{ time: string; text: string; isAlert: boolean }>;
  triggerSimulatedStress: () => void;
}

export function useTelemetry(): UseTelemetryReturn {
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [latestSnapshot, setLatestSnapshot] = useState<TelemetrySnapshot | null>(null);
  const [latestAlert, setLatestAlert] = useState<JitaiAlert | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [eventLog, setEventLog] = useState<Array<{ time: string; text: string; isAlert: boolean }>>([
    { time: new Date().toISOString().substring(11, 19), text: 'Telemetry subscriber initialized', isAlert: false }
  ]);

  const [hrv, setHrv] = useState({
    mean_hr_bpm: 72,
    sdnn_ms: 31.5,
    rmssd_ms: 26.2,
    is_stressed: false
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  const addLog = useCallback((text: string, isAlert = false) => {
    const time = new Date().toISOString().substring(11, 19);
    setEventLog(prev => [{ time, text, isAlert }, ...prev.slice(0, 24)]);
  }, []);

  // Poll fallback / initial fetch
  useEffect(() => {
    fetchLatestTelemetry()
      .then(snapshot => {
        setLatestSnapshot(snapshot);
        if (snapshot.hrv) {
          setHrv({
            mean_hr_bpm: snapshot.hrv.mean_hr_bpm || 72,
            sdnn_ms: snapshot.hrv.sdnn_ms || 31.5,
            rmssd_ms: snapshot.hrv.rmssd_ms || 26.2,
            is_stressed: snapshot.hrv.is_stressed || false
          });
        }
      })
      .catch(err => {
        console.warn('Initial telemetry snapshot failed:', err);
      });
  }, []);

  useEffect(() => {
    let unmounted = false;

    function connect() {
      const wsUrl = `${WS_BASE_URL.replace(/^http/, 'ws')}/ws/telemetry/subscribe`;
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (unmounted) return;
          setIsConnected(true);
          addLog('Connected to live biosignal broker (ws/telemetry/subscribe)');
        };

        ws.onmessage = (event) => {
          if (unmounted) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'SAMPLE') {
              const sample: TelemetrySample = msg.data;
              setSamples(prev => {
                const next = [...prev, sample];
                return next.length > 200 ? next.slice(next.length - 200) : next;
              });
            } else if (msg.type === 'SNAPSHOT') {
              const snap: TelemetrySnapshot = msg.telemetry;
              setLatestSnapshot(snap);
              if (snap.hrv) {
                setHrv({
                  mean_hr_bpm: snap.hrv.mean_hr_bpm || 72,
                  sdnn_ms: snap.hrv.sdnn_ms || 31.5,
                  rmssd_ms: snap.hrv.rmssd_ms || 26.2,
                  is_stressed: snap.hrv.is_stressed || false
                });
              }
            } else if (msg.type === 'JITAI_ALERT') {
              const alertData: JitaiAlert = msg.data;
              setLatestAlert(alertData);
              setHrv(prev => ({
                ...prev,
                mean_hr_bpm: alertData.mean_hr_bpm,
                sdnn_ms: alertData.sdnn_ms,
                is_stressed: true
              }));
              addLog(`🚨 JITAI Alert: ${alertData.msg} (HR: ${alertData.mean_hr_bpm} BPM, SDNN: ${alertData.sdnn_ms} ms)`, true);
            }
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
          }
        };

        ws.onclose = () => {
          if (unmounted) return;
          setIsConnected(false);
          addLog('Telemetry broker disconnected, retrying in 3s...');
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          if (unmounted) return;
          setIsConnected(false);
          ws.close();
        };
      } catch (err) {
        if (!unmounted) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      }
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [addLog]);

  const triggerSimulatedStress = useCallback(() => {
    // Demonstration toggle
    const simulatedAlert: JitaiAlert = {
      alert: 'JITAI_TRIGGERED',
      msg: 'Acute sympathetic surge detected. Softening reminder delivery.',
      sdnn_ms: 16.4,
      mean_hr_bpm: 108
    };
    setLatestAlert(simulatedAlert);
    setHrv({
      mean_hr_bpm: 108,
      sdnn_ms: 16.4,
      rmssd_ms: 14.1,
      is_stressed: true
    });
    addLog('🚨 Simulated Stress Episode: JITAI intervention triggered (HR: 108 BPM, SDNN: 16.4 ms)', true);
  }, [addLog]);

  return {
    samples,
    latestSnapshot,
    latestAlert,
    isConnected,
    hrv,
    eventLog,
    triggerSimulatedStress
  };
}
