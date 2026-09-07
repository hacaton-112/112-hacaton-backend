import { z } from "zod";

export const IncidentCategorySchema = z.enum([
  "fire",
  "accident",
  "medical",
  "crime",
  "utilities",
  "other",
]);

export const CallerRoleSchema = z.enum([
  "witness",
  "participant",
  "victim",
  "relative",
]);

export const EmergencyServiceSchema = z.enum([
  "fire",
  "police",
  "ambulance",
  "gas",
  "rescue",
]);

export const IncidentPrioritySchema = z.enum(["low", "normal", "high"]);

/** Карточка происшествия: то, что оператор обязан собрать за время разговора. */
export const IncidentCardSchema = z.object({
  category: IncidentCategorySchema,
  address: z.string().trim().min(5, "Укажите адрес происшествия").max(200),
  apartment: z.string().trim().max(30).optional(),
  landmark: z.string().trim().max(200).optional(),
  callerName: z.string().trim().max(120).optional(),
  callerPhone: z.string().trim().max(30).optional(),
  callerRole: CallerRoleSchema,
  threatToLife: z.boolean(),
  victimsCount: z.coerce
    .number()
    .int("Целое число")
    .min(0, "Не может быть отрицательным")
    .max(999),
  services: z
    .array(EmergencyServiceSchema)
    .min(1, "Выберите хотя бы одну службу"),
  priority: IncidentPrioritySchema,
  description: z
    .string()
    .trim()
    .min(10, "Опишите происшествие подробнее")
    .max(2000),
});

export type IncidentCategory = z.infer<typeof IncidentCategorySchema>;
export type CallerRole = z.infer<typeof CallerRoleSchema>;
export type EmergencyService = z.infer<typeof EmergencyServiceSchema>;
export type IncidentPriority = z.infer<typeof IncidentPrioritySchema>;
export type IncidentCard = z.infer<typeof IncidentCardSchema>;
/** Значения полей до валидации: в DOM число приходит строкой, отсюда `z.coerce`. */
export type IncidentCardInput = z.input<typeof IncidentCardSchema>;

export const INCIDENT_CATEGORY_LABELS: Record<IncidentCategory, string> = {
  fire: "Пожар, задымление",
  accident: "ДТП",
  medical: "Медицинский случай",
  crime: "Правонарушение",
  utilities: "Авария ЖКХ",
  other: "Иное",
};

export const CALLER_ROLE_LABELS: Record<CallerRole, string> = {
  witness: "Очевидец",
  participant: "Участник",
  victim: "Пострадавший",
  relative: "Родственник",
};

export const EMERGENCY_SERVICE_LABELS: Record<EmergencyService, string> = {
  fire: "Пожарная охрана",
  police: "Полиция",
  ambulance: "Скорая помощь",
  gas: "Газовая служба",
  rescue: "Спасатели",
};

export const INCIDENT_PRIORITY_LABELS: Record<IncidentPriority, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
};
