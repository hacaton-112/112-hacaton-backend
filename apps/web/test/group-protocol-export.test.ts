import { describe, expect, it } from "bun:test";

import type { GroupStudent, TrainingAssignment, TrainingGroup } from "../src/contracts/training";
import { generateGroupProtocolCsv } from "../src/lib/group-protocol-export";

describe("generateGroupProtocolCsv", () => {
  const group: TrainingGroup = {
    id: "g-1",
    name: "Группа ДДС-101",
    code: "DDS-2026-01",
    organization: "ЦУКС ГУ МЧС",
    status: "active",
    memberCount: 2,
    members: [
      { userId: "u-1", serviceTag: "FIRE_101", joinedAt: "2026-09-01T00:00:00Z" },
      { userId: "u-2", serviceTag: "FIRE_101", joinedAt: "2026-09-01T00:00:00Z" },
    ],
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  };

  const students: GroupStudent[] = [
    {
      userId: "u-1",
      fullName: "Иванов Иван Иванович",
      email: "ivanov@mchs.gov.ru",
      role: "student",
      isActive: true,
      serviceTag: "FIRE_101",
      joinedAt: "2026-09-01T00:00:00Z",
      stats: {
        attempts: 5,
        completedAttempts: 5,
        evaluatedCalls: 4,
        passedCalls: 4,
        averageScore: 92,
        bestScore: 98,
        averageAnswerSeconds: 14,
        lastAttemptAt: "2026-09-15T12:00:00Z",
      },
    },
    {
      userId: "u-2",
      fullName: "Петров Пётр Сидорович",
      email: "petrov@mchs.gov.ru",
      role: "student",
      isActive: true,
      serviceTag: "FIRE_101",
      joinedAt: "2026-09-01T00:00:00Z",
      stats: {
        attempts: 3,
        completedAttempts: 3,
        evaluatedCalls: 2,
        passedCalls: 1,
        averageScore: 71,
        bestScore: 80,
        averageAnswerSeconds: 22,
        lastAttemptAt: "2026-09-14T15:30:00Z",
      },
    },
  ];

  const assignments: TrainingAssignment[] = [
    {
      id: "a-1",
      title: "Пожар на складе ГСМ",
      scenarioVersionId: "v-1",
      scenarioCode: "S-101",
      scenarioTitle: "Пожар повышенной сложности",
      category: "fire",
      difficulty: 3,
      groupId: "g-1",
      groupName: "Группа ДДС-101",
      targetUserId: null,
      type: "voice_call",
      cardSource: "ticket",
      serviceTag: "FIRE_101",
      answerNormSeconds: 15,
      passThreshold: 75,
      maxAttempts: 3,
      dueDate: null,
      status: "in_progress",
      usedAttempts: 8,
      launchedAt: "2026-09-10T09:00:00Z",
      completedAt: null,
      createdAt: "2026-09-10T08:00:00Z",
    },
  ];

  it("generates valid CSV with UTF-8 BOM and Windows CRLF", () => {
    const csv = generateGroupProtocolCsv({
      group,
      students,
      assignments,
      instructorName: "Майор Сергеев С.С.",
    });

    // Begins with UTF-8 BOM
    expect(csv.startsWith("\uFEFF")).toBe(true);

    // Contains passport header info
    expect(csv).toContain("ПРОТОКОЛ УЧЕБНЫХ ЗАНЯТИЙ И УСПЕВАЕМОСТИ ГРУППЫ");
    expect(csv).toContain("Группа;Группа ДДС-101");
    expect(csv).toContain("Шифр группы;DDS-2026-01");
    expect(csv).toContain("Организация;ЦУКС ГУ МЧС");
    expect(csv).toContain("Преподаватель;Майор Сергеев С.С.");

    // Contains summary stats
    expect(csv).toContain("Всего обучающихся;2");
    expect(csv).toContain("Всего назначенных занятий;1");
    expect(csv).toContain("Всего тренировочных звонков;8");
    expect(csv).toContain("Оценено звонков;6");
    expect(csv).toContain("Сдано выше порога;5 (83%)");

    // Contains assignments section
    expect(csv).toContain("НАЗНАЧЕННЫЕ ЗАНЯТИЯ");
    expect(csv).toContain("Пожар на складе ГСМ");
    expect(csv).toContain("S-101 · Пожар повышенной сложности");

    // Contains student table
    expect(csv).toContain("ВЕДОМОСТЬ ОБУЧАЮЩИХСЯ");
    expect(csv).toContain("Иванов Иван Иванович");
    expect(csv).toContain("petrov@mchs.gov.ru");

    // Check CRLF delimiter
    expect(csv).toContain("\r\n");
  });

  it("escapes semicolons and quotes properly in cells", () => {
    const customGroup: TrainingGroup = {
      ...group,
      name: 'Группа "Альфа;Бета"',
    };

    const csv = generateGroupProtocolCsv({
      group: customGroup,
      students: [],
      assignments: [],
    });

    expect(csv).toContain('Группа;"Группа ""Альфа;Бета"""');
  });
});
