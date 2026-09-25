import { Link, Separator, Text } from "@bolid-ui/themes";

import {
  CATEGORY_LABELS,
  EMERGENCY_SERVICES,
  LOCATOR_ACCURACIES,
  LOCATOR_ACCURACY_LABELS,
  QWEN_TTS_VOICES,
  SCENARIO_CATEGORIES,
  SERVICE_LABELS,
  TERRAIN_LABELS,
  TERRAIN_TYPES,
  type ScenarioSeed,
} from "../../contracts/scenario-authoring";
import {
  BooleanInput,
  ChipsInput,
  FieldGrid,
  NumberInput,
  SectionCard,
  SelectInput,
  TextAreaInput,
  TextInput,
} from "./scenario-form-fields";
import { ScenarioLocationMap } from "./scenario-location-map";
import {
  hasSelectedCoordinates,
  type ScenarioCoordinates,
} from "./scenario-location-values";

interface ScenarioSectionProps {
  scenario: ScenarioSeed;
  onChange: (scenario: ScenarioSeed) => void;
}

/** Поле на всю ширину сетки, сколько бы в ней ни было колонок. */
const FULL_ROW = "md:col-span-full";

export function ScenarioBasicsSection({
  scenario,
  onChange,
  codeLocked = false,
}: ScenarioSectionProps & {
  /** При правке код — личность сценария и не меняется. */
  codeLocked?: boolean;
}) {
  return (
    <SectionCard
      title="Основное"
      description="Название в каталоге и параметры сложности тренировки"
    >
      <FieldGrid>
        <TextInput
          label="Код сценария"
          path="code"
          hint={
            codeLocked ? "не меняется при правке" : "уникальный, до 32 символов"
          }
          value={scenario.code}
          placeholder="S-FIRE-03"
          maxLength={32}
          disabled={codeLocked}
          onChange={(code) =>
            onChange({
              ...scenario,
              code,
              persona: {
                ...scenario.persona,
                code:
                  scenario.persona.code === "" ||
                  scenario.persona.code ===
                    `${scenario.code.toLowerCase()}-caller`
                    ? `${code.toLowerCase()}-caller`
                    : scenario.persona.code,
              },
            })
          }
        />
        <TextInput
          label="Название"
          path="title"
          value={scenario.title}
          placeholder="Пожар в учебной мастерской"
          maxLength={120}
          onChange={(title) => onChange({ ...scenario, title })}
        />
        <SelectInput
          label="Категория"
          path="category"
          value={scenario.category}
          options={SCENARIO_CATEGORIES.map((value) => ({
            value,
            label: CATEGORY_LABELS[value],
          }))}
          onChange={(category) => onChange({ ...scenario, category })}
        />
        <NumberInput
          label="Сложность"
          path="difficulty"
          hint="от 1 до 5"
          value={scenario.difficulty}
          min={1}
          max={5}
          onChange={(difficulty) => onChange({ ...scenario, difficulty })}
        />
        <TextAreaInput
          className={FULL_ROW}
          label="Краткое описание"
          path="summary"
          value={scenario.summary}
          placeholder="Что происходит и чему должен научиться оператор"
          maxLength={400}
          onChange={(summary) => onChange({ ...scenario, summary })}
        />
      </FieldGrid>
    </SectionCard>
  );
}

