import {
  Button,
  Callout,
  Checkbox,
  Dialog,
  Flex,
  Spinner,
  Text,
  TextArea,
  TextField,
  toast,
} from "@bolid-ui/themes";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Eye,
  FilePenLine,
  Plus,
  Trash2,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import { ROLE_LABELS } from "../../config/roles";
import type { UserRole } from "../../contracts/auth";
import {
  MethodicalMaterialInputSchema,
  type MethodicalMaterial,
  type MethodicalMaterialInput,
} from "../../contracts/methodical-materials";
import type { MethodicalAuthoringMutations } from "../../hooks/use-methodical-materials";
import { TrainingField } from "../training/training-field";
import { MarkdownContent } from "./markdown-content";

const AUTHORING_ROLES: readonly UserRole[] = [
  "operator",
  "instructor",
  "admin",
];

type EditorSection = MethodicalMaterialInput["sections"][number] & {
  editorKey: string;
};

interface MethodicalMaterialEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material?: MethodicalMaterial;
  mutations: MethodicalAuthoringMutations;
  onSaved: (material: MethodicalMaterial) => void;
}

export function MethodicalMaterialEditorDialog({
  open,
  onOpenChange,
  material,
  mutations,
  onSaved,
}: MethodicalMaterialEditorDialogProps) {
  const pending = mutations.create.isPending || mutations.update.isPending;
  return (
    <Dialog.Root open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <Dialog.Content
        maxWidth="1180px"
        className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto"
      >
        {open && (
          <MaterialEditorForm
            key={material?.id ?? "new-material"}
            material={material}
            mutations={mutations}
            onSaved={onSaved}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function MaterialEditorForm({
  material,
  mutations,
  onSaved,
  onCancel,
}: Pick<
  MethodicalMaterialEditorDialogProps,
  "material" | "mutations" | "onSaved"
> & { onCancel: () => void }) {
  const [title, setTitle] = useState(material?.title ?? "");
  const [description, setDescription] = useState(material?.description ?? "");
  const [audience, setAudience] = useState(material?.audience ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    material?.durationMinutes ?? 15,
  );
  const [roles, setRoles] = useState<UserRole[]>(
    material?.roles ?? ["operator"],
  );
  const [sections, setSections] = useState<EditorSection[]>(
    material?.sections.map((section) => ({
      id: section.id,
      title: section.title,
      summary: section.summary,
      contentMarkdown: section.contentMarkdown,
      editorKey: section.id,
    })) ?? [emptySection()],
  );
  const [activeKey, setActiveKey] = useState(sections[0]!.editorKey);
  const [validationError, setValidationError] = useState<string>();
  const saving = material ? mutations.update : mutations.create;
  const activeIndex = Math.max(
    0,
    sections.findIndex(({ editorKey }) => editorKey === activeKey),
  );
  const activeSection = sections[activeIndex]!;

  const updateActive = (changes: Partial<EditorSection>) => {
    setSections((current) =>
      current.map((section, index) =>
        index === activeIndex ? { ...section, ...changes } : section,
      ),
    );
  };

  const moveActive = (direction: -1 | 1) => {
    const nextIndex = activeIndex + direction;
    if (nextIndex < 0 || nextIndex >= sections.length) return;
    setSections((current) => {
      const reordered = [...current];
      [reordered[activeIndex], reordered[nextIndex]] = [
        reordered[nextIndex]!,
        reordered[activeIndex]!,
      ];
      return reordered;
    });
  };

  const removeActive = () => {
    if (sections.length === 1) return;
    const remaining = sections.filter((_, index) => index !== activeIndex);
    setSections(remaining);
    setActiveKey(
      remaining[Math.min(activeIndex, remaining.length - 1)]!.editorKey,
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setValidationError(undefined);
    const parsed = MethodicalMaterialInputSchema.safeParse({
      title,
      description,
      audience,
      durationMinutes,
      roles,
      sections: sections.map((section) => ({
        ...(section.id ? { id: section.id } : {}),
        title: section.title,
        summary: section.summary,
        contentMarkdown: section.contentMarkdown,
      })),
    });
    if (!parsed.success) {
      setValidationError(
        parsed.error.issues[0]?.message ?? "Проверьте заполнение полей",
      );
      return;
    }

    try {
      const saved = material
        ? await mutations.update.mutateAsync({
            materialId: material.id,
            material: parsed.data,
          })
        : await mutations.create.mutateAsync(parsed.data);
      toast.success(material ? "Материал обновлён" : "Материал создан", {
        description: saved.title,
      });
      onSaved(saved);
    } catch {
      // Текст серверной ошибки остаётся в диалоге.
    }
  };

  return (
    <form onSubmit={submit}>
      <Dialog.Title>
        {material ? "Редактирование материала" : "Новый методический материал"}
      </Dialog.Title>
      <Dialog.Description size="2" mb="4" color="gray">
        Текст разделов хранится в Markdown. Справа сразу показано, как его
        увидит обучающийся.
      </Dialog.Description>

      <div className="grid gap-4 md:grid-cols-2">
        <TrainingField label="Название" className="md:col-span-2">
          <TextField.Root
            required
            autoFocus
            value={title}
            placeholder="Порядок приёма вызова Системы-112"
            onChange={(event) => setTitle(event.target.value)}
          />
        </TrainingField>
        <TrainingField label="Краткое описание">
          <TextField.Root
            required
            value={description}
            placeholder="Что изучит пользователь"
            onChange={(event) => setDescription(event.target.value)}
          />
        </TrainingField>
        <TrainingField label="Аудитория">
          <TextField.Root
            required
            value={audience}
            placeholder="Операторы и диспетчеры ДДС"
            onChange={(event) => setAudience(event.target.value)}
          />
        </TrainingField>
        <TrainingField label="Продолжительность, минут">
          <TextField.Root
            required
            type="number"
            min={1}
            max={480}
            value={String(durationMinutes)}
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
          />
        </TrainingField>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Доступно ролям</legend>
          <Flex gap="3" wrap="wrap">
            {AUTHORING_ROLES.map((role) => (
              <label
                key={role}
                className="flex cursor-pointer items-center gap-2"
              >
                <Checkbox
                  checked={roles.includes(role)}
                  onCheckedChange={(checked) =>
                    setRoles((current) =>
                      checked === true
                        ? [...current, role]
                        : current.filter((value) => value !== role),
                    )
                  }
                />
                <Text size="2">{ROLE_LABELS[role]}</Text>
              </label>
            ))}
          </Flex>
        </fieldset>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-(--radius-3) border border-(--gray-a5) p-3">
          <Flex align="center" justify="between" mb="3">
            <Text size="2" weight="bold">
              Разделы
            </Text>
            <Button
              type="button"
              size="1"
              variant="soft"
              onClick={() => {
                const section = emptySection();
                setSections((current) => [...current, section]);
                setActiveKey(section.editorKey);
              }}
            >
              <Plus size={14} /> Добавить
            </Button>
          </Flex>
          <div className="grid gap-2">
            {sections.map((section, index) => (
              <button
                key={section.editorKey}
                type="button"
                className={`cursor-pointer rounded-(--radius-2) border p-3 text-left ${section.editorKey === activeKey ? "border-(--accent-a8) bg-(--accent-a3)" : "border-(--gray-a5) hover:bg-(--gray-a2)"}`}
                onClick={() => setActiveKey(section.editorKey)}
              >
                <Text as="div" size="1" color="gray">
                  Раздел {index + 1}
                </Text>
                <Text as="div" size="2" weight="medium" mt="1">
                  {section.title || "Без названия"}
                </Text>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 rounded-(--radius-3) border border-(--gray-a5) p-4">
          <Flex align="center" justify="between" gap="2" mb="4" wrap="wrap">
            <Flex align="center" gap="2">
              <FilePenLine size={18} />
              <Text weight="bold">Раздел {activeIndex + 1}</Text>
            </Flex>
            <Flex gap="1">
              <Button
                type="button"
                size="1"
                variant="soft"
                color="gray"
                aria-label="Переместить раздел вверх"
                disabled={activeIndex === 0}
                onClick={() => moveActive(-1)}
              >
                <ArrowUp size={15} />
              </Button>
              <Button
                type="button"
                size="1"
                variant="soft"
                color="gray"
                aria-label="Переместить раздел вниз"
                disabled={activeIndex === sections.length - 1}
                onClick={() => moveActive(1)}
              >
                <ArrowDown size={15} />
              </Button>
              <Button
                type="button"
                size="1"
                variant="soft"
                color="red"
                disabled={sections.length === 1}
                onClick={removeActive}
              >
                <Trash2 size={15} /> Удалить
              </Button>
            </Flex>
          </Flex>

          <div className="grid gap-4 md:grid-cols-2">
            <TrainingField label="Заголовок раздела">
              <TextField.Root
                required
                value={activeSection.title}
                onChange={(event) =>
                  updateActive({ title: event.target.value })
                }
              />
            </TrainingField>
            <TrainingField label="Краткое пояснение">
              <TextField.Root
                required
                value={activeSection.summary}
                onChange={(event) =>
                  updateActive({ summary: event.target.value })
                }
              />
            </TrainingField>
          </div>
          <div className="mt-4 grid min-h-[360px] gap-4 lg:grid-cols-2">
            <TrainingField label="Markdown">
              <TextArea
                required
                spellCheck
                // Разметку набирают моноширинным: так видно отступы списков и
                // цитат, а предпросмотр рядом показывает результат.
                className="h-[340px] font-mono"
                value={activeSection.contentMarkdown}
                placeholder={
                  "## Алгоритм\n\n1. Уточните адрес.\n2. Проверьте угрозы.\n\n> Важное примечание"
                }
                onChange={(event) =>
                  updateActive({ contentMarkdown: event.currentTarget.value })
                }
              />
            </TrainingField>
            <div className="min-w-0">
              <Flex align="center" gap="1" mb="2">
                <Eye size={15} />
                <Text size="2" weight="medium">
                  Предпросмотр
                </Text>
              </Flex>
              <div className="h-[340px] overflow-y-auto rounded-(--radius-2) border border-(--gray-a5) bg-(--gray-a1) p-4">
                {activeSection.contentMarkdown.trim() ? (
                  <MarkdownContent markdown={activeSection.contentMarkdown} />
                ) : (
                  <Text size="2" color="gray">
                    Начните вводить текст слева.
                  </Text>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      {(validationError || saving.error) && (
        <Callout.Root color="red" size="1" mt="4" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>
            {validationError ?? saving.error?.message}
          </Callout.Text>
        </Callout.Root>
      )}

      <Flex justify="end" gap="2" mt="5">
        <Button
          type="button"
          variant="soft"
          color="gray"
          disabled={saving.isPending}
          onClick={onCancel}
        >
          Отмена
        </Button>
        <Button type="submit" disabled={saving.isPending}>
          {saving.isPending && <Spinner size="1" />}
          {material ? "Сохранить изменения" : "Создать материал"}
        </Button>
      </Flex>
    </form>
  );
}

function emptySection(): EditorSection {
  return {
    editorKey: crypto.randomUUID(),
    title: "",
    summary: "",
    contentMarkdown: "",
  };
}
