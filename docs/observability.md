# Наблюдаемость и предупреждения

Стек закрывает эксплуатационный разрыв из `AUDIT.md`: backend и ASR отдают
Prometheus-метрики, Prometheus вычисляет recording/alerting rules, а Grafana
автоматически получает источник данных и три dashboard из репозитория.

## Схема

```text
backend :9464/metrics ─┐
                       ├─> Prometheus :9090 ─> Grafana :3001
ASR :8787/metrics ─────┘          │
                                  └─> recording и alerting rules
```

Порты Prometheus/Grafana по умолчанию опубликованы только на loopback. Backend
metrics port доступен только внутри compose-сети. ASR `/metrics` находится на
его основном HTTP-порту и не имеет авторизации: порт ASR должен быть доступен
только backend/Prometheus в приватной сети или ограничен firewall.

## Dashboard

Все dashboard read-only и загружаются из `observability/grafana/dashboards`:

- **Тренажёр 112 — состояние системы**: оба target, активные сессии, HTTP rate,
  ошибки, p95 и временная шкала alert rules;
- **Тренажёр 112 — backend**: голосовой pipeline, fallback-реплики, HTTP и
  ресурсы Node.js;
- **Тренажёр 112 — ASR**: WebSocket-сессии, очередь inference, результаты и
  latency Whisper, real-time factor, VAD/transport errors и HTTP API.

Grafana использует фиксированный datasource UID `system112-prometheus`, поэтому
dashboard не зависят от автоматически присвоенного идентификатора.

## Recording rules

`observability/prometheus/rules/system112.rules.yml` сохраняет часто
используемые агрегаты:

- backend request rate, 5xx ratio и HTTP p95;
- p95 ожидания первого звука заявителя;
- ASR request rate, 5xx ratio, transcription p95/error ratio;
- ASR real-time factor: секунды обработки финалов / секунды аудио.

Окна в 5–10 минут подавляют единичные всплески. Histogram quantile считается
после агрегации bucket по `le`, как требует модель Prometheus histogram.

## Alert rules

| Alert                                 | Порог                             | Задержка | Severity |
| ------------------------------------- | --------------------------------- | -------: | -------- |
| `System112BackendDown`                | target `DOWN`                     |    1 мин | critical |
| `System112AsrDown`                    | target `DOWN`                     |    1 мин | critical |
| `System112BackendHighHttpErrorRate`   | 5xx > 5%, есть трафик             |    5 мин | warning  |
| `System112BackendHttpLatencyHigh`     | общий HTTP p95 > 2 с              |   10 мин | warning  |
| `System112BackendEventLoopLagHigh`    | event loop p99 > 250 мс           |    5 мин | warning  |
| `System112VoicePipelineFailures`      | ≥ 3 сорванных хода / 10 мин       |    1 мин | warning  |
| `System112VoiceFallbackRateHigh`      | fallback > 20%, ≥ 5 реплик        |    5 мин | warning  |
| `System112VoiceSessionCapacity`       | ≥ 20 голосовых сессий             |    5 мин | warning  |
| `System112AsrHighErrorRate`           | inference errors > 5%             |    5 мин | warning  |
| `System112AsrLatencyHigh`             | transcription p95 > 5 с           |   10 мин | warning  |
| `System112AsrInferenceQueueSaturated` | in-flight/queued inference > 1    |    5 мин | warning  |
| `System112AsrWebsocketErrors`         | ≥ 3 transport/VAD errors / 10 мин |    1 мин | warning  |

Правила видны в Prometheus `/rules` и `/alerts`, а их состояния — на системном
dashboard Grafana через метрику `ALERTS`. Для внешних уведомлений следует
подключить Alertmanager или Grafana contact point конкретного контура; секреты
почты/мессенджера намеренно не хранятся в репозитории.

## Проверка конфигурации

```bash
promtool check config observability/prometheus.yml
promtool check rules observability/prometheus/rules/system112.rules.yml
jq empty observability/grafana/dashboards/*.json
docker compose config --quiet
```

После запуска:

```bash
curl -fsS http://127.0.0.1:9464/metrics
curl -fsS http://127.0.0.1:8787/metrics
curl -fsS http://127.0.0.1:9090/api/v1/targets
curl -fsS http://127.0.0.1:9090/api/v1/rules
```

## Runbook

### Target down

Проверьте `/health`, контейнер/процесс и адрес target в `/targets`. Для ASR
дополнительно проверьте наличие модели, CUDA runtime и доступность порта 8787
из контейнера Prometheus. Для backend проверьте, что `METRICS_ENABLED=true` и
порт 9464 доступен внутри compose-сети.

### Backend HTTP errors

Сгруппируйте 5xx по `route` на backend dashboard, затем сопоставьте время с
Winston logs. Не перезапускайте сервис до сохранения ошибки и stack trace.

### Backend latency

Найдите медленный route, затем проверьте event-loop lag, CPU, память, БД и
задержки внешних AI/TTS адаптеров. Глобальный p95 выше двух секунд нарушает
целевой отклик UI, но генеративные маршруты анализируйте отдельно.

### Backend event loop

Проверьте CPU и heap, синхронные операции и объём одновременных звонков.
Длительный lag способен задерживать WebSocket frames даже при свободном ASR.

### Voice pipeline failures

Сопоставьте `kind` с логами генерации/TTS. Проверьте доступность локальной модели и
Piper, таймауты и ошибки потоковой передачи первого аудио.

### Voice fallbacks

Проверьте ответы и latency LLM, ошибки JSON/schema validation и таймауты.
Fallback сохраняет звонок работоспособным, но высокая доля означает деградацию.

### Voice capacity

Проверьте first-audio p95, ASR очередь, event-loop lag и CPU/RAM. Alert означает
достижение требуемых 20 сессий, а не автоматическое доказательство отказа.

### ASR errors

Проверьте CUDA/Whisper logs, свободную VRAM/RAM и входной PCM. Отделяйте
`outcome="empty"` (тишина) от настоящего `outcome="error"`.

### ASR latency

Сравните transcription duration, audio duration и real-time factor. Если
`system112_asr_inferences > 1`, основная задержка — очередь перед единичным
Whisper gate; иначе исследуйте GPU и размер аудиосегментов.

### ASR queue

Whisper inference в текущей архитектуре сериализован одним semaphore. Снизьте
число одновременных partial, проверьте GPU или масштабируйте ASR только после
выноса одноразовых pending sessions во внешнее хранилище/маршрутизацию.

### ASR WebSocket

Разделите ошибки по `kind`: `receive` указывает на транспорт/клиент, `send` —
на закрывшийся канал, `vad` — на Silero runtime. `invalid_pcm` и
`invalid_command` считаются клиентскими ошибками и не входят в alert.
