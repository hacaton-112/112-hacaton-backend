import { eq } from "drizzle-orm";

import { db, pool } from "@/core/database/drizzle.client";
import { telephonyWorkstations, users } from "@/drizzle/schema";

/**
 * Рассаживает учебные учётные записи за телефоны рабочих мест.
 *
 * Добавочные — те же, что объявлены в учебной АТС (201…210). Без этой связи
 * диспетчер получает отказ «администратор ещё не закрепил за вами телефон»:
 * backend не знает, на какой аппарат звонить, и вызов наряду поставить нельзя.
 * Порядок совпадает с порядком учеников в `seed-groups`, чтобы преподавателю
 * было видно, кто за каким аппаратом сидит.
 */
const SEATS: readonly { extension: string; email: string }[] = [
  { extension: "201", email: "smirnov.operator@system112.local" },
  { extension: "202", email: "ivanova.operator@system112.local" },
  { extension: "203", email: "kuznetsov.operator@system112.local" },
  { extension: "204", email: "vasilieva.operator@system112.local" },
  { extension: "205", email: "operator@system112.local" },
];

async function main(): Promise<void> {
  try {
    let seated = 0;

    for (const seat of SEATS) {
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, seat.email))
        .limit(1);

      if (!user) {
        console.warn(`Skipping ${seat.extension}: no user ${seat.email}`);
        continue;
      }

      // Человек сидит за одним аппаратом: прежнее место освобождаем, иначе
      // уникальный индекс по пользователю не даст пересадить его.
      await db
        .delete(telephonyWorkstations)
        .where(eq(telephonyWorkstations.userId, user.id));
      await db
        .insert(telephonyWorkstations)
        .values({
          extension: seat.extension,
          userId: user.id,
          name: `Рабочее место ${seat.extension}`,
          service: "dds_01",
          isActive: true,
        })
        .onConflictDoUpdate({
          target: telephonyWorkstations.extension,
          set: { userId: user.id },
        });
      seated += 1;
    }

    console.log(`Seated ${seated} trainees at workstation phones.`);
  } finally {
    await pool.end();
  }
}

void main();
