import { z } from "zod";

export const SCENARIO_CATEGORIES = [
  "fire",
  "road_accident",
  "medical",
  "criminal",
  "gas_leak",
  "other",
] as const;

export const CATEGORY_LABELS: Record<
  (typeof SCENARIO_CATEGORIES)[number],
  string
> = {
  fire: "Пожар",
  road_accident: "ДТП",
  medical: "Медицинская помощь",
  criminal: "Правонарушение",
  gas_leak: "Утечка газа",
  other: "Другое",
};

export const EMERGENCY_SERVICES = [
  "fire",
  "police",
  "ambulance",
  "gas",
] as const;

export const SERVICE_LABELS: Record<
  (typeof EMERGENCY_SERVICES)[number],
  string
> = {
  fire: "Пожарная охрана",
  police: "Полиция",
  ambulance: "Скорая помощь",
  gas: "Аварийная газовая служба",
};

export const INCIDENT_CARD_FIELDS = [
  "city",
  "street",
  "house",
  "entrance",
  "floor",
  "apartment",
  "object_type",
  "landmarks",
  "caller_name",
  "caller_phone",
  "caller_type",
  "dispatcher_notes",
  "category",
  "clarification",
  "started_at",
  "victims_total",
  "children_count",
  "victims_condition",
] as const;

export const CARD_FIELD_LABELS: Record<
  (typeof INCIDENT_CARD_FIELDS)[number],
  string
> = {
  city: "Город",
  street: "Улица",
  house: "Дом",
  entrance: "Подъезд",
  floor: "Этаж",
  apartment: "Квартира",
  object_type: "Тип объекта",
  landmarks: "Ориентиры",
  caller_name: "Имя заявителя",
  caller_phone: "Телефон заявителя",
  caller_type: "Тип заявителя",
  dispatcher_notes: "Примечания диспетчера",
  category: "Категория",
  clarification: "Уточнение",
  started_at: "Время начала",
  victims_total: "Число пострадавших",
  children_count: "Число детей",
  victims_condition: "Состояние пострадавших",
};

export const TERRAIN_TYPES = [
  "city_dense",
  "city_block",
  "highway",
  "open_field",
  "forest",
  "indoor",
] as const;

export const TERRAIN_LABELS: Record<(typeof TERRAIN_TYPES)[number], string> = {
  city_dense: "Плотная городская застройка",
  city_block: "Городской квартал",
  highway: "Трасса",
  open_field: "Открытая местность",
  forest: "Лес",
  indoor: "Внутри здания",
};

export const LOCATOR_ACCURACIES = [
  "identified",
  "approximate",
  "unavailable",
] as const;

export const LOCATOR_ACCURACY_LABELS: Record<
  (typeof LOCATOR_ACCURACIES)[number],
  string
> = {
  identified: "Точно",
  approximate: "Приблизительно",
  unavailable: "Недоступно",
};

export const ESCALATION_TRIGGERS = [
  "operator_silence",
  "question_repeated",
  "heavy_fact_revealed",
  "norm_time_elapsed",
  "forbidden_phrase",
  "calming_phrase",
  "services_confirmed",
  "instruction_followed",
] as const;

export const ESCALATION_TRIGGER_LABELS: Record<
  (typeof ESCALATION_TRIGGERS)[number],
  string
> = {
  operator_silence: "Молчание оператора",
  question_repeated: "Повтор вопроса",
  heavy_fact_revealed: "Раскрыт тяжёлый факт",
  norm_time_elapsed: "Истёк норматив",
  forbidden_phrase: "Запрещённая фраза",
  calming_phrase: "Успокаивающая фраза",
  services_confirmed: "Службы подтверждены",
  instruction_followed: "Инструкция выполнена",
};

