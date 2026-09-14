import { IconButton, Tooltip } from "@bolid-ui/themes";
import { CircleHelp } from "lucide-react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useEffect, useRef } from "react";

const tourThemeTokens = [
  "--color-panel-solid",
  "--gray-a3",
  "--gray-a4",
  "--gray-a6",
  "--gray-11",
  "--gray-12",
  "--radius-5",
  "--shadow-6",
] as const;

const applyAppTheme = (popover: HTMLElement) => {
  const theme = document.querySelector<HTMLElement>(
    '.perchik-themes[data-is-root-theme="true"]',
  );
  if (!theme) return;

  const themeStyles = getComputedStyle(theme);
  for (const token of tourThemeTokens) {
    popover.style.setProperty(token, themeStyles.getPropertyValue(token));
  }
};

const createBlurLayer = () => {
  const layer = document.createElement("div");
  layer.className = "operator-tour-blur-layer";

  for (let index = 0; index < 4; index += 1) {
    layer.appendChild(document.createElement("div"));
  }

  document.body.appendChild(layer);
  return layer;
};

const updateBlurLayer = (layer: HTMLElement, element?: Element) => {
  const panels = Array.from(layer.children) as HTMLElement[];
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (!element) {
    panels[0].style.cssText = "inset: 0";
    for (const panel of panels.slice(1)) panel.style.cssText = "display: none";
    return;
  }

  const padding = 8;
  const rect = element.getBoundingClientRect();
  const left = Math.max(0, rect.left - padding);
  const top = Math.max(0, rect.top - padding);
  const right = Math.min(viewportWidth, rect.right + padding);
  const bottom = Math.min(viewportHeight, rect.bottom + padding);

  const panelStyles = [
    `left: 0; top: 0; width: 100%; height: ${top}px`,
    `left: 0; top: ${top}px; width: ${left}px; height: ${bottom - top}px`,
    `left: ${right}px; top: ${top}px; width: ${viewportWidth - right}px; height: ${bottom - top}px`,
    `left: 0; top: ${bottom}px; width: 100%; height: ${viewportHeight - bottom}px`,
  ];

  panels.forEach((panel, index) => {
    panel.style.cssText = panelStyles[index];
  });
};

export function OperatorTour() {
  const tourRef = useRef<Driver | null>(null);
  const blurLayerRef = useRef<HTMLElement | null>(null);

  useEffect(
    () => () => {
      tourRef.current?.destroy();
      tourRef.current = null;
      blurLayerRef.current?.remove();
      blurLayerRef.current = null;
    },
    [],
  );

  const startTour = () => {
    tourRef.current?.destroy();
    blurLayerRef.current?.remove();

    const blurLayer = createBlurLayer();
    blurLayerRef.current = blurLayer;
    updateBlurLayer(blurLayer);

    const tour = driver({
      animate: true,
      allowClose: true,
      allowKeyboardControl: true,
      disableActiveInteraction: true,
      overlayColor: "#111113",
      overlayOpacity: 0.7,
      smoothScroll: true,
      stagePadding: 8,
      stageRadius: 14,
      popoverClass: "operator-tour-popover",
      showProgress: true,
      progressText: "{{current}} из {{total}}",
      nextBtnText: "Далее",
      prevBtnText: "Назад",
      doneBtnText: "Готово",
      onPopoverRender: ({ wrapper }) => applyAppTheme(wrapper),
      onHighlightStarted: (element) => updateBlurLayer(blurLayer, element),
      onHighlighted: (element) => updateBlurLayer(blurLayer, element),
      onDestroyed: () => {
        blurLayer.remove();
        if (blurLayerRef.current === blurLayer) blurLayerRef.current = null;
        tourRef.current = null;
      },
      steps: [
        {
          popover: {
            title: "Рабочее место оператора",
            description:
              "Коротко покажем, как принять учебный вызов, заполнить карточку происшествия и завершить тренировку.",
          },
        },
        {
          element: '[data-tour="caller"]',
          popover: {
            title: "Заявитель и пострадавшие",
            description:
              "Здесь отображаются сведения о звонке. Во время разговора заполните данные заявителя и добавьте пострадавших.",
            side: "right",
            align: "start",
          },
        },
        {
          element: '[data-tour="incident"]',
          popover: {
            title: "Карточка происшествия",
            description:
              "Зафиксируйте адрес, тип происшествия, количество пострадавших и важные подробности со слов заявителя.",
            side: "left",
            align: "start",
          },
        },
        {
          element: '[data-tour="dispatch-services"]',
          popover: {
            title: "Экстренные службы",
            description:
              "Выберите службы, которые необходимо направить на место происшествия.",
            side: "left",
            align: "start",
          },
        },
        {
          element: '[data-tour="caller-chat"]',
          popover: {
            title: "Чат с заявителем",
            description:
              "Здесь отображается диалог с заявителем во время учебного вызова — используйте его, чтобы не потерять важные детали разговора.",
            side: "left",
            align: "start",
          },
        },
        {
          element: '[data-tour="incident-map"]',
          popover: {
            title: "Карта на отдельной панели",
            description:
              "Уточните место происшествия на карте. Кнопка «Открыть в окне» позволяет вывести её на соседнюю панель или второй экран.",
            side: "left",
            align: "start",
          },
        },
        {
          element: '[data-tour="call-controls"]',
          popover: {
            title: "Управление тренировкой",
            description:
              "Выберите сценарий и начните звонок. Здесь же можно отключить микрофон, завершить вызов и перейти к разбору результатов.",
            side: "top",
            align: "center",
          },
        },
        {
          element: '[data-tour="operator-tour-button"]',
          popover: {
            title: "Можно начинать",
            description:
              "Подсказки не изменили данные. Нажмите «Ознакомиться» ещё раз, если захотите повторить обзор.",
            side: "bottom",
            align: "end",
          },
        },
      ],
    });

    tourRef.current = tour;
    tour.drive();
  };

  return (
    <Tooltip content="Ознакомиться">
      <IconButton
        type="button"
        size="2"
        radius="full"
        variant="soft"
        color="gray"
        aria-label="Ознакомиться с рабочим местом оператора"
        data-tour="operator-tour-button"
        onClick={startTour}
      >
        <CircleHelp size={17} />
      </IconButton>
    </Tooltip>
  );
}
