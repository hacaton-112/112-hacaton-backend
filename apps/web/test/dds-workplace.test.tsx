import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { DdsCardArmHeader } from "../src/components/dds/dds-card-arm-header";
import { DdsExerciseList } from "../src/components/dds/dds-exercise-list";
import type { DdsExercise } from "../src/contracts/dds-exercise";

const exercise = {
  id: "00000000-0000-4000-8000-000000001296",
  scenarioVersionId: "00000000-0000-4000-8000-000000000001",
  trainingAttemptId: "attempt-1",
  lessonId: null,
  sourceTrainingSessionId: "session-1",
  addressedService: "dds_03",
  status: "accepted",
  allowedTransitions: ["responding"],
  card: {
    scenarioCode: "101",
    title: "Наезд на пешехода",
    summary: "Пешеход получил травму ноги.",
    category: "traffic_accident",
    addressText: "Учебный город, Центральная улица, 12",
    latitude: 55.75,
    longitude: 37.61,
    callerName: "Учебный заявитель",
    callerPhone: "+7 000 000-00-00",
    incidentType: "ДТП с пострадавшим",
    description: "Автомобиль задел пешехода во дворе.",
    victimsTotal: 1,
    services: ["dds_01", "dds_03", "zhkh"],
  },
  acknowledgementDeadlineAt: "2026-09-27T12:01:00.000Z",
  acknowledgedAt: "2026-09-27T12:00:20.000Z",
  completedAt: null,
  createdAt: "2026-09-27T12:00:00.000Z",
  updatedAt: "2026-09-27T12:00:20.000Z",
  events: [
    {
      sequence: 1,
      eventId: "00000000-0000-4000-8000-000000000010",
      actorId: null,
      fromStatus: "pending",
      toStatus: "accepted",
      comment: null,
      occurredAt: "2026-09-27T12:00:20.000Z",
    },
  ],
  result: null,
  textEvaluation: null,
  crewHandoff: {
    notified: false,
    crews: [{ callsign: "Бригада 35", phoneNumber: "3035" }],
    calls: [],
    callMode: "handoff",
    nextReportStatus: null,
    selectedCrewPhoneNumber: null,
  },
} satisfies DdsExercise;

describe("DDS workplace", () => {
  it("renders the reference queue columns and an always-visible description", () => {
    const html = renderToStaticMarkup(
      <DdsExerciseList exercises={[exercise]} onSelect={() => undefined} />,
    );

    expect(html).toContain("Связи");
    expect(html).toContain("Опер.");
    expect(html).toContain("АРМ");
    expect(html).toContain("Статус службы");
    expect(html).toContain("Описание:");
    expect(html).toContain("Автомобиль задел пешехода во дворе.");
  });

  it("keeps service actions and the phone control inside the incident card", () => {
    const html = renderToStaticMarkup(
      <DdsCardArmHeader
        exercise={exercise}
        journalOpen={false}
        onToggleJournal={() => undefined}
        canEdit
        onEdit={() => undefined}
        onClose={() => undefined}
        phoneControl={<button type="button">Телефон ДДС</button>}
        serviceOverlay={<div>Контекст службы</div>}
      />,
    );

    expect(html).toContain("Происшествие 00001296");
    expect(html).toContain("просмотр");
    expect(html).toContain("дополнительно");
    expect(html).toContain("Телефон ДДС");
    expect(html).toContain("Контекст службы");
    expect(html).toContain('aria-label="Закрыть карточку"');
    expect(html).toContain("Скорая помощь");
  });
});
