import {
  Button,
  Callout,
  DatePicker,
  Dialog,
  Flex,
  Select,
  TextField,
} from "@bolid-ui/themes";
import { AlertTriangle } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { ScenarioSummary } from "../../contracts/call";
import {
  CardSourceSchema,
  type CardSource,
  type CreateTrainingAssignment,
  type TrainingAssignment,
  type TrainingAssignmentSettings,
  type AssignmentTarget,
} from "../../contracts/training";
import { TrainingField } from "./training-field";
import { CARD_SOURCE_LABELS } from "./training-labels";

/** Все службы группы — пустое значение Select, который не принимает `""`. */
const ALL_SERVICES = "all";

interface AssignmentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Кому назначается занятие: группе или одному ученику. */
  target: AssignmentTarget;
  /** Черновик на правку; без него диалог создаёт новое назначение. */
  assignment?: TrainingAssignment;
  scenarios: ScenarioSummary[];
  pending: boolean;
  error?: string;
  onCreate: (input: CreateTrainingAssignment) => void;
  onUpdate: (input: TrainingAssignmentSettings) => void;
}

/**
 * Параметры занятия группы: по какой версии сценария и по каким правилам.
 *
 * Правится только черновик, поэтому сценарий после создания не меняется — его
 * можно лишь пересоздать.
 */
