import { Flex, Grid, Text } from "@bolid-ui/themes";

import {
  CARD_FIELD_LABELS,
  DISCLOSURE_LABELS,
  DISCLOSURE_TYPES,
  ESCALATION_TRIGGER_LABELS,
  ESCALATION_TRIGGERS,
  INCIDENT_CARD_FIELDS,
  type DisclosureRule,
  type EscalationRule,
  type MandatoryQuestion,
  type ReferenceCardField,
  type ScenarioFact,
  type ScenarioSeed,
} from "../../contracts/scenario-authoring";
import {
  AddButton,
  BooleanInput,
  FieldGrid,
  NumberInput,
  RemoveButton,
  SectionCard,
  SectionItem,
  SelectInput,
  TextAreaInput,
  TextInput,
} from "./scenario-form-fields";
import { ListInput } from "./scenario-list-input";

interface ScenarioSectionProps {
  scenario: ScenarioSeed;
  onChange: (scenario: ScenarioSeed) => void;
}

/** Поле на всю ширину сетки, сколько бы в ней ни было колонок. */
const FULL_ROW = "md:col-span-full";

/**
 * Строка правила с кнопкой удаления справа: поля в сетке, корзина — отдельной
 * колонкой, выровненной по полям, а не по подписям над ними.
 */
function RowWithRemove({
  children,
  onRemove,
  removeLabel,
}: {
  children: React.ReactNode;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <SectionItem>
      <Flex align="end" gap="3">
        <div className="min-w-0 flex-1">{children}</div>
        <RemoveButton label={removeLabel} onClick={onRemove} />
      </Flex>
    </SectionItem>
  );
}

const emptyFact = (index: number): ScenarioFact => ({
  key: `fact_${index + 1}`,
  promptValue: "",
  displayLabel: `Факт ${index + 1}`,
  severity: "normal",
  cardField: null,
  cardValue: null,
  contentKeywords: [],
  disclosure: { type: "on_question", keywords: ["уточните"] },
  priority: Math.max(0, 10 - index),
});

const disclosureFor = (
  type: (typeof DISCLOSURE_TYPES)[number],
): DisclosureRule => {
  switch (type) {
    case "on_question":
      return { type, keywords: ["уточните"] };
    case "after_turns":
      return { type, turns: 1 };
    case "below_panic":
      return { type, level: 2 };
    case "after_stage":
      return { type, stage: "conversation" };
    case "immediate":
    case "never":
      return { type };
  }
};

export function ScenarioFactsSection({
  scenario,
  onChange,
}: ScenarioSectionProps) {
  const updateFact = (index: number, patch: Partial<ScenarioFact>) => {
    const facts = [...scenario.facts];
    facts[index] = { ...facts[index], ...patch } as ScenarioFact;
    onChange({ ...scenario, facts });
  };

  return (
    <SectionCard
      title="Факты происшествия"
      description="Scenario Engine раскрывает только эти атомарные факты и только при выполнении заданного условия"
      actions={
        <AddButton
          disabled={scenario.facts.length >= 64}
          onClick={() =>
            onChange({
              ...scenario,
              facts: [...scenario.facts, emptyFact(scenario.facts.length)],
            })
          }
        >
          Факт
        </AddButton>
      }
    >
      <Grid gap="3">
        {scenario.facts.map((fact, index) => (
          <SectionItem
            key={index}
            index={index}
            title={fact.displayLabel || "Новый факт"}
            tone={fact.severity === "heavy" ? "red" : "gray"}
            removeLabel={`Удалить факт ${index + 1}`}
            removeDisabled={scenario.facts.length === 1}
            onRemove={() =>
              onChange({
                ...scenario,
                facts: scenario.facts.filter(
                  (_, factIndex) => factIndex !== index,
                ),
              })
            }
          >
            <FieldGrid lg="4">
              <TextInput
                label="Ключ"
                hint="латиницей"
                value={fact.key}
                onChange={(key) => updateFact(index, { key })}
              />
              <TextInput
                label="Название для преподавателя"
                value={fact.displayLabel}
                onChange={(displayLabel) => updateFact(index, { displayLabel })}
              />
              <SelectInput
                label="Критичность"
                value={fact.severity}
                options={[
                  { value: "normal", label: "Обычный" },
                  { value: "heavy", label: "Тяжёлый" },
                ]}
                onChange={(severity) => updateFact(index, { severity })}
              />
              <NumberInput
                label="Приоритет"
                value={fact.priority}
                min={0}
                max={100}
                onChange={(priority) => updateFact(index, { priority })}
              />
              <TextAreaInput
                className={FULL_ROW}
                label="Содержание факта для заявителя"
                hint="одна проверяемая подробность"
                value={fact.promptValue}
                maxLength={1_000}
                onChange={(promptValue) => updateFact(index, { promptValue })}
              />
              <SelectInput
                label="Поле карточки"
                value={fact.cardField ?? "none"}
                options={[
                  { value: "none", label: "Не переносить в карточку" },
                  ...INCIDENT_CARD_FIELDS.map((value) => ({
                    value,
                    label: CARD_FIELD_LABELS[value],
                  })),
                ]}
                onChange={(cardField) =>
                  updateFact(index, {
                    cardField: cardField === "none" ? null : cardField,
                    cardValue:
                      cardField === "none" ? null : (fact.cardValue ?? ""),
                  })
                }
              />
              <TextInput
                label="Эталонное значение"
                value={fact.cardValue ?? ""}
                hint={
                  fact.cardField === null
                    ? "поле карточки не выбрано"
                    : undefined
                }
                disabled={fact.cardField === null}
                onChange={(cardValue) => updateFact(index, { cardValue })}
              />
              <ListInput
                className="lg:col-span-2"
                label="Ключевые слова содержания"
                items={fact.contentKeywords}
                onChange={(contentKeywords) =>
                  updateFact(index, { contentKeywords })
                }
              />
              <SelectInput
                label="Условие раскрытия"
                value={fact.disclosure.type}
                options={DISCLOSURE_TYPES.map((value) => ({
                  value,
                  label: DISCLOSURE_LABELS[value],
                }))}
                onChange={(type) =>
                  updateFact(index, { disclosure: disclosureFor(type) })
                }
              />
              <DisclosureFields
                disclosure={fact.disclosure}
                onChange={(disclosure) => updateFact(index, { disclosure })}
              />
            </FieldGrid>
          </SectionItem>
        ))}
      </Grid>
    </SectionCard>
  );
}

