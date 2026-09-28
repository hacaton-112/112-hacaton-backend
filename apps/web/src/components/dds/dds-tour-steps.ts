import type { DriveStep } from "driver.js";

export type DdsTourView = "queue" | "card";

export const DDS_QUEUE_TOUR_STEPS = [
  {
    popover: {
      title: "Рабочее место диспетчера ДДС",
      description:
        "Здесь вы принимаете переданные карточки происшествий, обрабатываете их и сообщаете о ходе реагирования.",
    },
  },
  {
    element: '[data-tour="dds-search"]',
    popover: {
      title: "Поиск карточки",
      description:
        "Найдите происшествие по номеру, адресу, сценарию или типу. Кнопка «сбросить» возвращает полный список.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="dds-queue"]',
    popover: {
      title: "Очередь происшествий",
      description:
        "В таблице видны время поступления, адрес, тип происшествия и текущий статус службы. Нажмите строку, чтобы открыть карточку.",
      side: "top",
      align: "start",
    },
  },
  {
    element: '[data-tour="dds-tour-button"]',
    popover: {
      title: "Подсказка всегда доступна",
      description:
        "После открытия карточки нажмите эту кнопку ещё раз — внутри карточки будет отдельный обзор рабочих действий.",
      side: "bottom",
      align: "end",
    },
  },
] satisfies readonly DriveStep[];

export const DDS_CARD_TOUR_STEPS = [
  {
    popover: {
      title: "Карточка происшествия ДДС",
      description:
        "Проверьте полученные сведения, свяжитесь с нарядом и последовательно меняйте статус службы до результата.",
    },
  },
  {
    element: '[data-tour="dds-card-summary"]',
    popover: {
      title: "Номер и действия по карточке",
      description:
        "Здесь находятся номер происшествия, журнал событий, редактор статуса и телефон связи с нарядом.",
      side: "bottom",
      align: "end",
    },
  },
  {
    element: '[data-tour="dds-incident-details"]',
    popover: {
      title: "Адрес и описание",
      description:
        "Сверьте место происшествия, сведения заявителя и описание, которое передал оператор 112.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="dds-classification"]',
    popover: {
      title: "Классификация происшествия",
      description:
        "В этой части показаны тип, категория, пострадавшие и другие признаки карточки.",
      side: "left",
      align: "start",
    },
  },
  {
    element: '[data-tour="dds-status"]',
    popover: {
      title: "Статус и норматив",
      description:
        "Следите за текущим статусом и нормативом реакции. Попытка завершается только после статуса «Выполнено» или «Отказ».",
      side: "top",
      align: "start",
    },
  },
  {
    element: '[data-tour="dds-services"]',
    popover: {
      title: "Службы и журнал",
      description:
        "Плитки показывают участвующие службы. Стрелка открывает журнал, а значок редактирования — следующий статус вашей службы.",
      side: "top",
      align: "center",
    },
  },
  {
    element: '[data-tour="dds-phone"]',
    popover: {
      title: "Телефон наряда",
      description:
        "Откройте отдельное окно телефона, выберите наряд и передайте ему сведения карточки голосом. Повторное нажатие вернёт фокус уже открытому окну.",
      side: "bottom",
      align: "end",
    },
  },
  {
    element: '[data-tour="dds-tour-button"]',
    popover: {
      title: "Можно приступать",
      description:
        "Обзор ничего не изменил в карточке. Нажмите «Ознакомиться» ещё раз, если потребуется повторить подсказки.",
      side: "bottom",
      align: "end",
    },
  },
] satisfies readonly DriveStep[];

export const ddsTourSteps = (view: DdsTourView) =>
  view === "queue" ? DDS_QUEUE_TOUR_STEPS : DDS_CARD_TOUR_STEPS;
