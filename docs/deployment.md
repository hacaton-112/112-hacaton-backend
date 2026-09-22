# Развёртывание backend на сервере

Этот документ описывает, как поднять backend тренажёра Системы-112 на
Linux-сервере в Docker: вместе с TLS gateway, базой, ежедневным backup,
хранилищем записей звонков, Prometheus и Grafana. Всё запускается из
`docker-compose.yml` этого репозитория одной командой, а настройки живут в
одном файле `.env`.

Распознавание (ASR) и синтез речи (TTS) в этот стек не входят: им нужна GPU, и
они поднимаются из репозитория `infra`. Backend обращается к ним по адресам из
`.env`.

## Что поднимается

| Сервис | Назначение | Порт на хосте | Слушает по умолчанию |
| --- | --- | --- | --- |
| `gateway` | TLS-вход для REST API и WebSocket, профиль `app` | 443 | `0.0.0.0` |
| `backend` | REST API и WebSocket за gateway | — | только сеть Compose |
| `asr` | распознавание речи на CPU, модели зашиты в образ | 8787 | `127.0.0.1` |
| `local-llm` | llama-server с локальной моделью | 8080 | `127.0.0.1` |
| `piper-tts` | синтез речи на CPU | 5000 | `127.0.0.1` |
| `postgres` | база данных | 54322 | `127.0.0.1` |
| `postgres-backup` | ежедневный дамп, проверка и срок хранения, профили `app` и `ops` | — | только сеть Compose |
| `minio` | хранилище записей звонков и подготовленного аудио | 9000, 9001 | `127.0.0.1` |
| `prometheus` | сбор метрик | 9090 | `127.0.0.1` |
| `grafana` | дашборды | 3001 | `127.0.0.1` |
| `pgadmin` | администрирование базы | 5050 | `127.0.0.1` |
| `asterisk` | учебная АТС, SIP/WebRTC и RTP | 5060, 10000–10099; HTTP/WS 8088 локально | SIP/RTP `0.0.0.0`, HTTP `127.0.0.1` |

Отдельного сервиса миграций нет: backend применяет их сам при старте
(`drizzle/migrate.ts`). `docker compose up -d` поднимает весь стек, кроме
сервисов профилей: TLS-вход и планировщик резервных копий добавляет
`--profile app`, а разовые команды восстановления — `--profile ops`. Сам
backend наружу не публикуется: снаружи доступен только gateway.

Метрики backend отдаются на порту 9464 только внутри сети compose и наружу не
публикуются: авторизации у них нет. Записи звонков приложение получает через
API backend, поэтому MinIO тоже не должен быть виден снаружи.

## Требования

- Linux-сервер x86_64 или arm64, например Ubuntu 22.04 или 24.04.
- Ориентир по ресурсам без ASR и TTS: 2 vCPU, 4 ГБ памяти, 20 ГБ диска. Сам
  backend в покое занимает около 150 МБ, но сборка образа требует больше, а
  записи звонков со временем растут.
- Docker Engine с плагином Compose v2.
- Исходящий доступ к `ai.api.cloud.yandex.net`, к геокодеру и к серверу, где
  работают ASR и TTS.

## 1. Подготовка сервера

Установите Docker и разрешите текущему пользователю работать с ним без `sudo`:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

После этого перелогиньтесь и проверьте:

```bash
docker compose version
```