function DisclosureFields({
  disclosure,
  onChange,
}: {
  disclosure: DisclosureRule;
  onChange: (disclosure: DisclosureRule) => void;
}) {
  switch (disclosure.type) {
    case "on_question":
      return (
        <ListInput
          className="lg:col-span-3"
          label="Слова в вопросе оператора"
          items={disclosure.keywords}
          onChange={(keywords) => onChange({ ...disclosure, keywords })}
        />
      );
    case "after_turns":
      return (
        <NumberInput
          label="После реплик заявителя"
          value={disclosure.turns}
          min={1}
          max={50}
          onChange={(turns) => onChange({ ...disclosure, turns })}
        />
      );
    case "below_panic":
      return (
        <NumberInput
          label="Паника не выше"
          value={disclosure.level}
          min={0}
          max={4}
          onChange={(level) => onChange({ ...disclosure, level })}
        />
      );
    case "after_stage":
      return (
        <SelectInput
          label="Этап звонка"
          value={disclosure.stage}
          options={[
            { value: "offered", label: "Вызов предложен" },
            { value: "conversation", label: "Разговор" },
            { value: "wrap_up", label: "Завершение" },
          ]}
          onChange={(stage) => onChange({ ...disclosure, stage })}
        />
      );
    case "immediate":
    case "never":
      return (
        <Text size="2" color="gray" className="self-end pb-2 lg:col-span-3">
          Дополнительные параметры не требуются.
        </Text>
      );
  }
}

const emptyQuestion = (): MandatoryQuestion => ({
  text: "",
  satisfiedByFactKeys: [],
  isCritical: false,
});

