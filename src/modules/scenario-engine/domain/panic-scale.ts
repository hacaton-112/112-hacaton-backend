import type { CallerEmotion } from "@/contracts";
import type { EscalationDirection, EscalationTrigger } from "@/drizzle/schema";

/**
 * Шкала состояния заявителя.
 *
 * Пять ступеней, а не непрерывная величина: ступень должна быть слышна
 * оператору и однозначно читаться в разборе, а плавная шкала даёт неразличимые
 * соседние значения.
 */
export const PANIC_LEVELS = [0, 1, 2, 3, 4] as const;

export type PanicLevel = (typeof PANIC_LEVELS)[number];

export interface PanicProfile {
  readonly emotion: CallerEmotion;
  readonly intensity: number;
  /** Множитель к базовому темпу речи персонажа. */
  readonly speechRateMultiplier: number;
  /** Сколько новых фактов заявитель способен выдать за один ход. */
  readonly factBudget: number;
  readonly allowsInterruption: boolean;
  /** Через сколько секунд молчания оператора заявитель заговорит сам. */
  readonly initiativeSilenceSeconds: number | null;
  /** Описание для промпта: модель получает состояние словами, а не числом. */
  readonly description: string;
  /**
   * Как заявитель говорит на этой ступени.
   *
   * Описания состояния модели мало: получив «в панике», она всё равно пишет
   * ровную фразу с точкой. Правила задают длину, повторы и право строить
   * связный рассказ — то, чем ступень отличается на слух.
   */
  readonly speechRules: string;
  /**
   * Примеры подачи: на стиль они действуют вернее любого описания.
   *
   * В них нет ни одного сведения о происшествии и ни одного родового
   * окончания. Профиль общий для всех сценариев, а модель переносит пример в
   * реплику почти дословно: «Дети там, дети!» из пожарного сценария звучало в
   * наезде на пешехода, где детей нет, а «я вышел» — у женщины-заявителя.
   */
  readonly examples: readonly string[];
}

const PROFILES: Record<PanicLevel, PanicProfile> = {
  0: {
    emotion: "calm",
    intensity: 0.22,
    speechRateMultiplier: 1,
    factBudget: 3,
    allowsInterruption: false,
    initiativeSilenceSeconds: null,
    description:
      "владеет собой, отвечает по существу и сам структурирует рассказ",
    speechRules:
      "Отвечает полными фразами, может назвать несколько подробностей подряд.",
    examples: [
      "Да, слушаю. Сейчас расскажу по порядку.",
      "Минуту, уточню и скажу точно.",
      "Могу ответить на все ваши вопросы.",
      "Сейчас посмотрю и отвечу.",
    ],
  },
  1: {
    emotion: "anxious",
    intensity: 0.4,
    speechRateMultiplier: 1.05,
    factBudget: 3,
    allowsInterruption: false,
    initiativeSilenceSeconds: null,
    description: "встревожен, отвечает на вопрос, но добавляет лишнее",
    speechRules: "Одно-два предложения, к ответу добавляет лишнюю подробность.",
    examples: [
      "Да, сейчас… Мне не по себе, но скажу.",
      "Вроде бы так, но точно сказать не могу.",
      "Хорошо. Только, пожалуйста, не кладите трубку.",
      "Сейчас, соберусь с мыслями.",
    ],
  },
  2: {
    emotion: "anxious",
    intensity: 0.6,
    speechRateMultiplier: 1.15,
    factBudget: 2,
    allowsInterruption: false,
    initiativeSilenceSeconds: 6,
    description:
      "взвинчен, говорит короткими фразами, перескакивает между темами",
    speechRules:
      "Короткие рубленые фразы, перескакивает с темы на тему, не заканчивает предложение.",
    examples: [
      "Подождите… сейчас скажу.",
      "Да, да. Нет, стойте, не так.",
      "Плохо соображаю, простите.",
      "Секунду… вот, сейчас.",
    ],
  },
  3: {
    emotion: "panic",
    intensity: 0.78,
    speechRateMultiplier: 1.22,
    factBudget: 1,
    allowsInterruption: true,
    initiativeSilenceSeconds: 4,
    description:
      "в панике, отвечает одним-двумя предложениями и сбивается на отдельных словах",
    speechRules:
      "Одно-два коротких предложения, может запнуться или сбиться, но отвечает на текущий вопрос и не пересказывает уже сказанное.",
    examples: [
      "Что? Повторите, я не слышу!",
      "Да-да, сейчас, сейчас!",
      "Мне страшно, что мне делать?!",
      "Подождите, не могу сосредоточиться!",
    ],
  },
  4: {
    emotion: "panic",
    intensity: 0.92,
    speechRateMultiplier: 1.3,
    factBudget: 1,
    allowsInterruption: true,
    initiativeSilenceSeconds: 3,
    description:
      "не владеет собой, говорит резко и воспринимает только короткие простые команды",
    speechRules:
      "Говорит обрывками и воспринимает только короткие простые вопросы; может сорваться на крик, но не пересказывает уже сказанное.",
    examples: [
      "Что?! Не понимаю!",
      "Не могу, не могу!",
      "Помогите, пожалуйста!",
      "Что мне делать?!",
    ],
  },
};

