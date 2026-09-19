import { generateId } from "@/common/utils/id";
import { db, pool } from "@/core/database/drizzle.client";
import { rescueCrews, type DispatchService } from "@/drizzle/schema";

/**
 * Учебный справочник нарядов.
 *
 * Номера — внутренние номера учебной АТС, а не реальные телефоны служб: первая
 * цифра совпадает с номером ДДС, чтобы преподавателю было легко проверять
 * набор. У каждой службы по два наряда — диспетчер выбирает, а не набирает
 * единственный номер из подсказки.
 */
const CREWS: readonly {
  service: DispatchService;
  callsign: string;
  phoneNumber: string;
  voiceId: string;
}[] = [
  {
    service: "dds_01",
    callsign: "Пожарно-спасательная часть 12",
    phoneNumber: "1012",
    voiceId: "ryan",
  },
  {
    service: "dds_01",
    callsign: "Пожарно-спасательная часть 27",
    phoneNumber: "1027",
    voiceId: "dylan",
  },
  {
    service: "dds_02",
    callsign: "Дежурная часть отдела полиции 5",
    phoneNumber: "2005",
    voiceId: "eric",
  },
  {
    service: "dds_02",
    callsign: "Дежурная часть отдела полиции 14",
    phoneNumber: "2014",
    voiceId: "aiden",
  },
  {
    service: "dds_03",
    callsign: "Подстанция скорой помощи 35",
    phoneNumber: "3035",
    voiceId: "vivian",
  },
  {
    service: "dds_03",
    callsign: "Подстанция скорой помощи 41",
    phoneNumber: "3041",
    voiceId: "sohee",
  },
  {
    service: "dds_04",
    callsign: "Аварийная газовая служба",
    phoneNumber: "4001",
    voiceId: "uncle_fu",
  },
];

async function main(): Promise<void> {
  try {
    for (const crew of CREWS) {
      await db
        .insert(rescueCrews)
        .values({ id: generateId(), ...crew })
        .onConflictDoUpdate({
          target: rescueCrews.phoneNumber,
          set: {
            service: crew.service,
            callsign: crew.callsign,
            voiceId: crew.voiceId,
          },
        });
    }

    console.log(`Seeded ${CREWS.length} rescue crews.`);
  } finally {
    await pool.end();
  }
}

void main();
