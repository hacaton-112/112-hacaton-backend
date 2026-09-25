import { desc, eq } from "drizzle-orm";

import { generateId } from "@/common/utils/id";
import { db, pool } from "@/core/database/drizzle.client";
import {
  scenarios,
  scenarioVersions,
  trainingAssignments,
  trainingGroupMembers,
  trainingGroups,
  users,
} from "@/drizzle/schema";

async function main(): Promise<void> {
  try {
    console.log("Seeding groups, group members, and assignments...");

    // Find instructors
    const [primaryInstructor] = await db
      .select()
      .from(users)
      .where(eq(users.email, "instructor@system112.local"))
      .limit(1);

    const [secondaryInstructor] = await db
      .select()
      .from(users)
      .where(eq(users.email, "petrov.instructor@system112.local"))
      .limit(1);

    if (!primaryInstructor) {
      throw new Error("Primary instructor not found. Run seed-admin first.");
    }

    const instructor1Id = primaryInstructor.id;
    const instructor2Id = secondaryInstructor ? secondaryInstructor.id : primaryInstructor.id;

    // Groups to seed
    const groupsData = [
      {
        name: "Группа СИП-413",
        code: "SIP-413",
        organization: "ГБПОУ КСТ",
        instructorId: instructor1Id,
      },
      {
        name: "Смена №1 — ДДС",
        code: "DDS-SHIFT-1",
        organization: "Центр управления в кризисных ситуациях",
        instructorId: instructor2Id,
      },
    ];

    const groupMap = new Map<string, string>();

    for (const g of groupsData) {
      const [existing] = await db
        .select()
        .from(trainingGroups)
        .where(eq(trainingGroups.code, g.code))
        .limit(1);

      if (existing) {
        groupMap.set(g.code, existing.id);
        console.log(`Group ${g.code} already exists (${existing.id})`);
      } else {
        const id = generateId();
        await db.insert(trainingGroups).values({
          id,
          name: g.name,
          code: g.code,
          organization: g.organization,
          instructorId: g.instructorId,
          status: "active",
        });
        groupMap.set(g.code, id);
        console.log(`Created group ${g.code}: ${g.name}`);
      }
    }

    // Find operators
    const allUsers = await db.select().from(users);
    const userByEmail = new Map(allUsers.map((u) => [u.email, u.id]));

    // Members to seed: [groupCode, email, serviceTag]
    const membersData = [
      { groupCode: "SIP-413", email: "operator@system112.local", serviceTag: "RIZO" },
      { groupCode: "SIP-413", email: "smirnov.operator@system112.local", serviceTag: "01" },
      { groupCode: "SIP-413", email: "ivanova.operator@system112.local", serviceTag: "02" },
      { groupCode: "DDS-SHIFT-1", email: "kuznetsov.operator@system112.local", serviceTag: "03" },
      { groupCode: "DDS-SHIFT-1", email: "vasilieva.operator@system112.local", serviceTag: "04" },
    ];

    for (const m of membersData) {
      const groupId = groupMap.get(m.groupCode);
      const userId = userByEmail.get(m.email);

      if (!groupId || !userId) {
        console.warn(`Skipping member ${m.email} for group ${m.groupCode}: missing IDs`);
        continue;
      }

      const existingMembers = await db
        .select()
        .from(trainingGroupMembers)
        .where(eq(trainingGroupMembers.groupId, groupId));

      const alreadyIn = existingMembers.some((row) => row.userId === userId);

      if (!alreadyIn) {
        await db.insert(trainingGroupMembers).values({
          id: generateId(),
          groupId,
          userId,
          serviceTag: m.serviceTag,
        });
        console.log(`Added ${m.email} to ${m.groupCode} with serviceTag ${m.serviceTag}`);
      }
    }

    // Find scenarios
    const scenarioList = await db
      .select({
        scenarioCode: scenarios.code,
        versionId: scenarioVersions.id,
      })
      .from(scenarios)
      .innerJoin(scenarioVersions, eq(scenarioVersions.scenarioId, scenarios.id))
      .orderBy(desc(scenarioVersions.version));

    const scenarioVersionByCode = new Map<string, string>();
    for (const s of scenarioList) {
      if (!scenarioVersionByCode.has(s.scenarioCode)) {
        scenarioVersionByCode.set(s.scenarioCode, s.versionId);
      }
    }

    const sip413Id = groupMap.get("SIP-413");
    const shift1Id = groupMap.get("DDS-SHIFT-1");
    const s015Version = scenarioVersionByCode.get("S-015");
    const s021Version = scenarioVersionByCode.get("S-021");
    const s034Version = scenarioVersionByCode.get("S-034");

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);

    // Group assignment 1
    if (sip413Id && s015Version) {
      const [existing] = await db
        .select()
        .from(trainingAssignments)
        .where(eq(trainingAssignments.groupId, sip413Id))
        .limit(1);

      if (!existing) {
        await db.insert(trainingAssignments).values({
          id: generateId(),
          title: "Отработка вызова 112: Пожар в жилом доме",
          scenarioVersionId: s015Version,
          groupId: sip413Id,
          type: "voice_call",
          cardSource: "mixed",
          answerNormSeconds: 240,
          passThreshold: 75,
          maxAttempts: 3,
          dueDate,
          status: "in_progress",
          createdBy: instructor1Id,
          launchedAt: new Date(),
        });
        console.log("Created assignment for SIP-413 (S-015)");
      }
    }

    // Group assignment 2
    if (shift1Id && s021Version) {
      const [existing] = await db
        .select()
        .from(trainingAssignments)
        .where(eq(trainingAssignments.groupId, shift1Id))
        .limit(1);

      if (!existing) {
        await db.insert(trainingAssignments).values({
          id: generateId(),
          title: "Комплексное реагирование ДДС: ДТП с пострадавшими",
          scenarioVersionId: s021Version,
          groupId: shift1Id,
          type: "voice_call",
          cardSource: "mixed",
          answerNormSeconds: 180,
          passThreshold: 80,
          maxAttempts: 3,
          dueDate,
          status: "in_progress",
          createdBy: instructor2Id,
          launchedAt: new Date(),
        });
        console.log("Created assignment for DDS-SHIFT-1 (S-021)");
      }
    }

    // Individual assignment for operator@system112.local
    const primaryOperatorId = userByEmail.get("operator@system112.local");
    if (primaryOperatorId && s034Version) {
      const [existing] = await db
        .select()
        .from(trainingAssignments)
        .where(eq(trainingAssignments.targetUserId, primaryOperatorId))
        .limit(1);

      if (!existing) {
        await db.insert(trainingAssignments).values({
          id: generateId(),
          title: "Индивидуальная практика: Потеря сознания",
          scenarioVersionId: s034Version,
          targetUserId: primaryOperatorId,
          type: "voice_call",
          cardSource: "mixed",
          answerNormSeconds: 200,
          passThreshold: 75,
          maxAttempts: 2,
          dueDate,
          status: "in_progress",
          createdBy: instructor1Id,
          launchedAt: new Date(),
        });
        console.log("Created personal assignment for operator@system112.local (S-034)");
      }
    }

    console.log("Groups, members, and assignments seeded successfully!");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
