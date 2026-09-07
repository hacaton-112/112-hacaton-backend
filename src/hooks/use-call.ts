import { useCallback, useEffect, useRef, useState } from "react";

import type { IncidentLocation } from "../components/map/incident-map";

export type CallState = "idle" | "ringing" | "active" | "ended";

/** Пока Scenario Engine не подключён — вызовы моделируются на клиенте. */
const DEMO_CALLS: readonly (IncidentLocation & { callerNumber: string })[] = [
  {
    address: "ул. Тверская, д. 12, стр. 1",
    longitude: 37.6076,
    latitude: 55.7625,
    callerNumber: "+7 916 204-31-77",
  },
  {
    address: "Ленинградский пр-т, д. 39, стр. 6",
    longitude: 37.5539,
    latitude: 55.7897,
    callerNumber: "+7 903 118-92-40",
  },
  {
    address: "ул. Профсоюзная, д. 104",
    longitude: 37.5312,
    latitude: 55.6395,
    callerNumber: "+7 925 771-05-63",
  },
];

const MIN_ADDRESS_DELAY_MS = 2_500;
const MAX_ADDRESS_DELAY_MS = 5_000;

export interface CallSnapshot {
  state: CallState;
  callerNumber?: string;
  /** Появляется не сразу: адрес «определяется» через несколько секунд после приёма. */
  incident?: IncidentLocation;
  isResolvingAddress: boolean;
  isOnHold: boolean;
  isMuted: boolean;
  startedAt?: Date;
  acceptedAt?: Date;
  /** Длительность разговора в секундах, тикает раз в секунду. */
  elapsedSeconds: number;
}

export interface CallControls {
  simulateIncoming: () => void;
  accept: () => void;
  reject: () => void;
  end: () => void;
  toggleHold: () => void;
  toggleMute: () => void;
  reset: () => void;
}

/**
 * Состояние вызова целиком: idle → ringing → active → ended.
 * Когда появится серверный call-канал, наружу останется тот же интерфейс,
 * а внутренности заменит подписка на события.
 */
export function useCall(): CallSnapshot & CallControls {
  const [state, setState] = useState<CallState>("idle");
  const [pending, setPending] = useState<(typeof DEMO_CALLS)[number]>();
  const [incident, setIncident] = useState<IncidentLocation>();
  const [isResolvingAddress, setResolvingAddress] = useState(false);
  const [isOnHold, setOnHold] = useState(false);
  const [isMuted, setMuted] = useState(false);
  const [startedAt, setStartedAt] = useState<Date>();
  const [acceptedAt, setAcceptedAt] = useState<Date>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const addressTimerRef = useRef<number>(null);

  const clearAddressTimer = useCallback(() => {
    if (addressTimerRef.current !== null) {
      window.clearTimeout(addressTimerRef.current);
      addressTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearAddressTimer, [clearAddressTimer]);

  useEffect(() => {
    if (state !== "active" || !acceptedAt) return;

    const tick = () =>
      setElapsedSeconds(
        Math.floor((Date.now() - acceptedAt.getTime()) / 1_000),
      );

    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [state, acceptedAt]);

  const reset = useCallback(() => {
    clearAddressTimer();
    setState("idle");
    setPending(undefined);
    setIncident(undefined);
    setResolvingAddress(false);
    setOnHold(false);
    setMuted(false);
    setStartedAt(undefined);
    setAcceptedAt(undefined);
    setElapsedSeconds(0);
  }, [clearAddressTimer]);

  const simulateIncoming = useCallback(() => {
    reset();
    setPending(DEMO_CALLS[Math.floor(Math.random() * DEMO_CALLS.length)]);
    setStartedAt(new Date());
    setState("ringing");
  }, [reset]);

  const accept = useCallback(() => {
    if (!pending) return;

    setState("active");
    setAcceptedAt(new Date());
    setResolvingAddress(true);

    const delay =
      MIN_ADDRESS_DELAY_MS +
      Math.random() * (MAX_ADDRESS_DELAY_MS - MIN_ADDRESS_DELAY_MS);

    addressTimerRef.current = window.setTimeout(() => {
      setIncident(pending);
      setResolvingAddress(false);
      addressTimerRef.current = null;
    }, delay);
  }, [pending]);

  const reject = useCallback(() => {
    clearAddressTimer();
    setState("ended");
    setResolvingAddress(false);
  }, [clearAddressTimer]);

  const end = useCallback(() => {
    clearAddressTimer();
    setState("ended");
    setResolvingAddress(false);
    setOnHold(false);
  }, [clearAddressTimer]);

  return {
    state,
    callerNumber: pending?.callerNumber,
    incident,
    isResolvingAddress,
    isOnHold,
    isMuted,
    startedAt,
    acceptedAt,
    elapsedSeconds,
    simulateIncoming,
    accept,
    reject,
    end,
    toggleHold: () => setOnHold((value) => !value),
    toggleMute: () => setMuted((value) => !value),
    reset,
  };
}
