import { useCallback, useEffect, useRef } from 'react';
import { BehavioralTelemetryVector } from '../types/veloztix';
import { generateDeviceFingerprint } from '../utils/privacyCrypto';

function createSessionId(): string {
  const rand = Math.random().toString(36).substring(2, 10);
  return `ses_${Date.now().toString(36)}_${rand}`;
}

export interface UseBehavioralTelemetryReturn {
  recordFieldFocus: () => void;
  recordFieldKeyDown: (key: string) => void;
  recordFieldPaste: () => void;
  captureSnapshot: () => BehavioralTelemetryVector;
  resetSessionTelemetry: () => void;
}

/**
 * Hook de telemetría conductual ejecutándose silenciosamente en segundo plano.
 * Instrumenta dwell_time, scroll_depth, keystroke_dynamics, tab_switch y puntero
 * sin mostrar elementos técnicos en la interfaz del comprador.
 */
export function useBehavioralTelemetry(): UseBehavioralTelemetryReturn {
  const sessionIdRef = useRef<string>(createSessionId());
  const deviceFingerprintRef = useRef<string>('dfp_pending');

  const dwellTimeMsRef = useRef<number>(0);
  const scrollDepthPctRef = useRef<number>(0);
  const firstCheckoutFocusRef = useRef<number | null>(null);
  const lastKeyTimestampRef = useRef<number | null>(null);
  const interKeyIntervalsRef = useRef<number[]>([]);
  const copyPasteFlagRef = useRef<boolean>(false);
  const pasteEventsCountRef = useRef<number>(0);
  const keystrokesCountRef = useRef<number>(0);
  const backspaceCorrectionsRef = useRef<number>(0);
  const tabSwitchCountRef = useRef<number>(0);
  const pointerEventsCountRef = useRef<number>(0);
  const interactionSpeedRef = useRef<number>(0);

  const lastActiveTickRef = useRef<number>(performance.now());
  const lastTabSwitchTimeRef = useRef<number>(0);
  const lastPointerSampleRef = useRef<{ x: number; y: number; t: number } | null>(
    null
  );

  useEffect(() => {
    generateDeviceFingerprint().then((fp) => {
      deviceFingerprintRef.current = fp;
    });
  }, []);

  // 1. Dwell time en segundo plano
  useEffect(() => {
    lastActiveTickRef.current = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = Math.round(now - lastActiveTickRef.current);
      lastActiveTickRef.current = now;
      if (document.visibilityState === 'visible') {
        dwellTimeMsRef.current += Math.min(delta, 300);
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, []);

  // 2. Scroll depth máximo (0% - 100%)
  useEffect(() => {
    const updateScroll = () => {
      const scrollTop =
        window.scrollY || document.documentElement.scrollTop || 0;
      const viewportHeight =
        window.innerHeight || document.documentElement.clientHeight || 1;
      const docHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        1
      );

      if (docHeight <= viewportHeight + 24) {
        scrollDepthPctRef.current = Math.max(scrollDepthPctRef.current, 70);
        return;
      }

      const pct = Math.min(
        100,
        Math.max(0, Math.round((scrollTop / (docHeight - viewportHeight)) * 100))
      );
      scrollDepthPctRef.current = Math.max(scrollDepthPctRef.current, pct);
    };

    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('wheel', updateScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', updateScroll);
      window.removeEventListener('wheel', updateScroll);
    };
  }, []);

  // 3. Cambios de pestaña / foco
  useEffect(() => {
    const registerSwitch = () => {
      const now = Date.now();
      if (now - lastTabSwitchTimeRef.current > 650) {
        lastTabSwitchTimeRef.current = now;
        tabSwitchCountRef.current += 1;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') registerSwitch();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', registerSwitch);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', registerSwitch);
    };
  }, []);

  // 4. Interacción de puntero / touch
  useEffect(() => {
    let lastMove = 0;
    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastMove < 80) return;
      lastMove = now;
      pointerEventsCountRef.current += 1;

      if (lastPointerSampleRef.current) {
        const dx = e.clientX - lastPointerSampleRef.current.x;
        const dy = e.clientY - lastPointerSampleRef.current.y;
        const dtSec = Math.max(0.02, (now - lastPointerSampleRef.current.t) / 1000);
        const speed = Math.round(Math.hypot(dx, dy) / dtSec);
        if (speed > 0 && speed < 6000) {
          interactionSpeedRef.current =
            interactionSpeedRef.current === 0
              ? speed
              : Math.round(interactionSpeedRef.current * 0.7 + speed * 0.3);
        }
      }
      lastPointerSampleRef.current = { x: e.clientX, y: e.clientY, t: now };
    };

    const onPointerDown = () => {
      pointerEventsCountRef.current += 1;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  const recordFieldFocus = useCallback(() => {
    if (firstCheckoutFocusRef.current === null) {
      firstCheckoutFocusRef.current = performance.now();
    }
  }, []);

  const recordFieldKeyDown = useCallback((key: string) => {
    const now = performance.now();
    if (firstCheckoutFocusRef.current === null) {
      firstCheckoutFocusRef.current = now;
    }

    if (key === 'Backspace' || key === 'Delete') {
      backspaceCorrectionsRef.current += 1;
    }

    if (key.length === 1 || key === 'Backspace') {
      keystrokesCountRef.current += 1;
      if (lastKeyTimestampRef.current !== null) {
        const diff = now - lastKeyTimestampRef.current;
        if (diff > 1 && diff < 3500) {
          interKeyIntervalsRef.current.push(diff);
        }
      }
      lastKeyTimestampRef.current = now;
    }
  }, []);

  const recordFieldPaste = useCallback(() => {
    if (firstCheckoutFocusRef.current === null) {
      firstCheckoutFocusRef.current = performance.now();
    }
    copyPasteFlagRef.current = true;
    pasteEventsCountRef.current += 1;
  }, []);

  const captureSnapshot = useCallback((): BehavioralTelemetryVector => {
    const intervals = interKeyIntervalsRef.current;
    const avgInterKey =
      intervals.length > 0
        ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
        : 0;

    const checkoutFillTime =
      firstCheckoutFocusRef.current !== null
        ? Math.max(1, Math.round(performance.now() - firstCheckoutFocusRef.current))
        : 0;

    return {
      session_id: sessionIdRef.current,
      dwell_time_ms: dwellTimeMsRef.current,
      scroll_depth_pct: scrollDepthPctRef.current,
      keystroke_dynamics: {
        avg_inter_key_ms: avgInterKey,
        checkout_fill_time_ms: checkoutFillTime,
        copy_paste_flag: copyPasteFlagRef.current,
        paste_events_count: pasteEventsCountRef.current,
        keystrokes_count: keystrokesCountRef.current,
        backspace_corrections: backspaceCorrectionsRef.current,
      },
      tab_switch_count: tabSwitchCountRef.current,
      pointer_events_count: pointerEventsCountRef.current,
      interaction_speed: interactionSpeedRef.current,
      device_fingerprint: deviceFingerprintRef.current,
    };
  }, []);

  const resetSessionTelemetry = useCallback(() => {
    sessionIdRef.current = createSessionId();
    firstCheckoutFocusRef.current = null;
    lastKeyTimestampRef.current = null;
    interKeyIntervalsRef.current = [];
    copyPasteFlagRef.current = false;
    pasteEventsCountRef.current = 0;
    keystrokesCountRef.current = 0;
    backspaceCorrectionsRef.current = 0;
  }, []);

  return {
    recordFieldFocus,
    recordFieldKeyDown,
    recordFieldPaste,
    captureSnapshot,
    resetSessionTelemetry,
  };
}
