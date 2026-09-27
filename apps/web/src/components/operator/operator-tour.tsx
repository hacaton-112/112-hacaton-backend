import type { DriveStep } from "driver.js";

import { GuidedTour } from "../guided-tour";

const OPERATOR_TOUR_STEPS = [
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
    element: '[data-tour="operator-phone"]',
    popover: {
      title: "Телефон и разговор",
      description:
        "Телефон открывается в отдельном окне: там номер заявителя, время вызова, диалог и кнопки микрофона и отбоя. Карточка при этом остаётся на весь экран.",
      side: "top",
      align: "end",
    },
  },
  {
    element: '[data-tour="incident-map"]',
    popover: {
      title: "Место происшествия на карте",
      description:
        "Кнопка карты рядом с адресом открывает план: отметьте точку, и координаты попадут в карточку.",
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
] satisfies readonly DriveStep[];

export function OperatorTour() {
  return (
    <GuidedTour
      ariaLabel="Ознакомиться с рабочим местом оператора"
      dataTour="operator-tour-button"
      steps={OPERATOR_TOUR_STEPS}
    />
  );
}