Откройте в файрволе SSH и TLS-порт API:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 443/tcp && sudo ufw enable
```

> **Docker обходит ufw.** Порты, опубликованные контейнерами, Docker открывает
> собственными правилами iptables, и запрет в ufw их не закрывает. Поэтому
> защита держится на адресах привязки: сервис на `127.0.0.1` снаружи
> недоступен при любом файрволе, а сервис на `0.0.0.0` доступен даже при
> запрете в ufw. Не меняйте `*_BIND_ADDRESS` на `0.0.0.0` без необходимости.

## 2. Код и настройки

```bash
git clone https://github.com/koch-123/112-hacaton-backend.git
```

```bash
cd 112-hacaton-backend && cp .env.production.example .env && chmod 600 .env
```

Откройте `.env` и замените все значения `CHANGE-ME`. Пароли для базы, MinIO,
Grafana и pgAdmin генерируйте так — пароль базы попадает в адрес подключения,
и в нём не должно быть символов, которые пришлось бы экранировать:

```bash
openssl rand -hex 24
```

Секрет подписи токенов:

```bash
openssl rand -base64 48
```

Отдельно проверьте:

- `YANDEX_AI_API_KEY` и `YANDEX_AI_FOLDER_ID` — ключ сервисного аккаунта
  Yandex Cloud.
- `ASR_SERVICE_URL` и `TTS_BASE_URL`. Внутри контейнера `127.0.0.1` — это
  сам контейнер. Если ASR и TTS подняты на этом же сервере, оставьте
  `host.docker.internal`; если на другой машине — укажите её адрес в частной
  сети.
- `CORS_ORIGINS` — источники веб-представления настольного приложения. Значение
  из шаблона подходит для macOS, Linux и Windows.
- `TLS_CERTIFICATE_PATH` и `TLS_PRIVATE_KEY_PATH` — сертификат и ключ,
  выпущенные внутренним CA на DNS-имя сервера. Корневой сертификат CA должен
  быть установлен в доверенные на рабочих местах операторов.
- `BACKUP_DIRECTORY` — каталог, который резервная система сервера копирует на
  другой хост или носитель. Локальный каталог не является полноценной копией.

Адреса базы и MinIO внутри стека задаёт `docker-compose.yml`: в `.env` их
указывать не нужно. Backend доверяет forwarded IP ровно от одного hop — NGINX;
его HTTP-порт на хосте отсутствует, поэтому клиент не может обойти proxy.

### Сертификат для dev/stage

В production используйте сертификат внутреннего CA. Для локальной или стендовой
проверки можно создать self-signed сертификат (он не перезаписывается без
`TLS_OVERWRITE=true`):

```bash
./ops/tls/generate-self-signed.sh system112.local
```

Добавьте `system112.local` в DNS или `/etc/hosts` и явно доверьте
`ops/tls/certs/tls.crt` на тестовом рабочем месте. Не отключайте проверку TLS в
desktop-приложении и не используйте этот ключ в production.

## 3. Первый запуск

```bash
docker compose up -d --build
```

Первая сборка долгая: образ распознавания собирается из Rust, а llama-server
скачивает модель в том `llm_models`. Затем проверьте состояние:

```bash
docker compose ps
```

`backend` должен перейти в `healthy`, а с профилем `app` — ещё `gateway` и
`postgres-backup`. Миграции backend применяет сам при старте. Если сервис
перезапускается, причина будет в его журнале:

```bash
docker compose --profile app logs backend gateway postgres-backup
```

Образ распознавания собирается из соседнего репозитория `asr-service`:
клонируйте его рядом с backend или задайте путь через `ASR_SOURCE_DIR`.

## 4. Сценарии и первая учётная запись

Разовые команды требуют исходного кода, которого нет в рабочем образе
backend, поэтому выполняйте их с хоста: база опубликована на
`127.0.0.1:54322`, и адрес из `.env` подходит как есть.

```bash
curl -fsSL https://bun.sh/install | bash
```

```bash
bun install --frozen-lockfile
```

Опубликуйте демонстрационные сценарии:

```bash
bun run db:seed
```

Создайте учётную запись администратора. Пароль читается без эха, поэтому не
попадает ни на экран, ни в историю команд. Правило пароля: хотя бы одна буква и
одна цифра.

```bash
read -rs ADMIN_PASSWORD
```

```bash
bun run --silent user:create -- admin@example.ru "$ADMIN_PASSWORD" "Имя Фамилия" admin && unset ADMIN_PASSWORD
```

Роль — `operator`, `instructor` или `admin`. Публичной регистрации нет: всех
остальных пользователей создают той же командой.

## 5. Проверка

```bash
curl --cacert ops/tls/certs/tls.crt https://system112.local/api/v1/health
```

Ответ `"status":"ok"` означает, что backend работает и видит базу.

Grafana и Prometheus слушают только localhost сервера, поэтому открывайте их
через SSH-туннель со своей машины:

```bash
ssh -N -L 3001:127.0.0.1:3001 -L 9090:127.0.0.1:9090 user@server
```

- `http://localhost:3001` — Grafana. Логин и пароль — `GRAFANA_ADMIN_USER` и
  `GRAFANA_ADMIN_PASSWORD` из `.env`. Dashboard состояния системы, backend и
  ASR лежат в папке «Тренажёр 112».
- `http://localhost:9090/targets` — цели Prometheus. `system112-backend` должен
  быть в состоянии UP. После развёртывания ветки ASR с `/metrics` цель
  `system112-asr` также должна быть UP.
