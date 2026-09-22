# Fastify runtime

Backend сохраняет NestJS как composition root, DI-контейнер и слой
контроллеров, но HTTP transport работает через `@nestjs/platform-fastify` и
Fastify 5. Express и Multer не входят в runtime dependencies.

## Совместимость API

- глобальный prefix и URI versioning остаются `/api/v1`;
- маршруты нечувствительны к регистру и принимают завершающий `/`, как до
  миграции с Express;
- JSON body ограничен 100 KiB — это сохраняет прежний лимит body-parser;
- `trustProxy` выключен: `request.ip` нельзя подменить через
  `X-Forwarded-For`; включать доверие к proxy следует только вместе с явным
  allowlist инфраструктуры;
- входящий `X-Request-Id` принимается до 128 символов, иначе Fastify создаёт
  UUID; итоговый идентификатор возвращается в response header;
- security headers устанавливает `@fastify/helmet`;
- CORS регистрируется через Fastify adapter с прежним allowlist из
  `CORS_ORIGINS`.

## Hooks и метрики

HTTP duration измеряется корневыми `onRequest`/`onResponse` hooks. В отличие от
Nest interceptor это покрывает 404 и завершает таймер после фактической отправки
потокового ответа. Route label берётся только из `request.routeOptions.url`, а
не из пользовательского URL, чтобы UUID не создавали высокую кардинальность в
Prometheus.

`skipMiddie` включён намеренно. Новый Express-style middleware добавлять нельзя:
используйте Fastify plugin/hook либо Nest guard/interceptor в зависимости от
нужного этапа lifecycle.

## Multipart

`@fastify/multipart` работает потоково. Импорт классификатора полностью обходит
`request.parts()` и вызывает `toBuffer()` только для единственного допустимого
файла под лимитом 10 MiB. Разрешены один part, один файл в поле `file` и ни
одного дополнительного form field. Полный обход важен: `request.file()` может
оставить второй part непрочитанным и завершить stream ошибкой. Ошибки
`FST_*_LIMIT` преобразуются в стабильный API error
`CLASSIFIER_IMPORT_INVALID`.

Не используйте `FileInterceptor`: он относится к
`@nestjs/platform-express`/Multer и несовместим с Fastify adapter.

## WebSocket и shutdown

Голосовой pipeline по-прежнему использует `@nestjs/platform-ws` и общий HTTP
server Fastify; публичный WebSocket contract не меняется. `enableShutdownHooks`
вызывает закрытие Fastify, после чего освобождаются Nest providers, PostgreSQL
pool и остальные ресурсы lifecycle.

## Проверка transport-слоя

Transport tests используют `NestFastifyApplication.inject()`. Это поднимает
полный Fastify lifecycle без TCP-порта и проверяет routing, parser errors,
headers, multipart и metrics hooks.
