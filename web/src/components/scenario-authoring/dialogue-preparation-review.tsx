import { Button, Card, Checkbox, Flex, Text, TextArea } from "@bolid-ui/themes";
import { useState } from "react";
import {
  DialogueEntriesSchema,
  type DialogueEntry,
  type DialoguePreparation,
} from "../../contracts/dialogue-preparation";
import type { ScenarioSeed } from "../../contracts/scenario-authoring";
export function DialoguePreparationReview({
  data,
  snapshot,
  disabled,
  onSave,
  onApprove,
}: {
  data: DialoguePreparation;
  snapshot: ScenarioSeed;
  disabled: boolean;
  onSave: (entries: DialogueEntry[]) => void;
  onApprove: () => void;
}) {
  const [entries, setEntries] = useState(data.entries);
  const dirty = JSON.stringify(entries) !== JSON.stringify(data.entries);
  const valid = DialogueEntriesSchema.safeParse(entries).success;
  return (
    <Flex direction="column" gap="3">
      <Text size="2">
        Один вопрос на строку, не более четырёх на факт. Проверьте, что вопросы
        действительно запрашивают соответствующий факт. Условия раскрытия из
        сценария продолжают действовать.
      </Text>
      {entries.map((entry, index) => {
        const fact = snapshot.facts.find((item) => item.key === entry.factKey)!;
        const update = (patch: Partial<DialogueEntry>) =>
          setEntries((items) =>
            items.map((item, position) =>
              position === index ? { ...item, ...patch } : item,
            ),
          );
        return (
          <Card key={entry.factKey}>
            <Flex direction="column" gap="2">
              <Text weight="bold">{fact.displayLabel}</Text>
              <label>
                Вопросы оператора
                <TextArea
                  aria-label={`Вопросы оператора: ${fact.displayLabel}`}
                  disabled={disabled}
                  value={entry.questions.join("\n")}
                  onChange={(event) =>
                    update({
                      questions: event.target.value
                        ? event.target.value.split("\n")
                        : [],
                    })
                  }
                />
              </label>
              <Text size="2">
                Ответ заявителя: {entry.acknowledge ? "Хорошо. " : ""}
                {fact.promptValue}
              </Text>
              <Text as="label" size="2" className="flex items-center gap-2">
                <Checkbox
                  checked={entry.acknowledge}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    update({ acknowledge: checked === true })
                  }
                />
                Начать ответ со слова «Хорошо»
              </Text>
            </Flex>
          </Card>
        );
      })}
      <Text size="2" color="gray">
        Содержание ответа меняется в разделе фактов сценария. После такого
        изменения подготовьте новый снимок. Свободную генерацию обстоятельств AI
        не выполняет.
      </Text>
      {!valid && (
        <Text color="amber">
          Проверьте вопросы: от 5 до 300 символов, без пустых строк, не более
          четырёх на факт.
        </Text>
      )}
      <Flex gap="2" wrap="wrap">
        <Button
          type="button"
          disabled={disabled || !dirty || !valid}
          onClick={() => onSave(entries)}
        >
          Сохранить правки
        </Button>
        <Button
          type="button"
          disabled={disabled || dirty || !valid}
          onClick={onApprove}
        >
          Тексты проверены — утвердить и озвучить
        </Button>
      </Flex>
      {dirty && <Text size="2">Перед утверждением сохраните правки.</Text>}
    </Flex>
  );
}
