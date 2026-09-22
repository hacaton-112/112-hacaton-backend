import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import {
  CALLER_GENDERS,
  DISPATCH_SERVICES,
  EMERGENCY_SERVICES,
  SCENARIO_CATEGORIES,
  TERRAIN_TYPES,
  type TerrainType,
} from "@/drizzle/schema";
import { buildIncidentScenario } from "@/modules/scenario-catalog/domain/incident-scenario";

/**
 * Вызовы из экзаменационных билетов АГС ГСИ как сценарии тренажёра.
 *
 * Билет задаёт только суть вызова: что случилось, кто звонит, адрес и
 * уточнение адреса. Голос, раскрытие фактов и эскалацию строит общий
 * buildIncidentScenario — тот же, что собирает черновик помощника, — а
 * здесь добавляется место происшествия, которое у билета известно. Результат проходит ту же ScenarioSeedSchema, что и сценарии,
 * написанные вручную: у билета нет отдельной, более слабой двери в базу.
 *
 * Из каждого опубликованного сценария строится и карточка ДДС, поэтому
 * билеты одновременно наполняют голосовой тренажёр и карточные занятия.
 */
// Путь от корня проекта, как у остальных сидов: сборка идёт в CommonJS.
export const TICKETS_FILE = join(
  process.cwd(),
  "drizzle",
  "seed",
  "tickets",
  "tickets.json",
);

const TicketSchema = z
  .object({
    code: z.string().regex(/^T\d{2}-\d$/),
    title: z.string().trim().min(3).max(120),
    situation: z.string().trim().min(10).max(400),
    /** Первая реплика, если заголовок в ней звучит неестественно. */
    opening: z.string().trim().min(3).max(300).optional(),
    category: z.enum(SCENARIO_CATEGORIES),
    difficulty: z.number().int().min(1).max(5),
    services: z.array(z.enum(EMERGENCY_SERVICES)).max(4),
    /** Полный набор служб ДДС: словарь сценария знает только 01–04. */
    dispatch: z.array(z.enum(DISPATCH_SERVICES)),
    caller: z
      .object({
        name: z.string().trim().min(2),
        gender: z.enum(CALLER_GENDERS),
        age: z.number().int().min(10).max(100),
        phone: z.string().trim().min(5),
      })
      .strict(),
    address: z
      .object({
        spoken: z.string().trim().min(5),
        clarified: z.string().trim().min(3).optional(),
        parts: z.record(z.string(), z.string().trim().min(1)),
      })
      .strict(),
    terrain: z.enum(TERRAIN_TYPES),
    point: z.tuple([z.number(), z.number()]),
    /** `null` — заявитель не знает, есть ли пострадавшие. */
    victims: z.number().int().min(0).nullable(),
    details: z.array(z.string().trim().min(2)),
  })
  .strict();

const TicketsFileSchema = z
  .object({
    source: z.string(),
    note: z.string(),
    excluded: z.array(z.object({ code: z.string(), reason: z.string() })),
    tickets: z.array(TicketSchema).min(1),
  })
  .strict();

export type Ticket = z.infer<typeof TicketSchema>;

/** Радиус локатора: в поле и в лесу базовая станция накрывает километры. */
const LOCATOR_RADIUS: Record<TerrainType, number> = {
  city_dense: 300,
  city_block: 500,
  indoor: 300,
  highway: 1_500,
  open_field: 2_500,
  forest: 3_000,
};

/**
 * Части адреса с подписями: карточка ДДС склеивает их через запятую, и без
 * подписей «корпус 6, 9, 45» не прочитать. Эталон сравнивает голые номера.
 */
const labelledAddress = (
  parts: Readonly<Record<string, string>>,
): Record<string, string> => {
  const label: Record<string, (value: string) => string> = {
    building: (value) => (/^\d+$/u.test(value) ? `строение ${value}` : value),
    entrance: (value) => `подъезд ${value}`,
    floor: (value) => `этаж ${value}`,
    apartment: (value) => `кв. ${value}`,
  };
  return Object.fromEntries(
    Object.entries(parts).map(([key, value]) => [
      key,
      label[key]?.(value) ?? value,
    ]),
  );
};

export function ticketToScenario(ticket: Ticket): unknown {
  const radius = LOCATOR_RADIUS[ticket.terrain];
  // Центр локатора смещён от точки на 40 % радиуса: вызов попадает в
  // зону, но точку оператору всё равно нужно найти по адресу.
  const shift = (radius * 0.4) / 111_000;

  return {
    ...buildIncidentScenario({
      ...ticket,
      personaCode: `ticket-${ticket.code.toLowerCase()}`,
      referenceLabel: `Билет ${ticket.code}`,
    }),
    location: {
      terrain: ticket.terrain,
      exactAddress: labelledAddress(ticket.address.parts),
      exactPoint: ticket.point,
      locatorCenter: [ticket.point[0] + shift, ticket.point[1]],
      locatorRadiusMeters: radius,
      locatorLabel: `Мобильный · базовая станция рядом с местом вызова (${ticket.address.parts.city ?? "Московский регион"})`,
      locatorAccuracy:
        ticket.terrain === "forest" || ticket.terrain === "open_field"
          ? "approximate"
          : "identified",
      callerNumber: ticket.caller.phone,
      previouslyCalled: false,
    },
  };
}

export function loadTickets(file: string = TICKETS_FILE): Ticket[] {
  return TicketsFileSchema.parse(JSON.parse(readFileSync(file, "utf8")))
    .tickets;
}
