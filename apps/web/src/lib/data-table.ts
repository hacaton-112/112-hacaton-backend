import {
  AllCommunityModule,
  ModuleRegistry,
} from "@bolid-ui/data-table/community";
import {
  ContextMenuModule,
  RowGroupingModule,
} from "@bolid-ui/data-table/enterprise";
import { DATA_TABLE_LOCALE_RU } from "@bolid-ui/data-table/locale";
import { dataTableTheme } from "@bolid-ui/data-table/theme";
import type { LucideIcon } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Модули регистрируются один раз на приложение, до первой таблицы.
ModuleRegistry.registerModules([
  AllCommunityModule,
  RowGroupingModule,
  ContextMenuModule,
]);

/**
 * Общие параметры таблиц: тема Bolid на CSS-переменных (режим задаёт
 * `ThemeWithPanel`), русская локаль и одна подпись для пустой таблицы.
 *
 * Таблица занимает всю высоту своего контейнера и листает строки сама:
 * страница отдаёт ей оставшееся место.
 */
export const DATA_TABLE_DEFAULTS = {
  theme: dataTableTheme,
  localeText: DATA_TABLE_LOCALE_RU,
  className: "h-full",
  overlayNoRowsTemplate: "Нет данных",
  suppressCellFocus: true,
  // Колонки делят ширину таблицы и не сжимаются меньше своего минимума: на
  // узком окне появляется прокрутка, на широком нет пустого места справа.
  defaultColDef: { flex: 1, minWidth: 100 },
} as const;

/**
 * Иконка пункта контекстного меню. Меню таблицы оставляет слева место под
 * иконку у каждого пункта — без неё текст стоит с пустым отступом.
 */
export const menuIcon = (icon: LucideIcon): string =>
  renderToStaticMarkup(createElement(icon, { size: 14 }));

/**
 * Колонка кнопок строки: всегда последняя, фиксированной ширины, её нельзя
 * перетащить, растянуть или отсортировать.
 */
export const ACTION_COLUMN = {
  colId: "actions",
  headerName: "",
  flex: 0,
  sortable: false,
  resizable: false,
  suppressMovable: true,
  lockPosition: "right",
  suppressHeaderMenuButton: true,
} as const;
