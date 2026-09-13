import {
  Box,
  Dialog,
  Flex,
  IconButton,
  ScrollArea,
  Select,
  Text,
  Tooltip,
} from "@bolid-ui/themes";
import { Check, Headphones, Palette, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import {
  ACCENT_COLORS,
  ACCENT_LABELS,
  THEME_LABELS,
  THEME_PREFERENCES,
} from "../../config/theme";
import { ipc, type AudioDeviceInfo } from "../../lib/ipc";
import { settingsService, useSettings } from "../../services/settings.service";
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
  const settings = useSettings();
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
        <Dialog.Title className="h-rx-12 border-grayA-5 bg-panel-solid text-2 text-gray-12 m-0! flex shrink-0 border-b font-medium">
          <div className="border-grayA-5 px-rx-3 flex h-full w-52 shrink-0 items-center justify-center border-r">
            <span className="min-w-0 truncate text-center">Тренажёр 112</span>
          </div>
          <div className="px-rx-5 flex h-full min-w-0 flex-1 items-center">
            <span className="truncate">
              {page === "appearance"
                ? "Оформление"
                : "Устройства ввода и вывода"}
            </span>
          </div>
        </Dialog.Title>
        <Dialog.Description className="sr-only">
          Настройки внешнего вида и аудиоустройств
        </Dialog.Description>

        <div className="flex min-h-0 flex-1">
          <aside className="border-grayA-5 bg-grayA-2 h-full w-52 shrink-0 overflow-hidden border-r">
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
            <Box asChild minHeight="0" flexGrow="1">
              <ScrollArea scrollbars="vertical" type="auto">
                <div className="p-rx-5">
                  <Text as="p" color="gray" size="2" mb="5">
                    {page === "appearance"
                      ? "Настройте тему и основной цвет интерфейса."
                      : "Выберите микрофон оператора и устройство воспроизведения заявителя."}
                  </Text>
                  {page === "appearance" ? (
                    <AppearanceSettings />
                  ) : (
                    <AudioSettings
                      devices={devices}
                      error={deviceError}
                      loading={loadingDevices}
                      inputDevice={settings.inputDevice}
                      outputDevice={settings.outputDevice}
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
    </Flex>
  );
}

function AudioSettings({
  devices,
  error,
  inputDevice,
  loading,
  outputDevice,
  onRefresh,
}: {
  devices: { inputs: AudioDeviceInfo[]; outputs: AudioDeviceInfo[] };
  error: string | null;
  inputDevice: string | null;
  loading: boolean;
  outputDevice: string | null;
  onRefresh: () => Promise<void>;
}) {
  return (
    <Flex direction="column" gap="5">
      <Flex align="center" justify="between">
        <Text color="gray" size="2">
          Изменения применяются к следующему звонку.
        </Text>
        <Tooltip content="Обновить список устройств">
          <IconButton
            aria-label="Обновить список устройств"
            color="gray"
            disabled={loading}
            onClick={() => void onRefresh()}
            variant="soft"
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

      <DeviceSetting
        description="Устройство, с которого записывается речь оператора."
        devices={devices.inputs}
        label="Микрофон"
        value={inputDevice}
        onChange={(inputDevice) => settingsService.update({ inputDevice })}
      />
      <DeviceSetting
        description="На него воспроизводится голос заявителя."
        devices={devices.outputs}
        label="Динамики или наушники"
        value={outputDevice}
        onChange={(outputDevice) => settingsService.update({ outputDevice })}
      />
    </Flex>
  );
}

function DeviceSetting({
  description,
  devices,
  label,
  value,
  onChange,
}: {
  description: string;
  devices: AudioDeviceInfo[];
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <SettingRow title={label} description={description} stacked>
      <Select.Root
        value={value ?? SYSTEM_DEFAULT}
        onValueChange={(next) =>
          onChange(next === SYSTEM_DEFAULT ? null : next)
        }
      >
        <Select.Trigger
          aria-label={label}
          className="w-full"
          placeholder="Системное устройство"
        />
        <Select.Content>
          <Select.Item value={SYSTEM_DEFAULT}>Системное устройство</Select.Item>
          {devices.map((device) => (
            <Select.Item key={device.id} value={device.id}>
              {device.name}
              {device.isDefault ? " (по умолчанию)" : ""}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </SettingRow>
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
