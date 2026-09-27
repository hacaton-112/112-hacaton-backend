import { IconButton, Tooltip } from "@bolid-ui/themes";
import { CircleHelp } from "lucide-react";
import { driver, type DriveStep, type Driver } from "driver.js";
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

const getThemeRoot = () =>
  document.querySelector<HTMLElement>(
    '.perchik-themes[data-is-root-theme="true"]',
  );

const applyAppTheme = (popover: HTMLElement) => {
  const theme = getThemeRoot();
  if (!theme) return;

  const themeStyles = getComputedStyle(theme);
  for (const token of tourThemeTokens) {
    popover.style.setProperty(token, themeStyles.getPropertyValue(token));
  }
};

const createBlurLayer = (container: HTMLElement) => {
  const layer = document.createElement("div");
  layer.className = "operator-tour-blur-layer";
  for (let index = 0; index < 4; index += 1) {
    layer.appendChild(document.createElement("div"));
  }
  container.appendChild(layer);
  return layer;
};

const updateBlurLayer = (layer: HTMLElement, element?: Element) => {
  const panels = Array.from(layer.children) as HTMLElement[];
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const contentTop = 0;

  if (!element) {
    panels[0].style.cssText = `left: 0; top: ${contentTop}px; width: 100%; height: ${viewportHeight - contentTop}px`;
    for (const panel of panels.slice(1)) panel.style.cssText = "display: none";
    return;
  }

  const padding = 8;
  const rect = element.getBoundingClientRect();
  const left = Math.max(0, rect.left - padding);
  const top = Math.max(contentTop, rect.top - padding);
  const right = Math.min(viewportWidth, rect.right + padding);
  const bottom = Math.min(viewportHeight, rect.bottom + padding);
  const panelStyles = [
    `left: 0; top: ${contentTop}px; width: 100%; height: ${top - contentTop}px`,
    `left: 0; top: ${top}px; width: ${left}px; height: ${bottom - top}px`,
    `left: ${right}px; top: ${top}px; width: ${viewportWidth - right}px; height: ${bottom - top}px`,
    `left: 0; top: ${bottom}px; width: 100%; height: ${viewportHeight - bottom}px`,
  ];
  panels.forEach((panel, index) => {
    panel.style.cssText = panelStyles[index];
  });
};

const hasTarget = (step: DriveStep) =>
  typeof step.element !== "string" || document.querySelector(step.element);

export function GuidedTour({
  ariaLabel,
  steps,
  dataTour,
}: {
  ariaLabel: string;
  steps: readonly DriveStep[];
  dataTour?: string;
}) {
  const tourRef = useRef<Driver | null>(null);
  const blurLayerRef = useRef<HTMLElement | null>(null);
  const overlayObserverRef = useRef<MutationObserver | null>(null);

  useEffect(
    () => () => {
      tourRef.current?.destroy();
      tourRef.current = null;
      overlayObserverRef.current?.disconnect();
      overlayObserverRef.current = null;
      blurLayerRef.current?.remove();
      blurLayerRef.current = null;
    },
    [],
  );

  const startTour = () => {
    tourRef.current?.destroy();
    overlayObserverRef.current?.disconnect();
    blurLayerRef.current?.remove();

    const themeRoot = getThemeRoot();
    if (!themeRoot) return;
    const blurLayer = createBlurLayer(themeRoot);
    blurLayerRef.current = blurLayer;
    updateBlurLayer(blurLayer);

    const overlayObserver = new MutationObserver(() => {
      const overlay = Array.from(document.body.children).find((element) =>
        element.classList.contains("driver-overlay"),
      );
      if (!overlay) return;
      themeRoot.appendChild(overlay);
      overlayObserver.disconnect();
      if (overlayObserverRef.current === overlayObserver) {
        overlayObserverRef.current = null;
      }
    });
    overlayObserver.observe(document.body, { childList: true });
    overlayObserverRef.current = overlayObserver;

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
        overlayObserver.disconnect();
        if (overlayObserverRef.current === overlayObserver) {
          overlayObserverRef.current = null;
        }
        blurLayer.remove();
        if (blurLayerRef.current === blurLayer) blurLayerRef.current = null;
        tourRef.current = null;
      },
      steps: steps.filter(hasTarget),
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
        aria-label={ariaLabel}
        data-tour={dataTour}
        onClick={startTour}
      >
        <CircleHelp size={17} />
      </IconButton>
    </Tooltip>
  );
}
