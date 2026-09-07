# Contributing

Гайд по стеку, библиотекам и конвенциям проекта — для тех, кто впервые контрибьютит.

## Стек

- **React 19** + **TypeScript** — UI и типы.
- **Tauri 2** — десктопная обвязка (`src-tauri/`), UI — обычное веб-приложение на Vite.
- **Vite 8** (`@vitejs/plugin-react`) — сборка и dev-сервер.
- **Tailwind CSS v4** (`@tailwindcss/vite`) + **@bolid-ui/themes** — стили и компоненты дизайн-системы.
- **react-router v8** — роутинг.
- **@tanstack/react-query v5** — серверное состояние (кэш запросов, инвалидация).
- **axios** — HTTP-клиент (обёрнут в `src/lib/api.ts`); стриминговые ASR/voice-pipeline соединения идут напрямую через `fetch`/`WebSocket` в `src/services/*.service.ts` — под них `api.ts` не подходит.
- **zustand** — клиентское (глобальное UI) состояние.
- **zod** — валидация и схемы данных.
- **lucide-react** — иконки.
- **tailwind-merge** — безопасное слияние конфликтующих tailwind-классов.
- **oxlint** — линтер. **prettier** (+ `prettier-plugin-tailwindcss`) — форматирование и сортировка классов.
- **Bun** — пакетный менеджер и раннер скриптов (в репозитории `bun.lock`, npm/yarn/pnpm не использовать).

## Установка и запуск

```bash
bun install
bun run dev        # web dev-сервер
bun run tauri dev  # десктопное окно (Tauri)
```

Переменные окружения — см. [.env.example](.env.example), скопировать в `.env`.

## Скрипты

| Скрипт                 | Назначение                                              |
| ---------------------- | ------------------------------------------------------- |
| `bun run dev`          | dev-сервер с HMR                                        |
| `bun run build`        | тайпчек (`tsc -b`) + прод-сборка                        |
| `bun run lint`         | oxlint                                                  |
| `bun run format`       | prettier --write                                        |
| `bun run format:check` | prettier --check (использовать в CI/перед PR)           |
| `bun run preview`      | предпросмотр прод-сборки                                |
| `bun run tauri`        | обёртка над Tauri CLI (`tauri dev`, `tauri build`, ...) |

Перед PR обязательно: `bun run lint`, `bun run format:check`, `bun run build` — все три должны проходить без ошибок.

## Структура проекта

```
src/
  app/          — корневой компонент App + глобальные стили (app.css)
  assets/       — статика (картинки, svg), импортируемая из кода
  components/   — переиспользуемые UI-компоненты общего назначения
  contexts/     — React Context, если состояние не тянет на отдельный zustand-стор
  contracts/    — zod-схемы и типы данных (DTO, формы, ответы API)
  hooks/        — переиспользуемые хуки (в т.ч. обёртки над react-query: useXxxQuery/useXxxMutation)
  lib/          — общие утилиты без домена (utils.ts, api.ts)
  providers/    — HOC-провайдеры верхнего уровня, см. ниже
  services/     — функции похода в API поверх `lib/api.ts` либо напрямую через fetch/WebSocket (стриминг), сгруппированные по домену
  stores/       — zustand-сторы
  routing.tsx   — дерево роутов
  main.tsx      — точка входа
src-tauri/      — Rust-обвязка Tauri (не трогать из фронтенд-кода)
```

Часть папок (`contexts`, `contracts`, `hooks`, `stores`) — заготовки под конвенцию, наполняются по мере надобности. Не плодите свою структуру рядом — кладите новый код в подходящую из существующих.

## Конвенции именования

- Файлы — `kebab-case.tsx` / `kebab-case.ts`.
- Именованный экспорт camelCase, совпадающий по смыслу с именем файла (`theme-provider.tsx` → `themeProvider`), либо PascalCase для React-компонентов, используемых как JSX-теги (`voice-trainer.tsx` → `VoiceTrainer`).
- `export default` — только для точек входа/страниц-компонентов (`App`), не для утилит и провайдеров.
- Индексные файлы (`index.ts`) — только реэкспорт/агрегация, без логики.

## Провайдеры и `compose`

