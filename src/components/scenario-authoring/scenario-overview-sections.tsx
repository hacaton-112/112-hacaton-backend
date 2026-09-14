import { Flex } from "@bolid-ui/themes";

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
  NumberInput,
  SectionCard,
  SelectInput,
  TextAreaInput,
  TextInput,
} from "./scenario-form-fields";
import { ScenarioLocationMap } from "./scenario-location-map";
import { hasSelectedCoordinates } from "./scenario-location-values";

interface ScenarioSectionProps {
  scenario: ScenarioSeed;
  onChange: (scenario: ScenarioSeed) => void;
}

export function ScenarioBasicsSection({
  scenario,
  onChange,
}: ScenarioSectionProps) {
  return (
    <SectionCard
      title="Основное"
      description="Название в каталоге и параметры сложности тренировки."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <TextInput
          label="Код сценария"
          hint="уникальный, до 32 символов"
          value={scenario.code}
          placeholder="S-FIRE-03"
          maxLength={32}
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
          value={scenario.title}
          placeholder="Пожар в учебной мастерской"
          maxLength={120}
          onChange={(title) => onChange({ ...scenario, title })}
        />
        <SelectInput
          label="Категория"
          value={scenario.category}
          options={SCENARIO_CATEGORIES.map((value) => ({
            value,
            label: CATEGORY_LABELS[value],
          }))}
          onChange={(category) => onChange({ ...scenario, category })}
        />
        <NumberInput
          label="Сложность"
          hint="от 1 до 5"
          value={scenario.difficulty}
          min={1}
          max={5}
          onChange={(difficulty) => onChange({ ...scenario, difficulty })}
        />
        <TextAreaInput
          className="md:col-span-2"
          label="Краткое описание"
          value={scenario.summary}
          placeholder="Что происходит и чему должен научиться оператор"
          maxLength={400}
          onChange={(summary) => onChange({ ...scenario, summary })}
        />
      </div>
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

  return (
    <SectionCard
      title="Заявитель и голос"
      description="Персона задаёт манеру разговора, а сценарий — уровень паники и голос TTS."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <TextInput
          label="Код персоны"
          value={scenario.persona.code}
          placeholder="s-fire-03-caller"
          maxLength={64}
          onChange={(code) =>
            onChange({ ...scenario, persona: { ...scenario.persona, code } })
          }
        />
        <SelectInput
          label="Пол"
          value={scenario.persona.gender}
          options={[
            { value: "female", label: "Женский" },
            { value: "male", label: "Мужской" },
          ]}
          onChange={(gender) => {
            const matchingVoice = QWEN_TTS_VOICES.find(
              (voice) => voice.gender === gender,
            );
            onChange({
              ...scenario,
              persona: {
                ...scenario.persona,
                gender,
                voiceId: matchingVoice?.id ?? scenario.persona.voiceId,
              },
            });
          }}
        />
        <SelectInput
          label="Голос TTS"
          value={scenario.persona.voiceId}
          options={voices.map((voice) => ({
            value: voice.id,
            label: voice.id,
          }))}
          onChange={(voiceId) =>
            onChange({ ...scenario, persona: { ...scenario.persona, voiceId } })
          }
        />
        <TextInput
          label="Имя"
          value={scenario.persona.displayName}
          placeholder="Елена Учебная"
          maxLength={120}
          onChange={(displayName) =>
            onChange({
              ...scenario,
              persona: { ...scenario.persona, displayName },
            })
          }
        />
        <NumberInput
          label="Возраст"
          value={scenario.persona.ageYears}
          min={1}
          max={110}
          onChange={(ageYears) =>
            onChange({
              ...scenario,
              persona: { ...scenario.persona, ageYears },
            })
          }
        />
        <TextInput
          label="Фоновый звук"
          value={scenario.persona.backgroundSounds ?? ""}
          placeholder="Сирена во дворе"
          maxLength={200}
          onChange={(backgroundSounds) =>
            onChange({
              ...scenario,
              persona: { ...scenario.persona, backgroundSounds },
            })
          }
        />
        <TextInput
          className="md:col-span-2 lg:col-span-3"
          label="Состояние заявителя"
          value={scenario.persona.condition}
          placeholder="Напугана, находится снаружи"
          maxLength={200}
          onChange={(condition) =>
            onChange({
              ...scenario,
              persona: { ...scenario.persona, condition },
            })
          }
        />
        <TextAreaInput
          className="md:col-span-2 lg:col-span-3"
          label="Манера речи"
          value={scenario.persona.speechStyle}
          placeholder="Короткие фразы, сбивается, отвечает по существу..."
          maxLength={2_000}
          onChange={(speechStyle) =>
            onChange({
              ...scenario,
              persona: { ...scenario.persona, speechStyle },
            })
          }
        />
        <NumberInput
          label="Начальная паника"
          hint="0–4"
          value={scenario.persona.baselinePanicLevel}
          min={0}
          max={4}
          onChange={(baselinePanicLevel) =>
            onChange({
              ...scenario,
              persona: { ...scenario.persona, baselinePanicLevel },
            })
          }
        />
        <NumberInput
          label="Базовый темп речи"
          hint="0.5–2"
          value={scenario.persona.baseSpeechRate}
          min={0.5}
          max={2}
          step={0.05}
          onChange={(baseSpeechRate) =>
            onChange({
              ...scenario,
              persona: { ...scenario.persona, baseSpeechRate },
            })
          }
        />
      </div>
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
      description="Реплики и числовые ограничения проверяются до публикации и затем становятся частью неизменяемой версии."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <TextAreaInput
          label="Первая реплика"
          hint="воспроизводится без LLM"
          value={scenario.version.openingLine}
          maxLength={500}
          onChange={(openingLine) => updateVersion({ openingLine })}
        />
        <TextAreaInput
          label="Безопасная запасная реплика"
          hint="не раскрывает скрытых фактов"
          value={scenario.version.fallbackLine}
          maxLength={500}
          onChange={(fallbackLine) => updateVersion({ fallbackLine })}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumberInput
          label="Паника: минимум"
          value={scenario.version.panicFloor}
          min={0}
          max={4}
          onChange={(panicFloor) => updateVersion({ panicFloor })}
        />
        <NumberInput
          label="Паника: максимум"
          value={scenario.version.panicCeiling}
          min={0}
          max={4}
          onChange={(panicCeiling) => updateVersion({ panicCeiling })}
        />
        <NumberInput
          label="Макс. перебиваний"
          value={scenario.version.maxInterruptions}
          min={0}
          max={20}
          onChange={(maxInterruptions) => updateVersion({ maxInterruptions })}
        />
        <NumberInput
          label="Инициатива через, сек."
          value={scenario.version.initiativeCooldownSeconds}
          min={1}
          max={120}
          onChange={(initiativeCooldownSeconds) =>
            updateVersion({ initiativeCooldownSeconds })
          }
        />
        <NumberInput
          label="Норматив, сек."
          value={scenario.version.answerNormSeconds}
          min={30}
          max={1_800}
          onChange={(answerNormSeconds) => updateVersion({ answerNormSeconds })}
        />
        <NumberInput
          label="Ожидаемая длительность, сек."
          value={scenario.version.expectedDurationSeconds}
          min={30}
          max={3_600}
          onChange={(expectedDurationSeconds) =>
            updateVersion({ expectedDurationSeconds })
          }
        />
        <NumberInput
          label="Проходной балл"
          value={scenario.version.passThreshold}
          min={0}
          max={100}
          onChange={(passThreshold) => updateVersion({ passThreshold })}
        />
      </div>

      <div className="border-grayA-5 mt-5 border-t pt-4">
        <div className="text-gray-11 mb-3 text-xs">Ожидаемые службы</div>
        <Flex gap="4" wrap="wrap">
          {EMERGENCY_SERVICES.map((service) => (
            <BooleanInput
              key={service}
              label={SERVICE_LABELS[service]}
              checked={scenario.version.expectedServices.includes(service)}
              onChange={(checked) =>
                updateVersion({
                  expectedServices: checked
                    ? [...scenario.version.expectedServices, service]
                    : scenario.version.expectedServices.filter(
                        (item) => item !== service,
                      ),
                })
              }
            />
          ))}
        </Flex>
      </div>
    </SectionCard>
  );
}

export function ScenarioLocationSection({
  scenario,
  onChange,
}: ScenarioSectionProps) {
  const updateLocation = (patch: Partial<ScenarioSeed["location"]>) =>
    onChange({ ...scenario, location: { ...scenario.location, ...patch } });
  const updateAddress = (key: string, value: string) =>
    updateLocation({
      exactAddress: { ...scenario.location.exactAddress, [key]: value },
    });

  return (
    <SectionCard
      title="Место происшествия"
      description="Этот раздел заполняет преподаватель. AI не получает и не изменяет адрес, координаты или радиус."
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
            return;
          }

          updateLocation({ locatorCenter: coordinates });
        }}
      />

      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <NumberInput
          label="Радиус области, м"
          value={scenario.location.locatorRadiusMeters}
          min={10}
          max={50_000}
          onChange={(locatorRadiusMeters) =>
            updateLocation({ locatorRadiusMeters })
          }
        />
        <SelectInput
          label="Точность геолокации"
          value={scenario.location.locatorAccuracy}
          options={LOCATOR_ACCURACIES.map((value) => ({
            value,
            label: LOCATOR_ACCURACY_LABELS[value],
          }))}
          onChange={(locatorAccuracy) => updateLocation({ locatorAccuracy })}
        />
        <SelectInput
          label="Тип местности"
          value={scenario.location.terrain}
          options={TERRAIN_TYPES.map((value) => ({
            value,
            label: TERRAIN_LABELS[value],
          }))}
          onChange={(terrain) => updateLocation({ terrain })}
        />
        <TextInput
          label="Телефон заявителя"
          value={scenario.location.callerNumber}
          maxLength={32}
          onChange={(callerNumber) => updateLocation({ callerNumber })}
        />
        <NumberInput
          label="Точная широта"
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
      </div>

      <div className="border-grayA-5 mt-5 border-t pt-4">
        <div className="text-gray-11 mb-3 text-xs">
          Текст адреса вводится вручную. Без reverse-geocoder координаты нельзя
          достоверно преобразовать в улицу и номер дома.
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <TextInput
            label="Город"
            value={scenario.location.exactAddress.city ?? ""}
            onChange={(value) => updateAddress("city", value)}
          />
          <TextInput
            label="Улица"
            value={scenario.location.exactAddress.street ?? ""}
            onChange={(value) => updateAddress("street", value)}
          />
          <TextInput
            label="Дом"
            value={scenario.location.exactAddress.house ?? ""}
            onChange={(value) => updateAddress("house", value)}
          />
          <TextInput
            className="md:col-span-2 lg:col-span-4"
            label="Дополнительные детали адреса"
            value={scenario.location.exactAddress.details ?? ""}
            onChange={(value) => updateAddress("details", value)}
          />
          <TextInput
            className="md:col-span-2 lg:col-span-4"
            label="Подпись области геолокации"
            value={scenario.location.locatorLabel}
            placeholder="Базовая станция: Учебный квартал"
            maxLength={200}
            onChange={(locatorLabel) => updateLocation({ locatorLabel })}
          />
        </div>
      </div>
      <div className="mt-4">
        <BooleanInput
          label="Заявитель уже обращался по этому происшествию"
          checked={scenario.location.previouslyCalled}
          onChange={(previouslyCalled) => updateLocation({ previouslyCalled })}
        />
      </div>
    </SectionCard>
  );
}
