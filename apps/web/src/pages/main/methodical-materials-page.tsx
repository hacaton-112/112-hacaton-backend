import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  ScrollArea,
  Spinner,
  Text,
} from "@bolid-ui/themes";
import {
  AlertTriangle,
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FilePlus2,
  Pencil,
  RotateCcw,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";

import { MarkdownContent } from "../../components/methodical-materials/markdown-content";
import { MethodicalMaterialEditorDialog } from "../../components/methodical-materials/methodical-material-editor-dialog";
import { canAuthorMethodicalMaterials } from "../../config/roles";
import type {
  MethodicalMaterial,
  MethodicalSection,
} from "../../contracts/methodical-materials";
import { useMethodicalMaterials } from "../../hooks/use-methodical-materials";
import { useAuthStore } from "../../stores/auth.store";

export default function MethodicalMaterialsPage() {
  const { materials, completion, authoring } = useMethodicalMaterials();
  const canAuthor = canAuthorMethodicalMaterials(
    useAuthStore((state) => state.user?.role),
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [expandedSectionId, setExpandedSectionId] = useState<string>();
  const [editor, setEditor] = useState<{
    material?: MethodicalMaterial;
  } | null>(null);

  const selected = useMemo(
    () =>
      materials.data?.find(
        (material) => material.id === (selectedId ?? materials.data?.[0]?.id),
      ),
    [materials.data, selectedId],
  );

  return (
    <ScrollArea className="h-full" type="auto" scrollbars="vertical">
      <main className="grid w-full gap-4 p-4 md:p-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <Flex align="center" gap="2">
              <BookOpenCheck size={24} aria-hidden />
              <Text
                as="div"
                role="heading"
                aria-level={1}
                size="6"
                weight="bold"
              >
                Методические материалы
              </Text>
            </Flex>
            <Text as="p" size="2" color="gray" mt="1">
              Алгоритмы работы, нормативы и чек-листы для учебных занятий
              Системы-112.
            </Text>
          </div>
          <Flex align="center" gap="2" wrap="wrap">
            {materials.data && materials.data.length > 0 && (
              <Badge size="2" color="blue" variant="soft">
                {overallCompleted(materials.data)} из{" "}
                {overallTotal(materials.data)} разделов изучено
              </Badge>
            )}
            {canAuthor && selected && (
              <Button
                type="button"
                variant="soft"
                color="gray"
                onClick={() => setEditor({ material: selected })}
              >
                <Pencil size={16} /> Редактировать
              </Button>
            )}
            {canAuthor && (
              <Button type="button" onClick={() => setEditor({})}>
                <FilePlus2 size={16} /> Создать материал
              </Button>
            )}
          </Flex>
        </header>

        {materials.error && !materials.data ? (
          <Callout.Root color="red" role="alert">
            <Callout.Icon>
              <AlertTriangle size={16} />
            </Callout.Icon>
            <Callout.Text>
              {materials.error.message}{" "}
              <Button
                size="1"
                color="red"
                variant="soft"
                onClick={() => void materials.refetch()}
              >
                Повторить
              </Button>
            </Callout.Text>
          </Callout.Root>
        ) : materials.isPending ? (
          <Flex align="center" justify="center" py="9">
            <Spinner size="3" />
          </Flex>
        ) : materials.data.length === 0 ? (
          <Card size="3">
            <Text color="gray">
              Для вашей роли пока нет доступных материалов.
            </Text>
          </Card>
        ) : (
          <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
            <nav
              className="grid content-start gap-2"
              aria-label="Разделы методических материалов"
            >
              {materials.data.map((material) => (
                <MaterialNavCard
                  key={material.id}
                  material={material}
                  selected={material.id === selected?.id}
                  onSelect={() => {
                    setSelectedId(material.id);
                    setExpandedSectionId(undefined);
                  }}
                />
              ))}
            </nav>
            {selected && (
              <MaterialContent
                material={selected}
                expandedSectionId={expandedSectionId}
                pendingSectionId={
                  completion.isPending
                    ? completion.variables.sectionId
                    : undefined
                }
                error={completion.error?.message}
                onToggleExpanded={(sectionId) =>
                  setExpandedSectionId((current) =>
                    current === sectionId ? undefined : sectionId,
                  )
                }
                onToggleCompleted={(section) =>
                  completion.mutate({
                    materialId: selected.id,
                    sectionId: section.id,
                    completed: !section.completed,
                  })
                }
              />
            )}
          </div>
        )}
      </main>
      {canAuthor && (
        <MethodicalMaterialEditorDialog
          open={editor !== null}
          material={editor?.material}
          mutations={authoring}
          onOpenChange={(open) => !open && setEditor(null)}
          onSaved={(saved) => {
            setSelectedId(saved.id);
            setExpandedSectionId(undefined);
            setEditor(null);
          }}
        />
      )}
    </ScrollArea>
  );
}

function MaterialNavCard({
  material,
  selected,
  onSelect,
}: {
  material: MethodicalMaterial;
  selected: boolean;
  onSelect: () => void;
}) {
  const percent = Math.round(
    (material.completedSections / material.totalSections) * 100,
  );
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`cursor-pointer rounded-(--radius-4) border p-4 text-left transition-colors ${selected ? "border-(--accent-a8) bg-(--accent-a3)" : "border-(--gray-a5) bg-(--color-panel-solid) hover:bg-(--gray-a2)"}`}
    >
      <Text as="div" size="2" weight="bold">
        {material.title}
      </Text>
      <Text as="div" size="1" color="gray" mt="1">
        {material.description}
      </Text>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-(--radius-full) bg-(--gray-a4)"
        aria-label={`Прогресс ${percent}%`}
      >
        <div
          className="h-full rounded-(--radius-full) bg-(--accent-9) transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <Text as="div" size="1" color="gray" mt="1">
        {material.completedSections} / {material.totalSections}
      </Text>
    </button>
  );
}