- `http://localhost:9090/alerts` — pending/firing alerts с порогами и ссылками
  на runbook.

## Что показывает дашборд

| Панель                                    | О чём говорит                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Backend                                   | отвечает ли процесс на сбор метрик                                                                               |
| Открытые голосовые сессии                 | сколько операторов подключено к голосовому каналу                                                                |
| Запасные реплики за 15 мин                | доля ответов, которые написал движок, потому что модель дважды не справилась; рост означает проблемы с Alice AI  |
| Сорванные ходы за 15 мин                  | ходы, после которых оператор не услышал ответ                                                                    |
| Ожидание первого звука заявителя          | p50, p90 и p99 паузы до голоса заявителя; появляется после первого звонка                                        |
| Кто пишет реплики                         | реплики в минуту от модели и от движка                                                                           |
| Запросы по статусу, p95 по маршруту       | нагрузка и медленные маршруты API                                                                                |
| Задержка цикла событий, память, процессор | выдерживает ли процесс параллельные звонки: при занятом цикле событий кадры звука стоят в очереди, и речь рвётся |

Dashboard и источник данных заводятся из файлов в `observability/grafana`.
Правки в интерфейсе Grafana не сохраняются: меняйте JSON в репозитории и
перезапускайте сервис.

Полный список ASR/system панелей, alert thresholds, команды проверки и runbook
находятся в [`observability.md`](observability.md).

## 6. Подключение приложения

В `.env` настольного приложения укажите адрес сервера до сборки — Vite
встраивает его в приложение при сборке:

```bash
VITE_API_URL=https://system112.local
```

Адрес WebSocket приложение выводит из этого же значения: `http` становится
`ws`, `https` — `wss`.

## 7. Обновление

```bash
git pull && docker compose up -d --build
```

Миграции применяются автоматически: новый backend стартует только после того,
как backend применил миграции. Если миграция упала, контейнер уйдёт в перезапуск, а причина будет в журнале:
ошибкой, и причина будет в журнале:

```bash
docker compose logs backend
```

Если изменились файлы сценариев в `drizzle/seed/scenarios`, опубликуйте их
заново. Сид публикует новую версию только для изменённого сценария:

```bash
bun run db:seed
```

Старые образы после обновления можно удалить:

```bash
docker image prune -f
```

## 8. Резервные копии и восстановление

`postgres-backup` создаёт custom-format dump сразу после старта и затем через
`BACKUP_INTERVAL_SECONDS` (по умолчанию раз в сутки). `pg_dump` читает
согласованный снимок без остановки приложения. Перед публикацией файла сервис
проверяет каталог архива через `pg_restore --list`, затем пишет SHA-256 рядом с
ним. Незавершённый `.partial` никогда не считается копией.

По умолчанию файлы лежат в `var/backups`, хранятся 14 дней и имеют вид:

```text
system112-system112_training-20260916T120000Z.dump
system112-system112_training-20260916T120000Z.dump.sha256
```

Ручной backup:

```bash
docker compose --profile ops run --rm postgres-backup backup
```

Перед восстановлением обязательно выполните drill на чистой временной базе.
Команда проверит SHA-256, формат архива, восстановит его в новую базу, проверит
наличие прикладных таблиц и удалит временную базу:

```bash
docker compose --profile ops run --rm postgres-backup verify system112-system112_training-20260916T120000Z.dump
```

Live restore заменяет данные рабочей БД. Остановите вход и backend, сделайте
страховочный backup, затем передайте точное имя базы как подтверждение:

```bash
docker compose --profile app stop gateway backend
docker compose --profile ops run --rm postgres-backup backup
docker compose --profile ops run --rm -e RESTORE_CONFIRM_DATABASE=system112_training postgres-backup restore system112-system112_training-20260916T120000Z.dump
docker compose --profile app up -d backend gateway
```

Restore использует `--clean --if-exists --exit-on-error --single-transaction`:
ошибка не оставляет половину восстановленной схемы. Имя архива может быть
только basename из `BACKUP_DIRECTORY`; путь наружу и файл без checksum
отклоняются.

Записи звонков лежат в томе `system112_minio_data`. Префикс `system112` задаёт
`COMPOSE_PROJECT_NAME` из `.env`:

```bash
docker compose stop minio
docker run --rm -v system112_minio_data:/data:ro -v "$PWD":/backup alpine tar czf "/backup/recordings-$(date +%F).tar.gz" -C /data .
docker compose start minio
```