export function ScenarioPersonaSection({
  scenario,
  onChange,
}: ScenarioSectionProps) {
  const voices = QWEN_TTS_VOICES.filter(
    (voice) => voice.gender === scenario.persona.gender,
  );
  const updatePersona = (patch: Partial<ScenarioSeed["persona"]>) =>
    onChange({ ...scenario, persona: { ...scenario.persona, ...patch } });

  return (
    <SectionCard
      title="Заявитель и голос"
      description="Персона задаёт манеру разговора, а сценарий — уровень паники и голос TTS"
    >
      <FieldGrid>
        <TextInput
          label="Код персоны"
          path="persona.code"
          value={scenario.persona.code}
          placeholder="s-fire-03-caller"
          maxLength={64}
          onChange={(code) => updatePersona({ code })}
        />
        <SelectInput
          label="Пол"
          path="persona.gender"
          value={scenario.persona.gender}
          options={[
            { value: "female", label: "Женский" },
            { value: "male", label: "Мужской" },
          ]}
          onChange={(gender) => {
            const matchingVoice = QWEN_TTS_VOICES.find(
              (voice) => voice.gender === gender,
            );
            updatePersona({
              gender,
              voiceId: matchingVoice?.id ?? scenario.persona.voiceId,
            });
          }}
        />
        <TextInput
          label="Имя"
          path="persona.displayName"
          value={scenario.persona.displayName}
          placeholder="Елена Учебная"
          maxLength={120}
          onChange={(displayName) => updatePersona({ displayName })}
        />
        <NumberInput
          label="Возраст"
          path="persona.ageYears"
          value={scenario.persona.ageYears}
          min={1}
          max={110}
          onChange={(ageYears) => updatePersona({ ageYears })}
        />
        <SelectInput
          label="Голос TTS"
          path="persona.voiceId"
          value={scenario.persona.voiceId}
          options={voices.map((voice) => ({
            value: voice.id,
            label: voice.id,
          }))}
          onChange={(voiceId) => updatePersona({ voiceId })}
        />
        <TextInput
          label="Фоновый звук"
          path="persona.backgroundSounds"
          value={scenario.persona.backgroundSounds ?? ""}
          placeholder="Сирена во дворе"
          maxLength={200}
          onChange={(backgroundSounds) => updatePersona({ backgroundSounds })}
        />
        <TextInput
          className={FULL_ROW}
          label="Состояние заявителя"
          path="persona.condition"
          value={scenario.persona.condition}
          placeholder="Напугана, находится снаружи"
          maxLength={200}
          onChange={(condition) => updatePersona({ condition })}
        />
        <TextAreaInput
          className={FULL_ROW}
          label="Манера речи"
          path="persona.speechStyle"
          value={scenario.persona.speechStyle}
          placeholder="Короткие фразы, сбивается, отвечает по существу..."
          maxLength={2_000}
          onChange={(speechStyle) => updatePersona({ speechStyle })}
        />
        <NumberInput
          label="Начальная паника"
          path="persona.baselinePanicLevel"
          hint="0–4"
          value={scenario.persona.baselinePanicLevel}
          min={0}
          max={4}
          onChange={(baselinePanicLevel) =>
            updatePersona({ baselinePanicLevel })
          }
        />
        <NumberInput
          label="Базовый темп речи"
          path="persona.baseSpeechRate"
          hint="0.5–2"
          value={scenario.persona.baseSpeechRate}
          min={0.5}
          max={2}
          step={0.05}
          onChange={(baseSpeechRate) => updatePersona({ baseSpeechRate })}
        />
      </FieldGrid>
    </SectionCard>
  );
}

