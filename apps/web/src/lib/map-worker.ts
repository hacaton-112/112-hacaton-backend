import { setWorkerUrl } from "maplibre-gl";
// eslint-disable-next-line import/no-unresolved -- суффикс ?worker&url разбирает Vite, а не резолвер модулей
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

/**
 * Воркер карты.
 *
 * Сама библиотека собирает адрес воркера рядом со своим бандлом
 * (`/assets/maplibre-gl-worker.mjs`), но сборщик этот файл не выкладывает:
 * на проде он отдавал 404, карта загружала стиль и метаданные и не
 * запрашивала ни одного тайла — чёрный прямоугольник без единой ошибки.
 * Здесь воркер собирается вместе с приложением и получает настоящий адрес.
 */
setWorkerUrl(workerUrl);