export const QWEN_TTS_VOICES = [
  { id: "aiden", gender: "male" },
  { id: "dylan", gender: "male" },
  { id: "eric", gender: "male" },
  { id: "ryan", gender: "male" },
  { id: "uncle_fu", gender: "male" },
  { id: "ono_anna", gender: "female" },
  { id: "serena", gender: "female" },
  { id: "sohee", gender: "female" },
  { id: "vivian", gender: "female" },
] as const;

export const DISCLOSURE_TYPES = [
  "immediate",
  "on_question",
  "after_fact",
  "after_turns",
  "below_panic",
  "after_stage",
  "never",
] as const;

export const DISCLOSURE_LABELS: Record<
  (typeof DISCLOSURE_TYPES)[number],
  string
> = {
  immediate: "Сразу",
  on_question: "После вопроса",
  after_fact: "После других фактов",
  after_turns: "После нескольких реплик",
  below_panic: "При снижении паники",
  after_stage: "На этапе звонка",
  never: "Никогда",
};

const FactIdSchema = z
  .string()
  .trim()
  .min(1, "Укажите ключ факта")
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "Используйте латиницу, цифры и ._:-");

const PanicLevelSchema = z.number().int().min(0).max(4);
const CoordinatesSchema = z.tuple([
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
]);

const isUnsetCoordinates = ([latitude, longitude]: [number, number]): boolean =>
  latitude === 0 && longitude === 0;

const distanceBetweenCoordinates = (
  [fromLatitude, fromLongitude]: [number, number],
  [toLatitude, toLongitude]: [number, number],
): number => {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const fromLatitudeRadians = toRadians(fromLatitude);
  const toLatitudeRadians = toRadians(toLatitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitudeRadians) *
      Math.cos(toLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
};

export const DisclosureRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("immediate") }).strict(),
  z
    .object({
      type: z.literal("on_question"),
      keywords: z.array(z.string().trim().min(2)).min(1).max(32),
    })
    .strict(),
  z
    .object({
      type: z.literal("after_fact"),
      factKeys: z.array(FactIdSchema).min(1).max(16),
    })
    .strict(),
  z
    .object({
      type: z.literal("after_turns"),
      turns: z.number().int().min(1).max(50),
    })
    .strict(),
  z
    .object({ type: z.literal("below_panic"), level: PanicLevelSchema })
    .strict(),
  z
    .object({
      type: z.literal("after_stage"),
      stage: z.enum(["offered", "conversation", "wrap_up"]),
    })
    .strict(),
  z.object({ type: z.literal("never") }).strict(),
]);

const EscalationParamsSchema = z
  .object({
    keywords: z.array(z.string().trim().min(2)).max(32).optional(),
    seconds: z.number().int().min(1).max(600).optional(),
    fraction: z.number().min(0).max(1).optional(),
    times: z.number().int().min(1).max(20).optional(),
  })
  .strict();