export function ScenarioCallSection({
  scenario,
  onChange,
}: ScenarioSectionProps) {
  const updateVersion = (patch: Partial<ScenarioSeed["version"]>) =>
    onChange({ ...scenario, version: { ...scenario.version, ...patch } });

  return (
    <SectionCard
      title="Ход звонка"
      description="Реплики и числовые ограничения проверяются до публикации и затем становятся частью неизменяемой версии"
    >
      <FieldGrid>
        <TextAreaInput
          label="Первая реплика"
          path="version.openingLine"
          hint="воспроизводится без LLM"
          value={scenario.version.openingLine}
          maxLength={500}
          onChange={(openingLine) => updateVersion({ openingLine })}
        />
        <TextAreaInput
          label="Безопасная запасная реплика"
          path="version.fallbackLine"
          hint="не раскрывает скрытых фактов"
          value={scenario.version.fallbackLine}
          maxLength={500}
          onChange={(fallbackLine) => updateVersion({ fallbackLine })}
        />
      </FieldGrid>

      <FieldGrid lg="4" className="mt-3">
        <NumberInput
          label="Паника: минимум"
          path="version.panicFloor"
          value={scenario.version.panicFloor}
          min={0}
          max={4}
          onChange={(panicFloor) => updateVersion({ panicFloor })}
        />
        <NumberInput
          label="Паника: максимум"
          path="version.panicCeiling"
          value={scenario.version.panicCeiling}
          min={0}
          max={4}
          onChange={(panicCeiling) => updateVersion({ panicCeiling })}
        />
        <NumberInput
          label="Макс. перебиваний"
          path="version.maxInterruptions"
          value={scenario.version.maxInterruptions}
          min={0}
          max={20}
          onChange={(maxInterruptions) => updateVersion({ maxInterruptions })}
        />
        <NumberInput
          label="Инициатива через, сек"
          path="version.initiativeCooldownSeconds"
          value={scenario.version.initiativeCooldownSeconds}
          min={1}
          max={120}
          onChange={(initiativeCooldownSeconds) =>
            updateVersion({ initiativeCooldownSeconds })
          }
        />
        <NumberInput
          label="Норматив, сек"
          path="version.answerNormSeconds"
          value={scenario.version.answerNormSeconds}
          min={30}
          max={1_800}
          onChange={(answerNormSeconds) => updateVersion({ answerNormSeconds })}
        />
        <NumberInput
          label="Ожидаемая длительность, сек"
          path="version.expectedDurationSeconds"
          value={scenario.version.expectedDurationSeconds}
          min={30}
          max={3_600}
          onChange={(expectedDurationSeconds) =>
            updateVersion({ expectedDurationSeconds })
          }
        />
        <NumberInput
          label="Проходной балл"
          path="version.passThreshold"
          value={scenario.version.passThreshold}
          min={0}
          max={100}
          onChange={(passThreshold) => updateVersion({ passThreshold })}
        />
      </FieldGrid>

      <Separator size="4" my="4" />

      <ChipsInput
        label="Ожидаемые службы"
        path="version.expectedServices"
        value={scenario.version.expectedServices}
        options={EMERGENCY_SERVICES.map((service) => ({
          value: service,
          label: SERVICE_LABELS[service],
        }))}
        onChange={(expectedServices) => updateVersion({ expectedServices })}
      />
    </SectionCard>
  );
}

