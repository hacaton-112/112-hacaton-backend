import { useCallback, useEffect, useRef, useState } from "react";

import {
  EMPTY_INCIDENT_CARD,
  type IncidentCard,
  type IncidentCardInput,
} from "../contracts/incident";
import {
  incidentCardService
} from "../services/incident-card.service";

/**
 * Пауза перед отправкой. Оператор печатает адрес по буквам, и слать карточку
 * на каждый нажатый символ незачем; полторы секунды — это и не поток запросов,
 * и не потеря работы, если окно закроется.
 */
const SAVE_DELAY_MS = 1_500;

export interface IncidentCardState {
  /** Карточка с сервера: подставляется в форму при открытии звонка. */
  card?: IncidentCardInput;
  services: IncidentCard["services"];
  isSaving: boolean;
  error?: string;
  change: (card: IncidentCard) => void;
  toggleService: (service: IncidentCard["services"][number]) => void;
}

/**
 * Карточка происшествия одного звонка.
 *
 * Карточка разбросана по окну — место и происшествие в форме, службы в правой
 * колонке, — поэтому её состоянием владеет одно место, а не каждый компонент
 * по отдельности. Кнопки «сохранить» в АРМ нет: карточка уходит на сервер по
 * ходу разговора, а закрывает её конец звонка.
 */
export function useIncidentCard(
  trainingSessionId: string | undefined,
  isCallOver: boolean,
): IncidentCardState {
  const [loaded, setLoaded] = useState<IncidentCardInput>();
  const [chosen, setChosen] = useState<IncidentCard["services"]>([]);
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef<IncidentCard>(null);
  const timer = useRef<number>(null);

  useEffect(() => {
    if (!trainingSessionId) return;

    incidentCardService.loadIncidentCard(trainingSessionId)
      .then((card) => {
        setLoaded(card as IncidentCardInput);
        setChosen(card.services);
      })
      // Карточки может ещё не быть — это не ошибка, а пустой бланк.
      .catch(() => setLoaded(EMPTY_INCIDENT_CARD));
  }, [trainingSessionId]);

  const flush = useCallback((sessionId: string) => {
    const next = pending.current;
    pending.current = null;

    if (!next) return;

    setSaving(true);
    incidentCardService.saveIncidentCard(sessionId, next)
      .then(() => setError(undefined))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      )
      .finally(() => setSaving(false));
  }, []);

  const schedule = useCallback(
    (next: IncidentCard) => {
      // Законченный звонок карточку уже не принимает: backend отвечает отказом,
      // и молотиться в него бессмысленно.
      if (!trainingSessionId || isCallOver) return;

      pending.current = next;

      if (timer.current !== null) window.clearTimeout(timer.current);

      timer.current = window.setTimeout(() => {
        timer.current = null;
        flush(trainingSessionId);
      }, SAVE_DELAY_MS);
    },
    [trainingSessionId, isCallOver, flush],
  );

  // Незаписанное при закрытии окна теряется, поэтому таймер снимается вместе
  // с отправкой того, что уже набрано.
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (trainingSessionId && !isCallOver) flush(trainingSessionId);
    },
    [trainingSessionId, isCallOver, flush],
  );

  const change = useCallback(
    (next: IncidentCard) => {
      setChosen(next.services);
      schedule(next);
    },
    [schedule],
  );

  const toggleService = useCallback(
    (service: IncidentCard["services"][number]) => {
      setChosen((current) => {
        const next = current.includes(service)
          ? current.filter((item) => item !== service)
          : [...current, service];

        const base = pending.current;
        if (base) schedule({ ...base, services: next });

        return next;
      });
    },
    [schedule],
  );

  // Без звонка карточки нет: состояние прошлого звонка сюда не протекает.
  return {
    card: trainingSessionId ? loaded : undefined,
    services: trainingSessionId ? chosen : [],
    isSaving,
    error,
    change,
    toggleService,
  };
}
