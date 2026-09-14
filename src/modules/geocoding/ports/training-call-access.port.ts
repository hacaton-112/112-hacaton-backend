/** Кому принадлежит учебный звонок и идёт ли он ещё. */
export interface TrainingCallOwnership {
  readonly operatorId: string | null;
  readonly isOver: boolean;
}

/**
 * Доступ оператора к геокодеру.
 *
 * Оператор определяет адрес только по точке своего идущего звонка: без этой
 * привязки маршрут превращается в бесплатный прокси к провайдеру карт для
 * любого, у кого есть учётная запись.
 */
export interface TrainingCallAccess {
  findCall(trainingSessionId: string): Promise<TrainingCallOwnership | null>;
}

export const TRAINING_CALL_ACCESS = Symbol("TRAINING_CALL_ACCESS");
