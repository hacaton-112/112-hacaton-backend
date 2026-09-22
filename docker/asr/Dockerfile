# syntax=docker/dockerfile:1
# CPU-образ распознавания речи с моделями внутри.
#
# Распознаёт Sherpa-ONNX: русский Zipformer в int8 и Silero VAD. Такой же
# образ работает на боевом сервере — прежняя сборка на Whisper.cpp давала
# заметно худший разбор русской речи и здесь больше не используется.
#
# Исходники сервиса лежат в соседнем репозитории asr-service и приходят сюда
# отдельным контекстом `asr-src` (см. docker-compose.yml). Модели зашиты в
# образ: сервису не нужен ни разовый контейнер-загрузчик, ни каталог моделей
# на хосте.

FROM curlimages/curl:8.16.0 AS models
ARG ASR_MODEL_URL=https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-zipformer-ru-int8-2025-04-20.tar.bz2
ARG VAD_MODEL_URL=https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx
USER root
RUN mkdir -p /models \
    && curl -fL --retry 8 --retry-all-errors --retry-delay 3 -sS -o /tmp/asr-model.tar.bz2 "$ASR_MODEL_URL" \
    && tar -xjf /tmp/asr-model.tar.bz2 -C /models \
    && rm /tmp/asr-model.tar.bz2 \
    && curl -fL --retry 8 --retry-all-errors --retry-delay 3 -sS -o /models/silero_vad.onnx "$VAD_MODEL_URL" \
    # Сервис берёт файлы по именам: без них контейнер поднимется и упадёт уже на первом звонке.
    && test -f /models/sherpa-onnx-zipformer-ru-int8-2025-04-20/encoder.int8.onnx \
    && test -f /models/sherpa-onnx-zipformer-ru-int8-2025-04-20/decoder.onnx \
    && test -f /models/sherpa-onnx-zipformer-ru-int8-2025-04-20/joiner.int8.onnx \
    && test -f /models/sherpa-onnx-zipformer-ru-int8-2025-04-20/tokens.txt

FROM python:3.12-slim
RUN for attempt in $(seq 1 10); do \
        apt-get update \
        && apt-get install -y --no-install-recommends libgomp1 \
        && break; \
        sleep 5; \
    done \
    && rm -rf /var/lib/apt/lists/*
# Версия sherpa-onnx взята с работающего сервера: API пакета меняется, и
# собранный позже образ мог бы разойтись с настроенным голосовым конвейером.
RUN pip install --no-cache-dir \
    sherpa-onnx==1.13.8 \
    soundfile==0.13.1 \
    aiohttp==3.12.15 \
    numpy==2.3.3
WORKDIR /app
COPY --from=asr-src sherpa-asr/sherpa_full_service.py ./
COPY --from=models /models /models
ENV SHERPA_MODEL_DIR=/models/sherpa-onnx-zipformer-ru-int8-2025-04-20 \
    SHERPA_VAD_MODEL=/models/silero_vad.onnx \
    SHERPA_PORT=8787 \
    SHERPA_THREADS=6
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=6 \
    CMD ["python3", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8787/health')"]
CMD ["python3", "sherpa_full_service.py"]