export const ScenarioSeedSchema = z
  .object({
    code: z.string().trim().min(2, "Укажите код").max(32),
    title: z.string().trim().min(3, "Укажите название").max(120),
    category: z.enum(SCENARIO_CATEGORIES),
    difficulty: z.number().int().min(1).max(5),
    summary: z.string().trim().min(10, "Добавьте краткое описание").max(400),
    persona: z
      .object({
        code: z.string().trim().min(2).max(64),
        gender: z.enum(["male", "female"]),
        displayName: z.string().trim().min(2).max(120),
        ageYears: z.number().int().min(1).max(110),
        condition: z.string().trim().min(2).max(200),
        speechStyle: z.string().trim().min(10).max(2_000),
        backgroundSounds: z.string().trim().max(200).optional(),
        voiceId: z.string().trim().min(1).max(64),
        baselinePanicLevel: PanicLevelSchema,
        baseSpeechRate: z.number().min(0.5).max(2),
      })
      .strict()
      .refine(
        (persona) =>
          QWEN_TTS_VOICES.some(
            (voice) =>
              voice.id === persona.voiceId && voice.gender === persona.gender,
          ),
        { path: ["voiceId"], message: "Голос не соответствует полу заявителя" },
      ),
    version: z
      .object({
        panicFloor: PanicLevelSchema,
        panicCeiling: PanicLevelSchema,
        maxInterruptions: z.number().int().min(0).max(20),
        initiativeCooldownSeconds: z.number().int().min(1).max(120),
        answerNormSeconds: z.number().int().min(30).max(1_800),
        expectedDurationSeconds: z.number().int().min(30).max(3_600),
        passThreshold: z.number().int().min(0).max(100),
        expectedServices: z.array(z.enum(EMERGENCY_SERVICES)).max(4),
        referenceNotes: z.string().trim().max(2_000).optional(),
        openingLine: z.string().trim().min(3).max(500),
        fallbackLine: z.string().trim().min(3).max(500),
      })
      .strict()
      .refine((version) => version.panicFloor <= version.panicCeiling, {
        path: ["panicFloor"],
        message: "Нижняя граница паники выше верхней",
      }),
    location: z
      .object({
        terrain: z.enum(TERRAIN_TYPES),
        exactAddress: z.record(z.string(), z.string()),
        exactPoint: CoordinatesSchema,
        locatorCenter: CoordinatesSchema,
        locatorRadiusMeters: z.number().int().min(10).max(50_000),
        locatorLabel: z.string().trim().min(3).max(200),
        locatorAccuracy: z.enum(LOCATOR_ACCURACIES),
        callerNumber: z.string().trim().min(3).max(32),
        previouslyCalled: z.boolean(),
      })
      .strict(),
    escalation: z
      .array(
        z
          .object({
            trigger: z.enum(ESCALATION_TRIGGERS),
            direction: z.enum(["up", "down"]),
            cooldownSeconds: z.number().int().min(0).max(600),
            params: EscalationParamsSchema.optional(),
          })
          .strict(),
      )
      .max(32),
    facts: z
      .array(
        z
          .object({
            key: FactIdSchema,
            promptValue: z.string().trim().min(2).max(1_000),
            displayLabel: z.string().trim().min(2).max(120),
            severity: z.enum(["normal", "heavy"]),
            cardField: z.enum(INCIDENT_CARD_FIELDS).nullable(),
            cardValue: z.string().trim().max(200).nullable(),
            contentKeywords: z.array(z.string().trim().min(2)).max(32),
            disclosure: DisclosureRuleSchema,
            priority: z.number().int().min(0).max(100),
          })
          .strict(),
      )
      .min(1, "Добавьте хотя бы один факт")
      .max(64),
    mandatoryQuestions: z
      .array(
        z
          .object({
            text: z.string().trim().min(5).max(300),
            satisfiedByFactKeys: z.array(FactIdSchema).min(1).max(16),
            isCritical: z.boolean(),
          })
          .strict(),
      )
      .max(32),
    referenceCard: z
      .object({
        fields: z
          .array(
            z
              .object({
                field: z.enum(INCIDENT_CARD_FIELDS),
                expectedValue: z.string().trim().min(1).max(200),
                acceptableValues: z.array(z.string().trim().min(1)),
                comparison: z.enum([
                  "exact",
                  "normalized",
                  "numeric_range",
                  "contains",
                ]),
                isRequired: z.boolean(),
                sourceFactKey: FactIdSchema.nullable(),
              })
              .strict(),
          )
          .max(32),
        notes: z.string().trim().max(2_000).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((scenario, context) => {
    const factKeys = new Set(scenario.facts.map((fact) => fact.key));

    if (factKeys.size !== scenario.facts.length) {
      context.addIssue({
        code: "custom",
        path: ["facts"],
        message: "Ключи фактов должны быть уникальными",
      });
    }

    if (
      scenario.persona.baselinePanicLevel < scenario.version.panicFloor ||
      scenario.persona.baselinePanicLevel > scenario.version.panicCeiling
    ) {
      context.addIssue({
        code: "custom",
        path: ["persona", "baselinePanicLevel"],
        message: "Стартовая паника должна быть внутри диапазона версии",
      });
    }

    if (isUnsetCoordinates(scenario.location.exactPoint)) {
      context.addIssue({
        code: "custom",
        path: ["location", "exactPoint"],
        message: "Отметьте точку происшествия на карте",
      });
    }

    if (isUnsetCoordinates(scenario.location.locatorCenter)) {
      context.addIssue({
        code: "custom",
        path: ["location", "locatorCenter"],
        message: "Отметьте центр области геолокации на карте",
      });
    }

    if (
      !isUnsetCoordinates(scenario.location.exactPoint) &&
      !isUnsetCoordinates(scenario.location.locatorCenter) &&
      distanceBetweenCoordinates(
        scenario.location.exactPoint,
        scenario.location.locatorCenter,
      ) > scenario.location.locatorRadiusMeters
    ) {
      context.addIssue({
        code: "custom",
        path: ["location", "locatorCenter"],
        message:
          "Точка происшествия должна находиться внутри выбранной области",
      });
    }

    scenario.mandatoryQuestions.forEach((question, index) => {
      question.satisfiedByFactKeys.forEach((key) => {
        if (!factKeys.has(key)) {
          context.addIssue({
            code: "custom",
            path: ["mandatoryQuestions", index, "satisfiedByFactKeys"],
            message: `Неизвестный факт: ${key}`,
          });
        }
      });
    });

    scenario.facts.forEach((fact, index) => {
      if (fact.disclosure.type === "after_fact") {
        fact.disclosure.factKeys.forEach((key) => {
          if (!factKeys.has(key)) {
            context.addIssue({
              code: "custom",
              path: ["facts", index, "disclosure", "factKeys"],
              message: `Неизвестный факт: ${key}`,
            });
          }
        });
      }
    });

    const referenceFields = new Set<string>();
    scenario.referenceCard.fields.forEach((field, index) => {
      if (referenceFields.has(field.field)) {
        context.addIssue({
          code: "custom",
          path: ["referenceCard", "fields", index, "field"],
          message: "Поле эталонной карточки уже добавлено",
        });
      }
      referenceFields.add(field.field);

      if (field.sourceFactKey !== null && !factKeys.has(field.sourceFactKey)) {
        context.addIssue({
          code: "custom",
          path: ["referenceCard", "fields", index, "sourceFactKey"],
          message: `Неизвестный факт: ${field.sourceFactKey}`,
        });
      }
    });
  });

const MANUAL_LOCATION_VALIDATION_PLACEHOLDER: ScenarioSeed["location"] = {
  terrain: "city_block",
  exactAddress: {},
  exactPoint: [55.7558, 37.6173],
  locatorCenter: [55.7558, 37.6173],
  locatorRadiusMeters: 500,
  locatorLabel: "Manual location selection",
  locatorAccuracy: "approximate",
  callerNumber: "+7 000 000-00-00",
  previouslyCalled: false,
};

export const ScenarioAssistantDraftSchema = z
  .object({
    code: ScenarioSeedSchema.shape.code,
    title: ScenarioSeedSchema.shape.title,
    category: ScenarioSeedSchema.shape.category,
    difficulty: ScenarioSeedSchema.shape.difficulty,
    summary: ScenarioSeedSchema.shape.summary,
    persona: ScenarioSeedSchema.shape.persona,
    version: ScenarioSeedSchema.shape.version,
    escalation: ScenarioSeedSchema.shape.escalation,
    facts: ScenarioSeedSchema.shape.facts,
    mandatoryQuestions: ScenarioSeedSchema.shape.mandatoryQuestions,
    referenceCard: ScenarioSeedSchema.shape.referenceCard,
  })
  .strict()
  .superRefine((draft, context) => {
    const result = ScenarioSeedSchema.safeParse({
      ...draft,
      location: MANUAL_LOCATION_VALIDATION_PLACEHOLDER,
    });

    if (!result.success) {
      result.error.issues.forEach((issue) =>
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        }),
      );
    }
  });

export const GenerateScenarioDraftResponseSchema = z
  .object({
    scenario: ScenarioAssistantDraftSchema,
    authoringPrompt: z.string().min(20).max(4_000),
  })
  .strict();

export const PublishedScenarioSchema = z
  .object({
    scenarioId: z.string().min(1),
    scenarioVersionId: z.string().min(1),
    code: z.string().min(2).max(32),
    title: z.string().min(3).max(120),
    version: z.number().int().positive(),
    status: z.literal("published"),
    publishedAt: z.iso.datetime(),
  })
  .strict();

export const ReverseGeocodedAddressSchema = z
  .object({
    city: z.string().trim().min(1).max(200).optional(),
    street: z.string().trim().min(1).max(300).optional(),
    house: z.string().trim().min(1).max(100).optional(),
    displayName: z.string().trim().min(1).max(4_000),
    attribution: z.literal("© OpenStreetMap contributors"),
  })
  .strict();

export type ScenarioSeed = z.infer<typeof ScenarioSeedSchema>;
export type ScenarioAssistantDraft = z.infer<
  typeof ScenarioAssistantDraftSchema
>;
export type ScenarioFact = ScenarioSeed["facts"][number];
export type DisclosureRule = ScenarioFact["disclosure"];
export type MandatoryQuestion = ScenarioSeed["mandatoryQuestions"][number];
export type EscalationRule = ScenarioSeed["escalation"][number];
export type ReferenceCardField =
  ScenarioSeed["referenceCard"]["fields"][number];
export type GenerateScenarioDraftResponse = z.infer<
  typeof GenerateScenarioDraftResponseSchema
>;
export type PublishedScenario = z.infer<typeof PublishedScenarioSchema>;
export type ReverseGeocodedAddress = z.infer<
  typeof ReverseGeocodedAddressSchema
>;

export const createEmptyScenario = (): ScenarioSeed => ({
  code: "",
  title: "",
  category: "other",
  difficulty: 2,
  summary: "",
  persona: {
    code: "",
    gender: "female",
    displayName: "",
    ageYears: 35,
    condition: "",
    speechStyle: "",
    backgroundSounds: "",
    voiceId: "serena",
    baselinePanicLevel: 2,
    baseSpeechRate: 1,
  },
  version: {
    panicFloor: 0,
    panicCeiling: 4,
    maxInterruptions: 3,
    initiativeCooldownSeconds: 12,
    answerNormSeconds: 240,
    expectedDurationSeconds: 360,
    passThreshold: 75,
    expectedServices: [],
    referenceNotes: "",
    openingLine: "",
    fallbackLine: "",
  },
  location: {
    terrain: "city_block",
    exactAddress: { city: "", street: "", house: "", details: "" },
    exactPoint: [0, 0],
    locatorCenter: [0, 0],
    locatorRadiusMeters: 500,
    locatorLabel: "",
    locatorAccuracy: "approximate",
    callerNumber: "+7 000 000-00-00",
    previouslyCalled: false,
  },
  escalation: [
    {
      trigger: "operator_silence",
      direction: "up",
      cooldownSeconds: 20,
      params: { seconds: 20 },
    },
    {
      trigger: "calming_phrase",
      direction: "down",
      cooldownSeconds: 4,
      params: { keywords: ["спокойно", "я вас слышу", "помощь выехала"] },
    },
  ],
  facts: [
    {
      key: "incident_type",
      promptValue: "",
      displayLabel: "Тип происшествия",
      severity: "normal",
      cardField: "category",
      cardValue: "",
      contentKeywords: [],
      disclosure: { type: "immediate" },
      priority: 10,
    },
  ],
  mandatoryQuestions: [],
  referenceCard: { fields: [], notes: "" },
});

export const mergeScenarioAssistantDraft = (
  current: ScenarioSeed,
  draft: ScenarioAssistantDraft,
): ScenarioSeed => ({
  ...draft,
  location: current.location,
});