export function ScenarioQuestionsSection({
  scenario,
  onChange,
}: ScenarioSectionProps) {
  const updateQuestion = (index: number, patch: Partial<MandatoryQuestion>) => {
    const mandatoryQuestions = [...scenario.mandatoryQuestions];
    mandatoryQuestions[index] = {
      ...mandatoryQuestions[index],
      ...patch,
    } as MandatoryQuestion;
    onChange({ ...scenario, mandatoryQuestions });
  };
  const empty = scenario.mandatoryQuestions.length === 0;

  return (
    <SectionCard
      title="Обязательные вопросы"
      description={
        <>
          Вопрос считается закрытым только фактами из списка выше; оценка не
          зависит от LLM
          {empty && (
            <>
              <br />
              Обязательные вопросы пока не добавлены
            </>
          )}
        </>
      }
      actions={
        <AddButton
          disabled={scenario.mandatoryQuestions.length >= 32}
          onClick={() =>
            onChange({
              ...scenario,
              mandatoryQuestions: [
                ...scenario.mandatoryQuestions,
                emptyQuestion(),
              ],
            })
          }
        >
          Вопрос
        </AddButton>
      }
    >
      {empty ? undefined : (
        <Grid gap="3">
          {scenario.mandatoryQuestions.map((question, index) => (
            <RowWithRemove
              key={index}
              removeLabel={`Удалить вопрос ${index + 1}`}
              onRemove={() =>
                onChange({
                  ...scenario,
                  mandatoryQuestions: scenario.mandatoryQuestions.filter(
                    (_, questionIndex) => questionIndex !== index,
                  ),
                })
              }
            >
              <Grid
                gap="3"
                align="end"
                columns={{
                  initial: "1",
                  md: "minmax(0, 1fr) minmax(0, 1fr) auto",
                }}
              >
                <TextInput
                  label={`Вопрос ${index + 1}`}
                  value={question.text}
                  placeholder="Уточнить точный адрес происшествия"
                  onChange={(text) => updateQuestion(index, { text })}
                />
                <ListInput
                  label="Закрывается фактами"
                  hint="ключи через запятую"
                  items={question.satisfiedByFactKeys}
                  onChange={(satisfiedByFactKeys) =>
                    updateQuestion(index, { satisfiedByFactKeys })
                  }
                />
                <Flex align="center" className="h-9">
                  <BooleanInput
                    label="Критический"
                    checked={question.isCritical}
                    onChange={(isCritical) =>
                      updateQuestion(index, { isCritical })
                    }
                  />
                </Flex>
              </Grid>
            </RowWithRemove>
          ))}
        </Grid>
      )}
    </SectionCard>
  );
}

const paramsForTrigger = (
  trigger: (typeof ESCALATION_TRIGGERS)[number],
): EscalationRule["params"] => {
  switch (trigger) {
    case "operator_silence":
    case "norm_time_elapsed":
      return { seconds: 20 };
    case "question_repeated":
      return { times: 2 };
    case "forbidden_phrase":
    case "calming_phrase":
      return { keywords: ["спокойно"] };
    default:
      return undefined;
  }
};

const emptyEscalationRule = (): EscalationRule => ({
  trigger: "operator_silence",
  direction: "up",
  cooldownSeconds: 10,
  params: { seconds: 20 },
});

export function ScenarioEscalationSection({
  scenario,
  onChange,
}: ScenarioSectionProps) {
  const updateRule = (index: number, patch: Partial<EscalationRule>) => {
    const escalation = [...scenario.escalation];
    escalation[index] = { ...escalation[index], ...patch } as EscalationRule;
    onChange({ ...scenario, escalation });
  };

  return (
    <SectionCard
      title="Динамика паники"
      description="Каждое правило двигает состояние на одну ступень и проверяется движком детерминированно"
      actions={
        <AddButton
          disabled={scenario.escalation.length >= 32}
          onClick={() =>
            onChange({
              ...scenario,
              escalation: [...scenario.escalation, emptyEscalationRule()],
            })
          }
        >
          Правило
        </AddButton>
      }
    >
      {scenario.escalation.length > 0 && (
        <Grid gap="3">
          {scenario.escalation.map((rule, index) => (
            <RowWithRemove
              key={index}
              removeLabel={`Удалить правило ${index + 1}`}
              onRemove={() =>
                onChange({
                  ...scenario,
                  escalation: scenario.escalation.filter(
                    (_, ruleIndex) => ruleIndex !== index,
                  ),
                })
              }
            >
              <FieldGrid lg="4">
                <SelectInput
                  label="Событие"
                  value={rule.trigger}
                  options={ESCALATION_TRIGGERS.map((value) => ({
                    value,
                    label: ESCALATION_TRIGGER_LABELS[value],
                  }))}
                  onChange={(trigger) =>
                    updateRule(index, {
                      trigger,
                      params: paramsForTrigger(trigger),
                    })
                  }
                />
                <SelectInput
                  label="Направление"
                  value={rule.direction}
                  options={[
                    { value: "up", label: "Повысить панику" },
                    { value: "down", label: "Снизить панику" },
                  ]}
                  onChange={(direction) => updateRule(index, { direction })}
                />
                <NumberInput
                  label="Cooldown, сек"
                  value={rule.cooldownSeconds}
                  min={0}
                  max={600}
                  onChange={(cooldownSeconds) =>
                    updateRule(index, { cooldownSeconds })
                  }
                />
                <EscalationParams
                  rule={rule}
                  onChange={(params) => updateRule(index, { params })}
                />
              </FieldGrid>
            </RowWithRemove>
          ))}
        </Grid>
      )}
    </SectionCard>
  );
}

