import { useEffect, useRef, useState, useCallback } from 'react';
import { TelemetrySample, JitaiAlert, TelemetrySnapshot, ConnectionState } from '../types';
import { WS_BASE_URL, fetchLatestTelemetry } from '../services/api';
import { HARDWARE_PATIENT_ID } from '../constants';

export interface UseTelemetryReturn {
  samples: TelemetrySample[];
  latestSnapshot: TelemetrySnapshot | null;
  latestAlert: JitaiAlert | null;
  isConnected: boolean;
  isReceivingData: boolean;
  connectionState: ConnectionState;
  hrv: {
    mean_hr_bpm: number;
    sdnn_ms: number;
    rmssd_ms: number;
    is_stressed: boolean;
  };
  eventLog: Array<{ time: string; text: string; isAlert: boolean }>;
}

export function useTelemetry(activePatientId: string): UseTelemetryReturn {
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [latestSnapshot, setLatestSnapshot] = useState<TelemetrySnapshot | null>(null);
  const [latestAlert, setLatestAlert] = useState<JitaiAlert | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isReceivingData, setIsReceivingData] = useState<boolean>(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [eventLog, setEventLog] = useState<Array<{ time: string; text: string; isAlert: boolean }>>([
    { time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }), text: 'Telemetry subscriber initialized', isAlert: false }
  ]);

  const [hrv, setHrv] = useState({
    mean_hr_bpm: 0.0,
    sdnn_ms: 0.0,
    rmssd_ms: 0.0,
    is_stressed: false
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const lastSampleTimeRef = useRef<number>(0);

  const addLog = useCallback((text: string, isAlert = false) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    setEventLog(prev => [{ time, text, isAlert }, ...prev.slice(0, 24)]);
  }, []);

  // Poll fallback / initial fetch
  useEffect(() => {
    fetchLatestTelemetry()
      .then(snapshot => {
        setLatestSnapshot(snapshot);
        if (snapshot.hrv) {
          setHrv({
            mean_hr_bpm: snapshot.hrv.mean_hr_bpm || 0.0,
            sdnn_ms: snapshot.hrv.sdnn_ms || 0.0,
            rmssd_ms: snapshot.hrv.rmssd_ms || 0.0,
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

    // Disconnect old socket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    function connect() {
      if (!activePatientId) return;
      
      const isHardware = activePatientId === HARDWARE_PATIENT_ID;
      const wsUrl = isHardware 
        ? `${WS_BASE_URL.replace(/^http/, 'ws')}/ws/telemetry/subscribe`
        : `${WS_BASE_URL.replace(/^http/, 'ws')}/ws/simulated/${activePatientId}`;
        
      setConnectionState('connecting');

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (unmounted) return;
          setIsConnected(true);
          setConnectionState('live');
          addLog(`Connected to ${isHardware ? 'live biosignal broker' : `simulated telemetry (${activePatientId})`}`);
        };

        ws.onmessage = (event) => {
          if (unmounted) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'SAMPLE') {
              lastSampleTimeRef.current = Date.now();

              const sample: TelemetrySample = msg.data;
              setSamples(prev => {
                const next = [...prev, sample];
                return next.length > 200 ? next.slice(next.length - 200) : next;
              });
            } else if (msg.type === 'SNAPSHOT') {
              const snap: TelemetrySnapshot = msg.telemetry || msg.data;
              if (snap) {
                setLatestSnapshot(snap);
                if (snap.hrv) {
                  setHrv({
                    mean_hr_bpm: snap.hrv.mean_hr_bpm || 0.0,
                    sdnn_ms: snap.hrv.sdnn_ms || 0.0,
                    rmssd_ms: snap.hrv.rmssd_ms || 0.0,
                    is_stressed: snap.hrv.is_stressed || false
                  });
                }
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
              addLog(`JITAI Alert: ${alertData.msg} (HR: ${alertData.mean_hr_bpm} BPM, SDNN: ${alertData.sdnn_ms} ms)`, true);
            } else if (msg.type === 'HRV_UPDATE') {
               const hrvData = msg.data;
               setHrv({
                  mean_hr_bpm: hrvData.mean_hr_bpm || 0.0,
                  sdnn_ms: hrvData.sdnn_ms || 0.0,
                  rmssd_ms: hrvData.rmssd_ms || 0.0,
                  is_stressed: hrvData.is_stressed || false
               });
            }
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
          }
        };

        ws.onclose = () => {
          if (unmounted) return;
          setIsConnected(false);
          setConnectionState('disconnected');
          addLog('Telemetry broker disconnected, retrying in 3s...');
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          if (unmounted) return;
          setIsConnected(false);
          setConnectionState('error');
          ws.close();
        };
      } catch (err) {
        if (!unmounted) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      }
    }

    connect();

    const watchInterval = setInterval(() => {
      if (Date.now() - lastSampleTimeRef.current > 2000) {
        setIsReceivingData(false);
      } else {
        setIsReceivingData(true);
      }
    }, 1000);

    return () => {
      unmounted = true;
      clearInterval(watchInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [addLog, activePatientId]);

  return {
    samples,
    latestSnapshot,
    latestAlert,
    isConnected,
    isReceivingData,
    connectionState,
    hrv,
    eventLog
  };
}
