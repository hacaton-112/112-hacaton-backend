import {
  Box,
  Button,
  Dialog,
  Flex,
  Grid,
  IconButton,
  ScrollArea,
  Select,
  Slider,
  Text,
  Tooltip,
} from "@bolid-ui/themes";
import { Check, Headphones, Palette, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import {
  ACCENT_COLORS,
  ACCENT_LABELS,
  RADIUS_LABELS,
  RADIUS_OPTIONS,
  SCALING_OPTIONS,
  THEME_LABELS,
  THEME_PREFERENCES,
} from "../../config/theme";
import { useMicrophoneTest } from "../../hooks/use-microphone-test";
import { ipc, type AudioDeviceInfo } from "../../lib/ipc";
import {
  MAX_VOLUME,
  settingsService,
  useSettings,
} from "../../services/settings.service";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "../ui/sidebar";

type SettingsPage = "appearance" | "audio";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SYSTEM_DEFAULT = "__system_default__";

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [page, setPage] = useState<SettingsPage>("appearance");
  const [devices, setDevices] = useState<{
    inputs: AudioDeviceInfo[];
    outputs: AudioDeviceInfo[];
  }>({
    inputs: [],
    outputs: [],
  });
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [loadingDevices, setLoadingDevices] = useState(false);

  const refreshDevices = useCallback(async () => {
    setLoadingDevices(true);
    setDeviceError(null);
    try {
      setDevices(await ipc.audio.devices());
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => void refreshDevices(), 0);
    return () => window.clearTimeout(timer);
  }, [open, refreshDevices]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content
        className="flex h-[min(620px,calc(100vh-32px))] max-h-none! w-[min(820px,calc(100vw-32px))] max-w-none! flex-col overflow-hidden shadow-none!"
        style={{ padding: 0 }}
      >
        <Dialog.Description className="sr-only">
          Настройки внешнего вида и аудиоустройств
        </Dialog.Description>

        <div className="flex min-h-0 flex-1">
          <aside className="border-grayA-5 h-full w-52 shrink-0 overflow-hidden border-r">
            <SidebarProvider
              className="h-full min-h-0! w-full!"
              open
              onOpenChange={() => undefined}
            >
              <div
                className="group h-full w-full"
                data-collapsible=""
                data-side="left"
                data-state="expanded"
              >
                <Flex className="h-full w-full flex-col overflow-hidden">
                  <SidebarContent className="min-h-0">
                    <SidebarGroup>
                      <Text
                        className="mb-rx-1 px-rx-2 pt-rx-2 text-gray-11 min-w-0 truncate text-[calc(10px*var(--scaling))] tracking-normal uppercase"
                        size="1"
                      >
                        Настройки
                      </Text>
                      <SidebarGroupContent>
                        <SidebarMenu>
                          <SettingsNavButton
                            active={page === "appearance"}
                            icon={<Palette />}
                            onClick={() => setPage("appearance")}
                          >
                            Оформление
                          </SettingsNavButton>
                          <SettingsNavButton
                            active={page === "audio"}
                            icon={<Headphones />}
                            onClick={() => setPage("audio")}
                          >
                            Звук
                          </SettingsNavButton>
                        </SidebarMenu>
                      </SidebarGroupContent>
                    </SidebarGroup>
                  </SidebarContent>
                </Flex>
              </div>
            </SidebarProvider>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col">
            <Dialog.Title className="h-rx-12 border-grayA-5 px-rx-5 text-2 text-gray-12 m-0! flex shrink-0 items-center border-b font-medium">
              <span className="truncate">
                {page === "appearance"
                  ? "Оформление"
                  : "Устройства ввода и вывода"}
              </span>
            </Dialog.Title>
            <Box asChild minHeight="0" flexGrow="1">
              <ScrollArea scrollbars="vertical" type="auto">
                <div className="p-rx-5">
                  <Text as="p" color="gray" size="2" mb="5">
                    {page === "appearance"
                      ? "Настройте тему, цвет, скругление и масштаб интерфейса."
                      : "Выберите микрофон оператора и устройство воспроизведения заявителя."}
                  </Text>
                  {page === "appearance" ? (
                    <AppearanceSettings />
                  ) : (
                    <AudioSettings
                      devices={devices}
                      error={deviceError}
                      loading={loadingDevices}
                      onRefresh={refreshDevices}
                    />
                  )}
                </div>
              </ScrollArea>
            </Box>
          </section>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function SettingsNavButton({
  active,
  children,
  icon,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active}>
        <button onClick={onClick} type="button">
          {icon}
          <span className="text-gray-12 min-w-0 truncate">{children}</span>
        </button>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function AppearanceSettings() {
  const settings = useSettings();

  return (
    <Flex direction="column" gap="5">
      <SettingRow
        title="Тема"
        description="Светлая, тёмная или системная цветовая схема."
      >
        <Select.Root
          value={settings.theme}
          onValueChange={(theme) =>
            settingsService.update({ theme: theme as typeof settings.theme })
          }
        >
          <Select.Trigger aria-label="Тема" className="w-48" />
          <Select.Content>
            {THEME_PREFERENCES.map((theme) => (
              <Select.Item key={theme} value={theme}>
                {THEME_LABELS[theme]}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </SettingRow>

      <SettingRow
        title="Акцентный цвет"
        description="Используется для активных элементов и основных действий."
      >
        <div className="gap-rx-2 grid grid-cols-6">
          {ACCENT_COLORS.map((color) => (
            <Tooltip key={color} content={ACCENT_LABELS[color]}>
              <button
                aria-label={ACCENT_LABELS[color]}
                aria-pressed={settings.accentColor === color}
                className="size-rx-8 border-grayA-5 flex cursor-pointer items-center justify-center rounded-full border transition-transform hover:scale-105"
                onClick={() => settingsService.update({ accentColor: color })}
                style={{
                  background: `var(--${color}-9)`,
                  outline:
                    settings.accentColor === color
                      ? `2px solid var(--${color}-9)`
                      : undefined,
                  outlineOffset: 2,
                }}
                type="button"
              >
                {settings.accentColor === color ? (
                  <Check className="size-rx-4 text-white" strokeWidth={3} />
                ) : null}
              </button>
            </Tooltip>
          ))}
        </div>
      </SettingRow>

      <SettingRow
        title="Скругление"
        description="Радиус углов у кнопок, полей, карточек и панелей."
      >
        <Select.Root
          value={settings.radius}
          onValueChange={(radius) =>
            settingsService.update({ radius: radius as typeof settings.radius })
          }
        >
          <Select.Trigger aria-label="Скругление" className="w-48" />
          <Select.Content>
            {RADIUS_OPTIONS.map((radius) => (
              <Select.Item key={radius} value={radius}>
                {RADIUS_LABELS[radius]}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </SettingRow>

      <SettingRow
        title="Масштаб"
        description="Размер текста, отступов и элементов управления."
      >
        <Select.Root
          value={settings.scaling}
          onValueChange={(scaling) =>
            settingsService.update({
              scaling: scaling as typeof settings.scaling,
            })
          }
        >
          <Select.Trigger aria-label="Масштаб" className="w-48" />
          <Select.Content>
            {SCALING_OPTIONS.map((scaling) => (
              <Select.Item key={scaling} value={scaling}>
                {scaling}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </SettingRow>
    </Flex>
  );
}

function AudioSettings({
  devices,
  error,
  loading,
  onRefresh,
}: {
  devices: { inputs: AudioDeviceInfo[]; outputs: AudioDeviceInfo[] };
  error: string | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const settings = useSettings();

  return (
    <Flex direction="column" gap="5">
      <Flex align="center" justify="between">
        <Text size="5" weight="medium">
          Голос
        </Text>
        <Tooltip content="Обновить список устройств">
          <IconButton
            aria-label="Обновить список устройств"
            color="gray"
            disabled={loading}
            onClick={() => void onRefresh()}
            variant="ghost"
          >
            <RefreshCw
              className={loading ? "animate-spin" : undefined}
              size={16}
            />
          </IconButton>
        </Tooltip>
      </Flex>

      {error ? (
        <Text color="red" size="2">
          {error}
        </Text>
      ) : null}

      <Grid columns={{ initial: "1", sm: "2" }} gapX="5" gapY="5">
        <DeviceSelect
          devices={devices.inputs}
          label="Микрофон"
          value={settings.inputDevice}
          onChange={(inputDevice) => settingsService.update({ inputDevice })}
        />
        <DeviceSelect
          devices={devices.outputs}
          label="Динамик"
          value={settings.outputDevice}
          onChange={(outputDevice) => settingsService.update({ outputDevice })}
        />
        <VolumeSlider
          label="Громкость микрофона"
          value={settings.inputGain}
          onChange={(inputGain) => {
            settingsService.update({ inputGain });
            void ipc.audio.setInputGain(inputGain).catch(() => undefined);
          }}
        />
        <VolumeSlider
          label="Громкость динамика"
          value={settings.outputVolume}
          onChange={(outputVolume) => {
            settingsService.update({ outputVolume });
            void ipc.audio.setOutputVolume(outputVolume).catch(() => undefined);
          }}
        />
      </Grid>

      <MicrophoneTest
        inputDevice={settings.inputDevice}
        inputGain={settings.inputGain}
        outputDevice={settings.outputDevice}
        outputVolume={settings.outputVolume}
      />

      <Text color="gray" size="1">
        Устройства применяются к следующему звонку, громкость — сразу.
      </Text>
    </Flex>
  );
}

function DeviceSelect({
  devices,
  label,
  value,
  onChange,
}: {
  devices: AudioDeviceInfo[];
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <Flex direction="column" gap="2" minWidth="0">
      <Text size="2" weight="medium">
        {label}
      </Text>
      <Select.Root
        value={value ?? SYSTEM_DEFAULT}
        onValueChange={(next) =>
          onChange(next === SYSTEM_DEFAULT ? null : next)
        }
      >
        <Select.Trigger
          aria-label={label}
          className="w-full min-w-0"
          placeholder="Системное устройство"
        />
        <Select.Content position="popper">
          <Select.Item value={SYSTEM_DEFAULT}>Системное устройство</Select.Item>
          {devices.map((device) => (
            <Select.Item key={device.id} value={device.id}>
              {device.name}
              {device.isDefault ? " (по умолчанию)" : ""}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </Flex>
  );
}

function VolumeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const percent = Math.round(value * 100);

  return (
    <Flex direction="column" gap="3" minWidth="0">
      <Flex align="center" justify="between" gap="2">
        <Text size="2" weight="medium">
          {label}
        </Text>
        <Text className="tabular-nums" color="gray" size="1">
          {percent}%
        </Text>
      </Flex>
      <Slider
        aria-label={label}
        max={MAX_VOLUME * 100}
        min={0}
        step={1}
        value={[percent]}
        onValueChange={([next]) => onChange((next ?? 100) / 100)}
      />
    </Flex>
  );
}

function MicrophoneTest({
  inputDevice,
  inputGain,
  outputDevice,
  outputVolume,
}: {
  inputDevice: string | null;
  inputGain: number;
  outputDevice: string | null;
  outputVolume: number;
}) {
  const { active, error, level, toggle } = useMicrophoneTest({
    inputDevice,
    inputGain,
    outputDevice,
    outputVolume,
  });

  return (
    <Flex align="center" gap="4">
      <Button
        className="shrink-0"
        color={active ? "red" : undefined}
        onClick={() => void toggle()}
        size="3"
        variant={active ? "soft" : "solid"}
      >
        {active ? "Прекратить проверку" : "Проверка микрофона"}
      </Button>
      <Flex direction="column" gap="2" flexGrow="1" minWidth="0">
        <LevelMeter active={active} level={level} />
        <Text color={error ? "red" : "gray"} size="1">
          {error ??
            (active
              ? "Воспроизводим ваш голос — лучше в наушниках, иначе будет эхо"
              : "Скажите что-нибудь, и мы воспроизведём ваш голос")}
        </Text>
      </Flex>
    </Flex>
  );
}

const LEVEL_SEGMENTS = 48;

function LevelMeter({ active, level }: { active: boolean; level: number }) {
  const lit = active ? Math.round(level * LEVEL_SEGMENTS) : 0;

  return (
    <div
      aria-label="Уровень микрофона"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(level * 100)}
      className="h-rx-5 flex items-stretch justify-between gap-[2px] overflow-hidden"
      role="meter"
    >
      {Array.from({ length: LEVEL_SEGMENTS }, (_, index) => (
        <span
          className="w-[3px] shrink-0 rounded-full transition-colors duration-75"
          key={index}
          style={{
            background:
              index < lit
                ? index >= LEVEL_SEGMENTS * 0.85
                  ? "var(--red-9)"
                  : index >= LEVEL_SEGMENTS * 0.65
                    ? "var(--amber-9)"
                    : "var(--green-9)"
                : "var(--gray-a6)",
          }}
        />
      ))}
    </div>
  );
}

function SettingRow({
  children,
  description,
  stacked = false,
  title,
}: {
  children: ReactNode;
  description: string;
  stacked?: boolean;
  title: string;
}) {
  return (
    <Flex
      align={stacked ? "stretch" : "center"}
      direction={stacked ? "column" : "row"}
      gap="4"
      justify="between"
    >
      <div className="min-w-0">
        <Text as="p" size="2" weight="medium">
          {title}
        </Text>
        <Text as="p" color="gray" size="1" mt="1">
          {description}
        </Text>
      </div>
      <div className={stacked ? "w-full" : "shrink-0"}>{children}</div>
    </Flex>
  );
}
