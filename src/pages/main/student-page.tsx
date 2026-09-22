import {
  Badge,
  Callout,
  Card,
  Flex,
  Heading,
  Skeleton,
  Tabs,
  Text,
} from "@bolid-ui/themes";
import { AlertTriangle } from "lucide-react";
import { useParams } from "react-router";

import { Breadcrumbs } from "../../components/ui/breadcrumbs";
import { InstructorCallsTable } from "../../components/training/instructor-calls-table";
import { StudentMethodicalMaterialsTab } from "../../components/training/student-methodical-materials";
import { InstructorDdsSummary } from "../../components/reports/instructor-dds-summary";
import { TrainingAssignmentsPanel } from "../../components/training/training-assignments-panel";
import {
  formatDateTime,
  formatDuration,
  formatScore,
} from "../../components/training/training-labels";
import { ROUTES } from "../../config/routes";
import type { StudentProfile } from "../../contracts/training";
import {
  useStudentProfile,
  useTrainingMutations,
} from "../../hooks/use-training";
import { useInstructorReport } from "../../hooks/use-reports";

/** Ученик: успеваемость по всем занятиям и разборы его звонков. */
export default function StudentPage() {
  const { groupId, userId = "" } = useParams();
  const profile = useStudentProfile(userId);
  const report = useInstructorReport(
    userId ? { scope: "student", operatorId: userId } : null,
  );

  const groupInfo = groupId
    ? profile.data?.student.groups.find((g) => g.groupId === groupId)
    : undefined;

  const breadcrumbItems = groupId
    ? [
        { label: "Группы", to: ROUTES.groups() },
        {
          label: groupInfo?.groupName ?? "Группа",
          to: ROUTES.group(groupId),
        },
        { label: profile.data?.student.fullName ?? "Ученик" },
      ]
    : [
        { label: "Ученики", to: ROUTES.students() },
        { label: profile.data?.student.fullName ?? "Ученик" },
      ];

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4 md:p-6">
      <Breadcrumbs items={breadcrumbItems} />

      {profile.error && !profile.data && (
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>
            Не удалось открыть ученика: {profile.error.message}
          </Callout.Text>
        </Callout.Root>
      )}

      {profile.isPending && (
        <Skeleton height="360px" className="rounded-(--radius-4)" />
      )}

      {profile.data && (
        <StudentContent profile={profile.data} dds={report.data?.dds} />
      )}
    </main>
  );
}

function StudentContent({
  profile,
  dds,
}: {
  profile: StudentProfile;
  dds?: import("../../contracts/reports").InstructorReport["dds"];
}) {
  const { student, stats, calls } = profile;
  const mutations = useTrainingMutations();

  const tiles = [
    { label: "Попыток", value: String(stats.attempts) },
    { label: "Завершено", value: String(stats.completedAttempts) },
    { label: "Средний балл", value: formatScore(stats.averageScore) },
    { label: "Лучший балл", value: formatScore(stats.bestScore) },
    {
      label: "Сдано выше порога",
      value: `${stats.passedCalls} из ${stats.evaluatedCalls}`,
    },
    {
      label: "Время ответа, сред.",
      value:
        stats.averageAnswerSeconds === null
          ? "—"
          : formatDuration(stats.averageAnswerSeconds),
    },
  ];

  return (
    <>
      <div>
        <Heading size="6">{student.fullName}</Heading>
        <Flex align="center" gap="2" wrap="wrap" mt="1">
          <Text size="2" color="gray">
            {student.email}
          </Text>
          {student.groups.map((group) => (
            <Badge key={group.groupId} variant="soft">
              {group.groupName} · {group.serviceTag}
            </Badge>
          ))}
          {profile.methodicalMaterials && (
            <Badge
              color={
                profile.methodicalMaterials.every(
                  (m) => m.completedSections === m.totalSections,
                )
                  ? "green"
                  : "blue"
              }
              variant="soft"
            >
              Методички:{" "}
              {profile.methodicalMaterials.reduce(
                (sum, m) => sum + m.completedSections,
                0,
              )}
              /
              {profile.methodicalMaterials.reduce(
                (sum, m) => sum + m.totalSections,
                0,
              )}
            </Badge>
          )}
        </Flex>
        {stats.lastAttemptAt && (
          <Text as="p" size="1" color="gray" mt="1">
            Последний звонок {formatDateTime(stats.lastAttemptAt)}
          </Text>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => (
          <Card key={tile.label} size="2">
            <Text as="p" size="1" color="gray">
              {tile.label}
            </Text>
            <Text as="p" size="5" weight="bold">
              {tile.value}
            </Text>
          </Card>
        ))}
      </div>

      {dds && <InstructorDdsSummary dds={dds} />}

      <Tabs.Root defaultValue="calls" className="flex min-h-0 flex-1 flex-col">
        <Tabs.List size="2">
          <Tabs.Trigger value="calls">Разборы</Tabs.Trigger>
          <Tabs.Trigger value="assignments">
            Индивидуальные занятия
          </Tabs.Trigger>
          <Tabs.Trigger value="materials">Методические материалы</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content
          value="calls"
          className="flex min-h-0 flex-1 flex-col pt-4"
        >
          <InstructorCallsTable calls={calls} backLabel="К ученику" />
        </Tabs.Content>
        <Tabs.Content
          value="assignments"
          className="flex min-h-0 flex-1 flex-col pt-4"
        >
          <TrainingAssignmentsPanel
            target={{
              kind: "student",
              student: { id: student.id, fullName: student.fullName },
            }}
            mutations={mutations}
          />
        </Tabs.Content>
        <Tabs.Content
          value="materials"
          className="flex min-h-0 flex-1 flex-col pt-4"
        >
          <StudentMethodicalMaterialsTab
            materials={profile.methodicalMaterials}
          />
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}