export function AssignmentFormDialog(props: AssignmentFormDialogProps) {
  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={props.pending ? undefined : props.onOpenChange}
    >
      <Dialog.Content maxWidth="820px" className="w-[calc(100vw-2rem)] sm:max-w-[820px]">
        {/* Форма монтируется заново на каждое открытие со своим черновиком. */}
        {props.open && <AssignmentForm {...props} />}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function AssignmentForm({
  target,
  assignment,
  scenarios,
  pending,
  error,
  onCreate,
  onUpdate,
}: AssignmentFormDialogProps) {
  const isEdit = assignment !== undefined;
  const [mode, setMode] = useState<"voice_call" | "card_action">(
    assignment?.type === "card_action" ? "card_action" : "voice_call",
  );
  const [title, setTitle] = useState(assignment?.title ?? "");
  const [scenarioVersionId, setScenarioVersionId] = useState(
    assignment?.scenarioVersionId ?? "",
  );
  const [serviceTag, setServiceTag] = useState(
    assignment?.serviceTag ?? ALL_SERVICES,
  );
  const [cardSource, setCardSource] = useState<CardSource>(
    assignment?.cardSource ?? "generated",
  );
  const [answerNormSeconds, setAnswerNormSeconds] = useState(
    String(assignment?.answerNormSeconds ?? 240),
  );
  const [passThreshold, setPassThreshold] = useState(
    String(assignment?.passThreshold ?? 75),
  );
  const [maxAttempts, setMaxAttempts] = useState(
    assignment ? String(assignment.maxAttempts ?? "") : "3",
  );
  const [dueDate, setDueDate] = useState<Date | null>(
    assignment?.dueDate ? new Date(assignment.dueDate) : null,
  );

  const serviceTags = [
    ...new Set(
      target.kind === "group"
        ? target.group.members.map((member) => member.serviceTag)
        : [],
    ),
  ];
  const canSubmit =
    title.trim().length >= 2 &&
    (isEdit || scenarioVersionId !== "") &&
    !pending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    const settings: TrainingAssignmentSettings = {
      title: title.trim(),
      cardSource,
      // Служба сужает только групповое занятие.
      serviceTag:
        target.kind === "student" || serviceTag === ALL_SERVICES
          ? null
          : serviceTag,
      answerNormSeconds: Number(answerNormSeconds),
      passThreshold: Number(passThreshold),
      maxAttempts: maxAttempts === "" ? null : Number(maxAttempts),
      dueDate: dueDate?.toISOString() ?? null,
    };

    if (isEdit) {
      onUpdate(settings);
      return;
    }

    onCreate({
      ...settings,
      scenarioVersionId,
      type: mode,
      ...(target.kind === "group"
        ? { groupId: target.group.id }
        : { targetUserId: target.student.id }),
    });
  };

  return (
    <form onSubmit={submit}>
      <Dialog.Title>
        {isEdit ? "Изменить занятие" : "Новое занятие"}
      </Dialog.Title>
      <Dialog.Description size="2" mb="4" color="gray">
        {target.kind === "group"
          ? `Группа «${target.group.name}». Занятие создаётся черновиком: обучающиеся увидят его, когда вы запустите занятие.`
          : `Индивидуальное занятие для обучающегося ${target.student.fullName}. Оно создаётся черновиком: обучающийся увидит его, когда вы запустите занятие.`}
      </Dialog.Description>

      <div className="grid gap-4 sm:grid-cols-2">
        <TrainingField label="Режим занятия" className="sm:col-span-2">
          <Select.Root value={mode} disabled={isEdit} onValueChange={(value) => {
            const next = value === "card_action" ? "card_action" : "voice_call";
            setMode(next);
            setAnswerNormSeconds(next === "card_action" ? "30" : "240");
            if (next === "card_action") setCardSource("generated");
          }}>
            <Select.Trigger aria-label="Режим занятия" />
            <Select.Content>
              <Select.Item value="voice_call">Оператор 112 — голосовой звонок</Select.Item>
              <Select.Item value="card_action">Диспетчер ДДС — действия с карточкой</Select.Item>
            </Select.Content>
          </Select.Root>
        </TrainingField>
        <TrainingField label="Название занятия" className="sm:col-span-2">
          <TextField.Root
            required
            value={title}
            placeholder="Практика: пожар в жилом доме"
            onChange={(event) => setTitle(event.target.value)}
          />
        </TrainingField>

        {!isEdit && (
          <TrainingField label="Сценарий" className="sm:col-span-2">
            <Select.Root
              value={scenarioVersionId}
              onValueChange={setScenarioVersionId}
            >
              <Select.Trigger placeholder="Выберите сценарий" />
              <Select.Content>
                {scenarios.map((scenario) => (
                  <Select.Item
                    key={scenario.scenarioVersionId}
                    value={scenario.scenarioVersionId}
                  >
                    {scenario.code} · {scenario.title}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </TrainingField>
        )}

        {target.kind === "group" && (
          <TrainingField label="Служба обучающихся">
            <Select.Root value={serviceTag} onValueChange={setServiceTag}>
              <Select.Trigger />
              <Select.Content>
                <Select.Item value={ALL_SERVICES}>Все службы</Select.Item>
                {serviceTags.map((tag) => (
                  <Select.Item key={tag} value={tag}>
                    {tag}
                  </Select.Item>
                ))}
                {serviceTag !== ALL_SERVICES &&
                  !serviceTags.includes(serviceTag) && (
                    <Select.Item value={serviceTag}>{serviceTag}</Select.Item>
                  )}
              </Select.Content>
            </Select.Root>
          </TrainingField>
        )}

        <TrainingField label="Источник карточек">
          <Select.Root
            value={cardSource}
            onValueChange={(value) =>
              setCardSource(CardSourceSchema.parse(value))
            }
          >
            <Select.Trigger />
            <Select.Content>
              {CardSourceSchema.options.filter((source) => mode !== "card_action" || source === "generated" || source === "ticket").map((source) => (
                <Select.Item key={source} value={source}>
                  {CARD_SOURCE_LABELS[source]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </TrainingField>

        <TrainingField label="Норматив ответа, сек.">
          <TextField.Root
            required
            type="number"
            min={1}
            value={answerNormSeconds}
            onChange={(event) => setAnswerNormSeconds(event.target.value)}
          />
        </TrainingField>

        <TrainingField label="Проходной балл, %">
          <TextField.Root
            required
            type="number"
            min={50}
            max={100}
            value={passThreshold}
            onChange={(event) => setPassThreshold(event.target.value)}
          />
        </TrainingField>

        <TrainingField label="Лимит попыток (пусто — без лимита)">
          <TextField.Root
            type="number"
            min={1}
            max={100}
            value={maxAttempts}
            onChange={(event) => setMaxAttempts(event.target.value)}
          />
        </TrainingField>

        <TrainingField label="Срок выполнения">
          <DatePicker
            className="w-full"
            aria-label="Срок выполнения"
            placeholder="дд.мм.гггг"
            value={dueDate}
            minValue={new Date()}
            onChange={(value) =>
              setDueDate(value instanceof Date ? value : null)
            }
          />
        </TrainingField>
      </div>

      {error && (
        <Callout.Root color="red" size="1" mt="3" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      <Flex justify="end" gap="2" mt="4">
        <Dialog.Close>
          <Button type="button" variant="soft" color="gray" disabled={pending}>
            Отмена
          </Button>
        </Dialog.Close>
        <Button type="submit" disabled={!canSubmit}>
          {isEdit ? "Сохранить" : "Создать"}
        </Button>
      </Flex>
    </form>
  );
}