function MaterialContent({
  material,
  expandedSectionId,
  pendingSectionId,
  error,
  onToggleExpanded,
  onToggleCompleted,
}: {
  material: MethodicalMaterial;
  expandedSectionId?: string;
  pendingSectionId?: string;
  error?: string;
  onToggleExpanded: (sectionId: string) => void;
  onToggleCompleted: (section: MethodicalSection) => void;
}) {
  return (
    <Card size="3" variant="classic" className="min-w-0">
      <Flex direction="column" gap="2">
        <Text as="div" role="heading" aria-level={2} size="5" weight="bold">
          {material.title}
        </Text>
        <Text size="2" color="gray">
          {material.description}
        </Text>
        <Flex gap="3" wrap="wrap" mt="1">
          <Flex align="center" gap="1">
            <UsersRound size={14} />
            <Text size="1" color="gray">
              {material.audience}
            </Text>
          </Flex>
          <Flex align="center" gap="1">
            <Clock3 size={14} />
            <Text size="1" color="gray">
              ≈ {material.durationMinutes} мин
            </Text>
          </Flex>
        </Flex>
      </Flex>

      {error && (
        <Callout.Root color="red" size="1" mt="3" role="alert">
          <Callout.Icon>
            <AlertTriangle size={15} />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      <div className="mt-5 grid gap-3">
        {material.sections.map((section, index) => {
          const expanded = expandedSectionId === section.id;
          const pending = pendingSectionId === section.id;
          return (
            <section
              key={section.id}
              className={`overflow-hidden rounded-(--radius-3) border ${section.completed ? "border-(--green-a6)" : "border-(--gray-a5)"}`}
            >
              <button
                type="button"
                className="flex w-full cursor-pointer items-start gap-3 bg-(--gray-a2) p-4 text-left hover:bg-(--gray-a3)"
                aria-expanded={expanded}
                onClick={() => onToggleExpanded(section.id)}
              >
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${section.completed ? "bg-(--green-9) text-white" : "bg-(--gray-a4)"}`}
                >
                  {section.completed ? <Check size={15} /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <Text as="div" size="3" weight="bold">
                    {section.title}
                  </Text>
                  <Text as="div" size="2" color="gray" mt="1">
                    {section.summary}
                  </Text>
                </span>
                {expanded ? (
                  <ChevronDown size={18} />
                ) : (
                  <ChevronRight size={18} />
                )}
              </button>
              {expanded && (
                <div className="p-4 pt-3">
                  <MarkdownContent markdown={section.contentMarkdown} />
                  <Flex justify="end" mt="4">
                    <Button
                      type="button"
                      variant={section.completed ? "soft" : "solid"}
                      color={section.completed ? "gray" : undefined}
                      disabled={pendingSectionId !== undefined}
                      onClick={() => onToggleCompleted(section)}
                    >
                      {pending ? (
                        <Spinner size="1" />
                      ) : section.completed ? (
                        <RotateCcw size={15} />
                      ) : (
                        <Check size={15} />
                      )}
                      {section.completed
                        ? "Отметить неизученным"
                        : "Раздел изучен"}
                    </Button>
                  </Flex>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </Card>
  );
}

const overallCompleted = (materials: readonly MethodicalMaterial[]) =>
  materials.reduce((sum, material) => sum + material.completedSections, 0);
const overallTotal = (materials: readonly MethodicalMaterial[]) =>
  materials.reduce((sum, material) => sum + material.totalSections, 0);
