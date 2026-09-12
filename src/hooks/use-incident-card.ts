import { useCallback, useEffect, useRef, useState } from "react";

import {
  type IncidentCard,
  type IncidentCardPatch,
} from "../contracts/incident";
import {
  IncidentCardDraft,
  type IncidentCardLocationDefaults,
} from "../services/incident-card-draft";
import { incidentCardService } from "../services/incident-card.service";

interface UseIncidentCardOptions {
  trainingSessionId?: string;
  isCallOver: boolean;
  locationDefaults?: IncidentCardLocationDefaults;
}

export interface IncidentCardState {
  card?: IncidentCard;
  services: IncidentCard["services"];
  isSaving: boolean;
  error?: string;
  update: (patch: IncidentCardPatch) => void;
  toggleService: (service: IncidentCard["services"][number]) => void;
  flush: () => Promise<void>;
}

/**
 * Карточка происшествия одного звонка.
 *
 * Заявитель, место, происшествие, пострадавшие и выбранные службы используют
 * один черновик. Благодаря этому изменение в одной колонке не возвращает
 * устаревшие данные из другой.
 */
export function useIncidentCard({
  trainingSessionId,
  isCallOver,
  locationDefaults,
}: UseIncidentCardOptions): IncidentCardState {
  const [card, setCard] = useState<IncidentCard>();
  const [loadedSessionId, setLoadedSessionId] = useState<string>();
  const [savingSessionId, setSavingSessionId] = useState<string>();
  const [failure, setFailure] = useState<{
    sessionId: string;
    message: string;
  }>();
  const draft = useRef<IncidentCardDraft | null>(null);
  const terminalSessionId = useRef<string | null>(null);
  const defaultsRef = useRef(locationDefaults);

  useEffect(() => {
    if (isCallOver && trainingSessionId) {
      terminalSessionId.current = trainingSessionId;
    }
  }, [isCallOver, trainingSessionId]);

  useEffect(() => {
    defaultsRef.current = locationDefaults;
  }, [locationDefaults]);

  useEffect(() => {
    if (!trainingSessionId) {
      draft.current = null;
      return;
    }

    let cancelled = false;
    const nextDraft = new IncidentCardDraft({
      save: (next) =>
        incidentCardService.saveIncidentCard(trainingSessionId, next),
      onSavingChange: (isSaving) =>
        setSavingSessionId((current) =>
          isSaving
            ? trainingSessionId
            : current === trainingSessionId
              ? undefined
              : current,
        ),
      onSaved: () =>
        setFailure((current) =>
          current?.sessionId === trainingSessionId ? undefined : current,
        ),
      onError: (reason) =>
        setFailure({
          sessionId: trainingSessionId,
          message: reason instanceof Error ? reason.message : String(reason),
        }),
    });
    draft.current = nextDraft;

    void incidentCardService
      .loadIncidentCard(trainingSessionId)
      .then((loaded) => {
        if (cancelled || draft.current !== nextDraft) return;

        setCard(nextDraft.load(loaded, defaultsRef.current));
        setLoadedSessionId(trainingSessionId);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;

        setFailure({
          sessionId: trainingSessionId,
          message: reason instanceof Error ? reason.message : String(reason),
        });
      });

    return () => {
      cancelled = true;
      if (draft.current === nextDraft) draft.current = null;
      nextDraft.dispose(terminalSessionId.current !== trainingSessionId);
    };
  }, [trainingSessionId]);

  const update = useCallback(
    (patch: IncidentCardPatch) => {
      if (isCallOver) return;

      const next = draft.current?.update(patch);
      if (next) setCard(next);
    },
    [isCallOver],
  );

  const toggleService = useCallback(
    (service: IncidentCard["services"][number]) => {
      const current = draft.current?.getSnapshot();
      if (!current || isCallOver) return;

      update({
        services: current.services.includes(service)
          ? current.services.filter((item) => item !== service)
          : [...current.services, service],
      });
    },
    [isCallOver, update],
  );

  const flush = useCallback(async () => {
    if (!draft.current || isCallOver) return;

    await draft.current.flush();
  }, [isCallOver]);

  const belongsToCurrentSession =
    Boolean(trainingSessionId) && loadedSessionId === trainingSessionId;

  return {
    card: belongsToCurrentSession ? card : undefined,
    services: belongsToCurrentSession ? (card?.services ?? []) : [],
    isSaving:
      Boolean(trainingSessionId) && savingSessionId === trainingSessionId,
    error:
      failure && failure.sessionId === trainingSessionId
        ? failure.message
        : undefined,
    update,
    toggleService,
    flush,
  };
}
