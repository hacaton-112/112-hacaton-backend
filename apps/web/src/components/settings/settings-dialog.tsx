import {
  Box,
  Button,
  Callout,
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
import { Headphones, Palette, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { SCALING_OPTIONS } from "../../config/theme";
import { useMicrophoneTest } from "../../hooks/use-microphone-test";
import { pickDevice } from "../../lib/audio-processing";
import {
  enumerateAudioDevices,
  supportsOutputDeviceSelection,
  type AudioDeviceInfo,
} from "../../lib/web-audio";
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
      setDevices(await enumerateAudioDevices());
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => void refreshDevices(), 0);
    const onDeviceChange = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener("devicechange", onDeviceChange);
    return () => {
      window.clearTimeout(timer);
      navigator.mediaDevices?.removeEventListener(
        "devicechange",
        onDeviceChange,
      );
    };
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
                      ? "Масштабируйте рабочее место под размер монитора."
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
      <Callout.Root color="orange" size="1">
        <Callout.Text>
          Цвета, контраст и геометрия зафиксированы по референсу АРМ-112, чтобы
          все учебные места выглядели одинаково.
        </Callout.Text>
      </Callout.Root>

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
          valueLabel={settings.inputDeviceLabel}
          onChange={(inputDevice, inputDeviceLabel) =>
            settingsService.update({ inputDevice, inputDeviceLabel })
          }
        />
        {supportsOutputDeviceSelection ? (
          <DeviceSelect
            devices={devices.outputs}
            label="Динамик"
            value={settings.outputDevice}
            valueLabel={settings.outputDeviceLabel}
            onChange={(outputDevice, outputDeviceLabel) =>
              settingsService.update({ outputDevice, outputDeviceLabel })
            }
          />
        ) : null}
        <VolumeSlider
          label="Громкость микрофона"
          value={settings.inputGain}
          onChange={(inputGain) => {
            settingsService.update({ inputGain });
          }}
        />
        <VolumeSlider
          label="Громкость динамика"
          value={settings.outputVolume}
          onChange={(outputVolume) => {
            settingsService.update({ outputVolume });
          }}
        />
      </Grid>

      <MicrophoneTest
        inputDevice={settings.inputDevice}
        inputDeviceLabel={settings.inputDeviceLabel}
        inputGain={settings.inputGain}
        outputDevice={settings.outputDevice}
        outputDeviceLabel={settings.outputDeviceLabel}
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
  valueLabel,
  onChange,
}: {
  devices: AudioDeviceInfo[];
  label: string;
  value: string | null;
  valueLabel: string | null;
  onChange: (value: string | null, valueLabel: string | null) => void;
}) {
  // Сохранённый идентификатор мог устареть: тогда устройство узнаётся по
  // названию, а не пропавшее значение показывается как системное — так же
  // его и откроет звонок.
  const current = pickDevice(
    devices.map((device) => ({ deviceId: device.id, label: device.label })),
    value,
    valueLabel,
  );

  return (
    <Flex direction="column" gap="2" minWidth="0">
      <Text size="2" weight="medium">
        {label}
      </Text>
      <Select.Root
        value={current ?? SYSTEM_DEFAULT}
        onValueChange={(next) => {
          const device = devices.find((item) => item.id === next);
          onChange(device?.id ?? null, device?.label || null);
        }}
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
  inputDeviceLabel,
  inputGain,
  outputDevice,
  outputDeviceLabel,
  outputVolume,
}: {
  inputDevice: string | null;
  inputDeviceLabel: string | null;
  inputGain: number;
  outputDevice: string | null;
  outputDeviceLabel: string | null;
  outputVolume: number;
}) {
  const { active, error, level, toggle } = useMicrophoneTest({
    inputDevice,
    inputDeviceLabel,
    inputGain,
    outputDevice,
    outputDeviceLabel,
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
