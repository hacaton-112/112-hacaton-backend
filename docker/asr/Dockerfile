# syntax=docker/dockerfile:1
# CPU-образ распознавания речи с моделями внутри.
#
# Исходники лежат в соседнем репозитории asr-service и приходят сюда отдельным
# контекстом `asr-src` (см. docker-compose.yml). Модели Whisper и Silero VAD
# зашиты в образ: так сервису не нужен ни разовый контейнер-загрузчик, ни
# каталог моделей на хосте.

FROM rust:bookworm AS builder
RUN for attempt in $(seq 1 10); do \
        apt-get update \
        && apt-get install -y --no-install-recommends cmake clang libclang-dev \
        && break; \
        sleep 5; \
    done \
    && command -v cmake \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=asr-src Cargo.toml Cargo.lock ./
COPY --from=asr-src src ./src
RUN cargo build --locked --release --no-default-features

FROM curlimages/curl:8.16.0 AS models
ARG WHISPER_MODEL_URL=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin
ARG VAD_MODEL_URL=https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin
USER root
RUN mkdir -p /models \
    && curl -fL --retry 8 --retry-all-errors --retry-delay 3 -sS -o /models/ggml-small-q5_1.bin "$WHISPER_MODEL_URL" \
    && curl -fL --retry 8 --retry-all-errors --retry-delay 3 -sS -o /models/ggml-silero-v6.2.0.bin "$VAD_MODEL_URL"

FROM debian:bookworm-slim
RUN for attempt in $(seq 1 10); do \
        apt-get update \
        && apt-get install -y --no-install-recommends ca-certificates libstdc++6 libgomp1 \
        && break; \
        sleep 5; \
    done \
    && test -f /usr/lib/x86_64-linux-gnu/libgomp.so.1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/asr-service ./asr-service
COPY --from=models /models /models
ENV WHISPER_DEVICE=cpu \
    WHISPER_PARTIALS_ENABLED=false \
    WHISPER_MODEL_PATH=/models/ggml-small-q5_1.bin \
    WHISPER_VAD_MODEL_PATH=/models/ggml-silero-v6.2.0.bin
EXPOSE 8787
# В slim-образе нет curl: достаточно того, что порт принимает соединения.
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=6 \
    CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/8787"]
ENTRYPOINT ["./asr-service"]