const MIN_SPEECH_RATE = 0.5;
const MAX_SPEECH_RATE = 2;

export const isPanicLevel = (value: number): value is PanicLevel =>
  PANIC_LEVELS.includes(value as PanicLevel);

export const panicProfile = (level: PanicLevel): PanicProfile =>
  PROFILES[level];

const DELIVERY_EXAMPLES_PER_TURN = 2;

/** Маленький стабильный хеш: выбор примеров воспроизводим внутри звонка. */
const stableHash = (value: string): number => {
  let hash = 2_166_136_261;

  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
};

/**
 * Два примера подачи для этого хода.
 *
 * Одни и те же примеры в каждом ходе модель со временем начинает
 * произносить сама. Выбор меняется от хода к ходу, но зависит только от
 * звонка и номера хода — один и тот же ход всегда получает те же примеры.
 */
export const deliveryExamples = (
  level: PanicLevel,
  turnSeed: string,
): readonly string[] => {
  const pool = PROFILES[level].examples;
  const start = stableHash(turnSeed) % pool.length;

  return Array.from(
    { length: Math.min(DELIVERY_EXAMPLES_PER_TURN, pool.length) },
    (_, offset) => pool[(start + offset) % pool.length]!,
  );
};

/** Ступень не выходит за границы, заданные сценарием. */
export const clampPanicLevel = (
  level: number,
  floor: PanicLevel,
  ceiling: PanicLevel,
): PanicLevel => {
  const bounded = Math.min(Math.max(level, floor), ceiling);

  return (isPanicLevel(bounded) ? bounded : floor) as PanicLevel;
};

/**
 * Параметры синтеза для ступени. Темп ограничен диапазоном контракта, иначе
 * быстрый персонаж на верхней ступени вышел бы за пределы `SpeechRateSchema`.
 */
export const resolveVoice = (
  level: PanicLevel,
  baseSpeechRate: number,
): { emotion: CallerEmotion; intensity: number; speechRate: number } => {
  const profile = PROFILES[level];
  const speechRate = Math.min(
    Math.max(baseSpeechRate * profile.speechRateMultiplier, MIN_SPEECH_RATE),
    MAX_SPEECH_RATE,
  );

  return {
    emotion: profile.emotion,
    intensity: profile.intensity,
    speechRate: Number(speechRate.toFixed(2)),
  };
};

export interface EscalationRule {
  readonly trigger: EscalationTrigger;
  readonly direction: EscalationDirection;
  readonly cooldownSeconds: number;
  /** Для фраз оператора: `calming_phrase`, `forbidden_phrase`. */
  readonly keywords?: readonly string[];
  /** Для `operator_silence`: сколько секунд молчания считать поводом. */
  readonly seconds?: number;
  /** Для `norm_time_elapsed`: доля норматива приёма вызова. */
  readonly fraction?: number;
  /** Для `question_repeated`: сколько повторов терпит заявитель. */
  readonly times?: number;
}

export interface PanicTransition {
  readonly level: PanicLevel;
  readonly trigger: EscalationTrigger;
  readonly direction: EscalationDirection;
}

export interface EscalationInput {
  readonly rules: readonly EscalationRule[];
  readonly currentLevel: PanicLevel;
  readonly floor: PanicLevel;
  readonly ceiling: PanicLevel;
  /** Что произошло на этом ходу; порядок задаёт приоритет. */
  readonly firedTriggers: readonly EscalationTrigger[];
  readonly changedAt: Date | null;
  readonly now: Date;
}

const MILLISECONDS_PER_SECOND = 1_000;

const cooldownPassed = (
  rule: EscalationRule,
  changedAt: Date | null,
  now: Date,
): boolean => {
  if (changedAt === null) {
    return true;
  }

  const elapsed =
    (now.getTime() - changedAt.getTime()) / MILLISECONDS_PER_SECOND;

  return elapsed >= rule.cooldownSeconds;
};

/**
 * Выбирает переход по шкале.
 *
 * Шаг всегда единичный, и за один ход применяется одно правило: без этого
 * голос дёргался бы на две ступени сразу, а разбор становился нечитаемым.
 * Возвращает `null`, когда двигаться некуда — правило не сработало, не прошла
 * пауза или ступень упёрлась в границу сценария.
 */
export const resolveEscalation = ({
  rules,
  currentLevel,
  floor,
  ceiling,
  firedTriggers,
  changedAt,
  now,
}: EscalationInput): PanicTransition | null => {
  for (const trigger of firedTriggers) {
    const rule = rules.find((candidate) => candidate.trigger === trigger);

    if (rule === undefined || !cooldownPassed(rule, changedAt, now)) {
      continue;
    }

    const step = rule.direction === "up" ? 1 : -1;
    const level = clampPanicLevel(currentLevel + step, floor, ceiling);

    if (level === currentLevel) {
      continue;
    }

    return { level, trigger: rule.trigger, direction: rule.direction };
  }

  return null;
};
