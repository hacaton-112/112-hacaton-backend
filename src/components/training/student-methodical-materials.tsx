import {
  Badge,
  Card,
  Flex,
  Heading,
  Text,
} from "@bolid-ui/themes";
import { BookOpenCheck, CheckCircle2, Circle } from "lucide-react";

import type { MethodicalMaterial } from "../../contracts/methodical-materials";
import { formatDateTime } from "./training-labels";

interface StudentMethodicalMaterialsProps {
  materials?: MethodicalMaterial[];
}

export function StudentMethodicalMaterialsTab({
  materials = [],
}: StudentMethodicalMaterialsProps) {
  if (materials.length === 0) {
    return (
      <Card size="3">
        <Text color="gray">
          Нет доступных методических материалов для данного обучающегося.
        </Text>
      </Card>
    );
  }

  const totalSections = materials.reduce(
    (sum, material) => sum + material.totalSections,
    0,
  );
  const completedSections = materials.reduce(
    (sum, material) => sum + material.completedSections,
    0,
  );
  const overallPercent =
    totalSections > 0
      ? Math.round((completedSections / totalSections) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-4">
      <Card size="2">
        <Flex justify="between" align="center" wrap="wrap" gap="3">
          <Flex align="center" gap="2">
            <BookOpenCheck size={20} className="text-(--accent-9)" />
            <div>
              <Heading size="3">Готовность по методическим материалам</Heading>
              <Text size="2" color="gray">
                Изучено {completedSections} из {totalSections} разделов ({overallPercent}%)
              </Text>
            </div>
          </Flex>
          <Badge
            size="2"
            color={overallPercent === 100 ? "green" : overallPercent > 0 ? "blue" : "gray"}
            variant="soft"
          >
            {overallPercent === 100
              ? "Все материалы изучены"
              : overallPercent > 0
                ? "В процессе изучения"
                : "Не приступал"}
          </Badge>
        </Flex>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {materials.map((material) => {
          const percent =
            material.totalSections > 0
              ? Math.round(
                  (material.completedSections / material.totalSections) * 100,
                )
              : 0;

          return (
            <Card key={material.id} size="2" className="flex flex-col gap-3">
              <div>
                <Flex justify="between" align="start" gap="2">
                  <Text size="3" weight="bold">
                    {material.title}
                  </Text>
                  <Badge
                    size="1"
                    variant="surface"
                    color={percent === 100 ? "green" : "gray"}
                  >
                    {material.completedSections} / {material.totalSections}
                  </Badge>
                </Flex>
                <Text size="1" color="gray" mt="1">
                  {material.description}
                </Text>
              </div>

              <div
                className="h-2 w-full overflow-hidden rounded-(--radius-full) bg-(--gray-a4)"
                aria-label={`Прогресс ${percent}%`}
              >
                <div
                  className="h-full rounded-(--radius-full) bg-(--accent-9) transition-[width]"
                  style={{ width: `${percent}%` }}
                />
              </div>

              <div className="mt-1 flex flex-col gap-2 divide-y divide-(--gray-a4)">
                {material.sections.map((section) => (
                  <div
                    key={section.id}
                    className="flex items-center justify-between pt-2 text-sm"
                  >
                    <Flex align="center" gap="2" className="min-w-0">
                      {section.completed ? (
                        <CheckCircle2 size={16} className="shrink-0 text-(--green-9)" />
                      ) : (
                        <Circle size={16} className="shrink-0 text-(--gray-8)" />
                      )}
                      <Text
                        size="2"
                        truncate
                        color={section.completed ? undefined : "gray"}
                      >
                        {section.title}
                      </Text>
                    </Flex>
                    {section.completed && section.completedAt && (
                      <Text size="1" color="gray" className="shrink-0">
                        {formatDateTime(section.completedAt)}
                      </Text>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
