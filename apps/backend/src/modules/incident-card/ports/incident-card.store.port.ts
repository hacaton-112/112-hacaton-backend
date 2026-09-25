import type { IncidentCard, SaveIncidentCard } from "../dto/incident-card.dto";
import type { ClassifierRoutingSnapshot } from "@/drizzle/schema";

export type StoredIncidentCardPatch = SaveIncidentCard & {
  readonly classifierRouting?: ClassifierRoutingSnapshot | null;
};

/** Кому принадлежит звонок и можно ли ещё править его карточку. */
export interface CallOwnership {
  readonly operatorId: string | null;
  readonly isOver: boolean;
}

/**
 * Хранилище карточки.
 *
 * Порт, а не прямой доступ к базе: сохранение карточки — это транзакция из
 * upsert и полной замены списка пострадавших, и стаб на билдер запросов
 * проверял бы стаб, а не правило.
 */
export interface IncidentCardStore {
  findCall(trainingSessionId: string): Promise<CallOwnership | null>;

  load(trainingSessionId: string): Promise<IncidentCard | null>;

  save(
    trainingSessionId: string,
    patch: StoredIncidentCardPatch,
  ): Promise<IncidentCard>;

  /** Закрывает карточку вместе со звонком; повтор ничего не меняет. */
  submit(trainingSessionId: string, submittedAt: Date): Promise<void>;
}

export const INCIDENT_CARD_STORE = Symbol("INCIDENT_CARD_STORE");