function EscalationParams({
  rule,
  onChange,
}: {
  rule: EscalationRule;
  onChange: (params: EscalationRule["params"]) => void;
}) {
  if (
    rule.trigger === "operator_silence" ||
    rule.trigger === "norm_time_elapsed"
  ) {
    return (
      <NumberInput
        label="Порог, сек"
        value={rule.params?.seconds ?? 20}
        min={1}
        max={600}
        onChange={(seconds) => onChange({ seconds })}
      />
    );
  }

  if (rule.trigger === "question_repeated") {
    return (
      <NumberInput
        label="Число повторов"
        value={rule.params?.times ?? 2}
        min={1}
        max={20}
        onChange={(times) => onChange({ times })}
      />
    );
  }

  if (
    rule.trigger === "forbidden_phrase" ||
    rule.trigger === "calming_phrase"
  ) {
    return (
      <ListInput
        label="Ключевые слова"
        items={rule.params?.keywords ?? []}
        onChange={(keywords) => onChange({ keywords })}
      />
    );
  }

  return (
    <Text size="2" color="gray" className="self-end pb-2">
      Без параметров
    </Text>
  );
}

const emptyReferenceField = (
  field: ReferenceCardField["field"],
): ReferenceCardField => ({
  field,
  expectedValue: "",
  acceptableValues: [],
  comparison: "normalized",
  isRequired: true,
  sourceFactKey: null,
});

export function ScenarioReferenceSection({
  scenario,
  onChange,
}: ScenarioSectionProps) {
  const unusedField = INCIDENT_CARD_FIELDS.find(
    (field) =>
      !scenario.referenceCard.fields.some((item) => item.field === field),
  );
  const updateField = (index: number, patch: Partial<ReferenceCardField>) => {
    const fields = [...scenario.referenceCard.fields];
    fields[index] = { ...fields[index], ...patch } as ReferenceCardField;
    onChange({
      ...scenario,
      referenceCard: { ...scenario.referenceCard, fields },
    });
  };

  return (
    <SectionCard
      title="Эталон и оценивание"
      description="Заполненная оператором карточка сравнивается с этими значениями воспроизводимыми правилами"
      actions={
        <AddButton
          disabled={!unusedField}
          onClick={() =>
            unusedField &&
            onChange({
              ...scenario,
              referenceCard: {
                ...scenario.referenceCard,
                fields: [
                  ...scenario.referenceCard.fields,
                  emptyReferenceField(unusedField),
                ],
              },
            })
          }
        >
          Поле
        </AddButton>
      }
    >
      <Grid gap="3">
        {scenario.referenceCard.fields.map((field, index) => (
          <RowWithRemove
            key={index}
            removeLabel={`Удалить поле эталона ${index + 1}`}
            onRemove={() =>
              onChange({
                ...scenario,
                referenceCard: {
                  ...scenario.referenceCard,
                  fields: scenario.referenceCard.fields.filter(
                    (_, fieldIndex) => fieldIndex !== index,
                  ),
                },
              })
            }
          >
            <FieldGrid lg="3">
              <SelectInput
                label="Поле карточки"
                value={field.field}
                options={INCIDENT_CARD_FIELDS.map((value) => ({
                  value,
                  label: CARD_FIELD_LABELS[value],
                }))}
                onChange={(nextField) =>
                  updateField(index, { field: nextField })
                }
              />
              <TextInput
                label="Ожидаемое значение"
                value={field.expectedValue}
                onChange={(expectedValue) =>
                  updateField(index, { expectedValue })
                }
              />
              <ListInput
                label="Допустимые варианты"
                items={field.acceptableValues}
                onChange={(acceptableValues) =>
                  updateField(index, { acceptableValues })
                }
              />
              <SelectInput
                label="Сравнение"
                value={field.comparison}
                options={[
                  { value: "exact", label: "Точное" },
                  { value: "normalized", label: "Нормализованное" },
                  { value: "contains", label: "Содержит" },
                  { value: "numeric_range", label: "Числовой диапазон" },
                ]}
                onChange={(comparison) => updateField(index, { comparison })}
              />
              <TextInput
                label="Источник-факт"
                value={field.sourceFactKey ?? ""}
                onChange={(sourceFactKey) =>
                  updateField(index, { sourceFactKey: sourceFactKey || null })
                }
              />
              <Flex align="end" className="pb-2">
                <BooleanInput
                  label="Обязательно"
                  checked={field.isRequired}
                  onChange={(isRequired) => updateField(index, { isRequired })}
                />
              </Flex>
            </FieldGrid>
          </RowWithRemove>
        ))}

        <TextAreaInput
          label="Примечания для разбора"
          value={scenario.referenceCard.notes ?? ""}
          maxLength={2_000}
          onChange={(notes) =>
            onChange({
              ...scenario,
              version: { ...scenario.version, referenceNotes: notes },
              referenceCard: { ...scenario.referenceCard, notes },
            })
          }
        />
      </Grid>
    </SectionCard>
  );
}