Все провайдеры верхнего уровня (тема, роутер, react-query, error boundary и т.д.) — функции с сигнатурой

```ts
(component: React.ReactNode) => React.JSX.Element;
```

Они оборачивают переданное дерево в свой контекст и **не** являются React-компонентами с пропсами — просто функции. Собираются через `compose` из `src/lib/utils.ts`:

```ts
export const withProviders = compose(
  errorBoundaryProvider,
  themeProvider,
  routingProvider,
  queryProvider,
);
```

`compose(A, B, C)` → `A(B(C(component)))`, то есть **первый аргумент — самый внешний**. Порядок важен:

- `errorBoundaryProvider` должен быть первым (ловит ошибки из всех остальных).
- Провайдеры, от которых зависят другие (например, тема, если её читают компоненты внутри роутера), ставьте выше по списку.

Добавляя новый провайдер: создать файл `src/providers/xxx-provider.tsx` с функцией `xxxProvider` такой же сигнатуры и добавить его в `compose(...)` в `src/providers/index.ts`.

## Работа с API

Единая точка входа для обычных REST-запросов — `src/lib/api.ts`, экспортирует синглтон `api` (axios-инстанс с интерцептором ошибок) и класс `ApiError`.

- Не создавайте новые `axios.create(...)` в фичах — всегда через `api`.
- Ответы уже развёрнуты: `api.get<T>(url)` резолвится в `T` (`response.data`), а не в `AxiosResponse`.
- Ошибки всегда приходят как `ApiError` (`message`, `status`, `code`, `details`) — не `AxiosError`. Ловите/проверяйте через `instanceof ApiError`.
- Функции конкретных эндпоинтов кладите в `src/services/<домен>.ts`, а не вызывайте `api.get/post` прямо из компонентов — так проще подменить/замокать в тестах.
- Стриминговые соединения (ASR по WebSocket, voice-pipeline) не подходят под axios-обёртку — там `fetch`/`WebSocket` напрямую внутри `src/services/*.service.ts` (см. `asr-stream.service.ts`, `voice-pipeline.service.ts`).

## Серверное vs клиентское состояние

- Данные с бэкенда — через `@tanstack/react-query` (`useQuery`/`useMutation` поверх функций из `services/`). Не тащите серверные данные в zustand.
- UI-состояние, не завязанное на сервер (тема, открытые модалки, шаги визарда и т.п.) — `zustand`-стор в `src/stores/`.
- Локальный стейт одного компонента/поддерева — обычный `useState`/`useReducer`, `contexts/` не для этого.

## Валидация и типы

Схемы `zod` и производные типы (`z.infer<...>`) — в `src/contracts/`, рядом с доменом (например, `contracts/asr.ts`). Формы и ответы API валидировать схемой, а не вручную проверять поля.

## Стили

- Tailwind-классы — предпочтительный способ стилизовать новые компоненты. `prettier-plugin-tailwindcss` сам сортирует классы при `bun run format` — руками порядок не поддерживать.
- Компоненты дизайн-системы — из `@bolid-ui/themes`, не изобретать аналоги на голом Tailwind, если компонент уже есть в теме.
- Для условных/динамических классов используйте `tailwind-merge` (`twMerge`), чтобы конфликтующие классы (например, два разных `p-*`) схлопывались предсказуемо.
- Существующий экран `voice-trainer.tsx` пока на ручном CSS (`app/app.css`) — при доработках новых экранов используйте Tailwind, а не копируйте этот подход.

## Линт и форматирование

- `oxlint` — только на ошибки/антипаттерны (`react/rules-of-hooks` и т.д.), правила описаны в `.oxlintrc.json`.
- `prettier` — форматирование, конфиг в `.prettierrc.json`. Не спорьте с форматтером в PR — просто `bun run format`.
- Не отключайте правила инлайн без явной причины в комментарии.

## Коммиты и PR

- Коммиты — в духе Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`), коротко и по-делу.
- PR должен проходить `lint` + `format:check` + `build` (см. таблицу скриптов выше) до ревью.
- Не коммитить `.env` (в `.gitignore`), обновлять `.env.example` при добавлении новой переменной окружения.