export function ScenarioLocationSection({
  scenario,
  onChange,
  onIncidentPointSelected,
  geocodingStatus,
  geocodingMessage,
}: ScenarioSectionProps & {
  onIncidentPointSelected: (coordinates: ScenarioCoordinates) => void;
  geocodingStatus: "idle" | "loading" | "success" | "error";
  geocodingMessage?: string;
}) {
  const updateLocation = (patch: Partial<ScenarioSeed["location"]>) =>
    onChange({ ...scenario, location: { ...scenario.location, ...patch } });
  const updateAddress = (key: string, value: string) =>
    updateLocation({
      exactAddress: { ...scenario.location.exactAddress, [key]: value },
    });

  return (
    <SectionCard
      title="Место происшествия"
      description="Этот раздел заполняет преподаватель. ИИ не получает и не изменяет адрес, координаты или радиус"
    >
      <ScenarioLocationMap
        exactPoint={scenario.location.exactPoint}
        locatorCenter={scenario.location.locatorCenter}
        radiusMeters={scenario.location.locatorRadiusMeters}
        onSelect={(target, coordinates) => {
          if (target === "incident") {
            updateLocation({
              exactPoint: coordinates,
              ...(!hasSelectedCoordinates(scenario.location.locatorCenter)
                ? { locatorCenter: coordinates }
                : {}),
            });
            onIncidentPointSelected(coordinates);
            return;
          }

          updateLocation({ locatorCenter: coordinates });
        }}
      />

      <FieldGrid lg="4" className="mt-3">
        <NumberInput
          label="Радиус области, м"
          path="location.locatorRadiusMeters"
          value={scenario.location.locatorRadiusMeters}
          min={10}
          max={50_000}
          onChange={(locatorRadiusMeters) =>
            updateLocation({ locatorRadiusMeters })
          }
        />
        <SelectInput
          label="Точность геолокации"
          path="location.locatorAccuracy"
          value={scenario.location.locatorAccuracy}
          options={LOCATOR_ACCURACIES.map((value) => ({
            value,
            label: LOCATOR_ACCURACY_LABELS[value],
          }))}
          onChange={(locatorAccuracy) => updateLocation({ locatorAccuracy })}
        />
        <SelectInput
          label="Тип местности"
          path="location.terrain"
          value={scenario.location.terrain}
          options={TERRAIN_TYPES.map((value) => ({
            value,
            label: TERRAIN_LABELS[value],
          }))}
          onChange={(terrain) => updateLocation({ terrain })}
        />
        <TextInput
          label="Телефон заявителя"
          path="location.callerNumber"
          value={scenario.location.callerNumber}
          placeholder="+7 (___) ___-__-__"
          maxLength={32}
          onChange={(callerNumber) => updateLocation({ callerNumber })}
        />
        <NumberInput
          label="Точная широта"
          path="location.exactPoint.0"
          value={scenario.location.exactPoint[0]}
          min={-90}
          max={90}
          step={0.000001}
          onChange={(lat) =>
            updateLocation({
              exactPoint: [lat, scenario.location.exactPoint[1]],
            })
          }
        />
        <NumberInput
          label="Точная долгота"
          path="location.exactPoint.1"
          value={scenario.location.exactPoint[1]}
          min={-180}
          max={180}
          step={0.000001}
          onChange={(lon) =>
            updateLocation({
              exactPoint: [scenario.location.exactPoint[0], lon],
            })
          }
        />
        <NumberInput
          label="Центр области: широта"
          path="location.locatorCenter.0"
          value={scenario.location.locatorCenter[0]}
          min={-90}
          max={90}
          step={0.000001}
          onChange={(lat) =>
            updateLocation({
              locatorCenter: [lat, scenario.location.locatorCenter[1]],
            })
          }
        />
        <NumberInput
          label="Центр области: долгота"
          path="location.locatorCenter.1"
          value={scenario.location.locatorCenter[1]}
          min={-180}
          max={180}
          step={0.000001}
          onChange={(lon) =>
            updateLocation({
              locatorCenter: [scenario.location.locatorCenter[0], lon],
            })
          }
        />
      </FieldGrid>

      <Separator size="4" my="4" />

      <Text
        as="p"
        size="2"
        mb="3"
        color={
          geocodingStatus === "error"
            ? "red"
            : geocodingStatus === "success"
              ? "green"
              : "gray"
        }
        role="status"
        aria-live="polite"
      >
        {geocodingStatus === "loading"
          ? "Определяем город и улицу по координатам…"
          : geocodingStatus === "success"
            ? `Адрес определён по карте: ${geocodingMessage ?? "проверьте заполненные поля"}`
            : geocodingStatus === "error"
              ? (geocodingMessage ??
                "Не удалось определить адрес. Введите город и улицу вручную.")
              : "После выбора точки город и улица определятся автоматически. Поля останутся редактируемыми."}
      </Text>
      <FieldGrid lg="4">
        <TextInput
          label="Город"
          path="location.exactAddress.city"
          value={scenario.location.exactAddress.city ?? ""}
          onChange={(value) => updateAddress("city", value)}
        />
        <TextInput
          label="Улица"
          path="location.exactAddress.street"
          value={scenario.location.exactAddress.street ?? ""}
          onChange={(value) => updateAddress("street", value)}
        />
        <TextInput
          label="Дом"
          path="location.exactAddress.house"
          value={scenario.location.exactAddress.house ?? ""}
          onChange={(value) => updateAddress("house", value)}
        />
        <TextInput
          label="Дополнительные детали адреса"
          path="location.exactAddress.details"
          value={scenario.location.exactAddress.details ?? ""}
          onChange={(value) => updateAddress("details", value)}
        />
        <TextInput
          className={FULL_ROW}
          label="Подпись области геолокации"
          path="location.locatorLabel"
          value={scenario.location.locatorLabel}
          placeholder="Базовая станция: Учебный квартал"
          maxLength={200}
          onChange={(locatorLabel) => updateLocation({ locatorLabel })}
        />
      </FieldGrid>
      {/* Данные адреса приходят из OpenStreetMap: лицензия ODbL требует
          указывать источник рядом с результатом. */}
      {(geocodingStatus === "success" || geocodingStatus === "loading") && (
        <Text as="p" size="1" color="gray" mt="3">
          Адресные данные:{" "}
          <Link
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            color="gray"
          >
            © OpenStreetMap contributors
          </Link>
        </Text>
      )}
      <div className="mt-3">
        <BooleanInput
          label="Заявитель уже обращался по этому происшествию"
          path="location.previouslyCalled"
          checked={scenario.location.previouslyCalled}
          onChange={(previouslyCalled) => updateLocation({ previouslyCalled })}
        />
      </div>
    </SectionCard>
  );
}