На это короткое окно запись новых фрагментов недоступна, поэтому выполняйте
операцию вне занятия. База и записи — разные наборы: сохраняйте их под одним
идентификатором окна обслуживания.

Храните копии не на том же сервере. Минимум раз в месяц выполняйте restore drill
для копии уже после её переноса во внешнее хранилище, а не для локального
исходника.

## 9. Журналы

```bash
docker compose logs -f backend
```

В production backend пишет только предупреждения и ошибки, в формате JSON. Те же
записи и журнал аудита лежат файлами в томе `system112_backend_logs`:

```bash
docker compose exec backend ls /app/logs
```

## 10. Внутренний TLS

NGINX из сервиса `gateway` завершает TLS 1.2/1.3 и проксирует обычные запросы и
WebSocket Upgrade в `backend:3000`. Порт 3000 не публикуется на хосте, поэтому
plaintext остаётся только внутри Docker-сети. Долгий `proxy_read_timeout`
сохраняет голосовой WebSocket на протяжении занятия.

Сертификат и ключ монтируются read-only. Для плановой замены положите новые
файлы по путям из `.env` и пересоздайте только gateway:

```bash
docker compose --profile app up -d --force-recreate gateway
```

Проверка конфигурации до выкладки:

```bash
bun run ops:check
```

ASR и TTS не публикуются наружу и доступны backend по закрытой сети. Их HTTP не
следует выводить за пределы одного доверенного серверного сегмента; если GPU-
узел отдельный, используйте его приватный адрес и сетевой ACL либо отдельный
TLS-туннель.

## 11. Безопасность

- `.env` не должен попадать в git; права на файл — `600`.
- TLS private key и backup-артефакты исключены из Git. Права на внешний каталог
  backup и ключ внутреннего CA выдавайте только эксплуатационной учётной записи.
- `POSTGRES_PASSWORD` и `GRAFANA_ADMIN_PASSWORD` применяются только при первом
  запуске, когда создаются база и хранилище Grafana. Позже изменение в `.env`
  ничего не меняет. Пароль базы меняется командой `ALTER USER` в `psql`, пароль
  Grafana — так:

  ```bash
  docker compose exec grafana grafana cli admin reset-admin-password NEW_PASSWORD
  ```

- Смена `JWT_SECRET` разлогинивает всех операторов.
- ASR (8787) и TTS (8091) не проверяют, кто к ним обращается. Никогда не
  публикуйте их на публичном адресе: привяжите к `127.0.0.1` или к частной сети,
  иначе любой сможет расходовать GPU сервера.
- Ключ Yandex Cloud, случайно попавший в чат, тикет или коммит, нужно отозвать и
  выпустить заново.

## 12. Остановка

```bash
docker compose down
```

> Не добавляйте `-v`: эта опция удаляет тома, то есть базу, записи звонков и
> историю метрик.

## Разработка на своей машине

Для разработки ничего не меняется: `docker compose up -d` без профиля поднимает
зависимости, а backend запускается на хосте через `bun run start:dev`. Чтобы
Prometheus читал метрики с хоста, в `.env` оставьте
`PROMETHEUS_CONFIG=prometheus.host.yml` — это значение из `.env.example`.

После обновления с версии без этого изменения `docker compose up -d` пересоздаст
PostgreSQL, MinIO и pgAdmin: теперь они слушают только localhost. Данные в томах
при этом сохраняются.

# Веб-клиент

Клиент — обычный сайт, отдельного desktop-приложения нет. Gateway собирает его
из соседнего репозитория `trainer-client` при сборке своего образа
(`docker/gateway/Dockerfile`, контекст `web-src`, путь меняется
`WEB_SOURCE_DIR`), раздаёт на `/`, а `/api/` вместе с WebSocket проксирует в
backend:

```bash
docker compose --profile app up -d --build gateway
```

После обновления клиента образ gateway нужно пересобрать той же командой.

REST, WebSocket, AudioWorklet и `getUserMedia` работают с одного HTTPS origin,
поэтому `CORS_ORIGINS` и `VITE_API_URL` не нужны. Микрофон браузер даёт только
на HTTPS или `localhost`: с self-signed сертификатом его нужно один раз принять
в браузере. Голосовой сокет несёт access token в `Sec-WebSocket-Protocol`
(`bearer, <token>`), потому что браузер не умеет ставить `Authorization` на
WebSocket; в URL токен не передаётся.
