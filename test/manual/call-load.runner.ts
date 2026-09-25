import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { Client } from "pg";
import WebSocket from "ws";

import { resamplePcm16Mono } from "@/modules/ai-gateway/domain/tts-diagnostic";

/**
 * Нагрузочный прогон учебных звонков против запущенного backend.
 *
 * Отвечает на один вопрос: сколько параллельных звонков процесс держит, не
 * начиная опаздывать. Синтетические операторы шлют один и тот же WAV в реальном
 * темпе, поэтому очередь на распознавании и задержка цикла событий растут так
 * же, как на занятии с живыми людьми.
 *
 *   bun run start:dev
 *   bun run load:calls -- --clients=5 --turns=3 --wav=./sample.wav
 *
 * Требуется учётная запись оператора (`bun run user:create`) и хотя бы один
 * опубликованный сценарий (`bun run db:seed`).
 */
const DEFAULTS = {
  api: "http://127.0.0.1:3000/api/v1",
  clients: 3,
  turns: 3,
  email: "operator@example.test",
  password: "Sm0keRunnerPassword",
};

/** Кадр в 100 мс: столько же шлёт настоящий клиент на Tauri. */
const FRAME_MS = 100;
const SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = 2;
const FRAME_BYTES = (SAMPLE_RATE * BYTES_PER_SAMPLE * FRAME_MS) / 1_000;

interface Options {
  api: string;
  clients: number;
  turns: number;
  email: string;
  password: string;
  wav: string | null;
  scenarioVersionId: string | null;
}

interface TurnMeasurement {
  /** От listen.stop до listen.stopped: распознавание плюс очередь к нему. */
  recogniseMs: number;
  /**
   * Та же величина за вычетом времени, которое сервис реально считал.
   *
   * С детектором речи распознавание идёт уже во время реплики, и вычитаемое
   * включает работу, сделанную до отпускания кнопки. Поэтому цифра стала чаще
   * упираться в ноль и показывает уже не очередь, а лишь её остаток после
   * фразы. Ждёт оператор ровно `recogniseMs`.
   */
  queueMs: number;
  /** От listen.stop до первого байта голоса заявителя. */
  answerMs: number;
}

const parseOptions = (argv: readonly string[]): Options => {
  const values = new Map<string, string>();

  for (const argument of argv) {
    const match = /^--([a-zA-Z-]+)=(.*)$/.exec(argument);

    if (match) {
      values.set(match[1], match[2]);
    }
  }

  return {
    api: values.get("api") ?? DEFAULTS.api,
    clients: Number(values.get("clients") ?? DEFAULTS.clients),
    turns: Number(values.get("turns") ?? DEFAULTS.turns),
    email: values.get("email") ?? DEFAULTS.email,
    password: values.get("password") ?? DEFAULTS.password,
    wav: values.get("wav") ?? null,
    scenarioVersionId: values.get("scenario") ?? null,
  };
};

/**
 * Читает WAV и отдаёт голые отсчёты.
 *
 * Заголовок разбирается по чанкам, а не по фиксированным смещениям: записи из
 * реальных программ несут перед `fmt ` служебные чанки, и разбор «по адресу 22»
 * читал бы на их месте мусор. Формат проверяется строго — молча отправленный
 * стереофайл дал бы вдвое более быструю речь и неверные цифры.
 */
const readPcm = async (path: string): Promise<Uint8Array> => {
  const file = await readFile(path);
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const ascii = (offset: number): string =>
    String.fromCharCode(...file.subarray(offset, offset + 4));

  if (ascii(0) !== "RIFF" || ascii(8) !== "WAVE") {
    throw new Error(`${path}: not a WAV file`);
  }

  let format: { channels: number; sampleRate: number; bits: number } | null =
    null;
  let offset = 12;

  while (offset + 8 <= file.byteLength) {
    const chunk = ascii(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (chunk === "fmt ") {
      format = {
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    }

    if (chunk === "data") {
      if (format === null) {
        throw new Error(`${path}: the data chunk comes before the format`);
      }

      if (
        format.channels !== 1 ||
        format.bits !== 16
      ) {
        throw new Error(
          `${path}: expected mono PCM16, got ${format.channels}ch ${format.sampleRate}Hz ${format.bits}bit`,
        );
      }

      const pcm = new Uint8Array(file.subarray(body, body + size));

      return format.sampleRate === SAMPLE_RATE
        ? pcm
        : resamplePcm16Mono(pcm, format.sampleRate, SAMPLE_RATE);
    }

    // Размер чанка выравнивается до чётного, сам он это в себя не включает.
    offset = body + size + (size % 2);
  }

  throw new Error(`${path}: the file carries no audio`);
};

/** Ровная синтетическая речь на случай, когда файла под рукой нет. */
const syntheticPcm = (seconds: number): Uint8Array => {
  const samples = SAMPLE_RATE * seconds;
  const pcm = new Uint8Array(samples * BYTES_PER_SAMPLE);
  const view = new DataView(pcm.buffer);

  for (let index = 0; index < samples; index += 1) {
    const value = Math.sin((index / SAMPLE_RATE) * 2 * Math.PI * 180) * 8_000;
    view.setInt16(index * BYTES_PER_SAMPLE, Math.round(value), true);
  }

  return pcm;
};

const login = async (options: Options): Promise<string> => {
  const response = await fetch(`${options.api}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: options.email,
      password: options.password,
    }),
  }).catch(() => {
    throw new Error(
      `${options.api} is not answering. Start the backend with "bun run start:dev".`,
    );
  });

  if (!response.ok) {
    throw new Error(
      `Login failed with HTTP ${response.status}. Create an operator with "bun run user:create".`,
    );
  }

  const session = (await response.json()) as { accessToken: string };

  return session.accessToken;
};

const findAssignment = async (
  email: string,
  scenarioVersionId: string | null,
): Promise<{ assignmentId: string; scenarioVersionId: string }> => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const result = await client.query<{
      assignment_id: string;
      scenario_version_id: string;
    }>(
      `select a.id as assignment_id, a.scenario_version_id
       from training_assignments a
       join users u on u.email = $1
       where a.status = 'in_progress'
         and ($2::text is null or a.scenario_version_id = $2)
         and (
           a.target_user_id = u.id
           or exists (
             select 1 from training_group_members gm
             where gm.group_id = a.group_id and gm.user_id = u.id
           )
         )
       order by a.created_at desc
       limit 1`,
      [email, scenarioVersionId],
    );
    const assignment = result.rows[0];

    if (assignment === undefined) {
      throw new Error(
        `No runnable assignment found for ${email}. Run "bun run db:seed" first.`,
      );
    }

    return {
      assignmentId: assignment.assignment_id,
      scenarioVersionId: assignment.scenario_version_id,
    };
  } finally {
    await client.end();
  }
};

const runtimeHealth = async (api: string): Promise<Record<string, unknown>> => {
  try {
    const response = await fetch(`${api}/health/runtime`);

    return (await response.json()) as Record<string, unknown>;
  } catch {
    // Отчёт о прогоне важнее этой строки: сервер мог не пережить нагрузку.
    return { unavailable: true };
  }
};

class SyntheticOperator {
  private readonly socket: WebSocket;
  private readonly waiting = new Map<string, (event: JsonEvent) => void>();
  private pending: (() => void) | null = null;
  readonly turns: TurnMeasurement[] = [];
  private firstAudioAt: number | null = null;
  /** Оборванное соединение важнее таймаута: он бы скрыл настоящую причину. */
  private closed: string | null = null;
  failure: string | null = null;

  constructor(
    private readonly url: string,
    token: string,
  ) {
    this.socket = new WebSocket(this.url, {
      headers: { authorization: `Bearer ${token}` },
    });

    this.socket.on("close", (code, reason) => {
      this.closed = `closed with ${code} ${reason.toString() || "(no reason)"}`;
      this.wake();
    });

    this.socket.on("error", (error: Error) => {
      this.closed = error.message;
      this.wake();
    });

    this.socket.on("message", (data, isBinary) => {
      if (isBinary) {
        this.firstAudioAt ??= performance.now();

        return;
      }

      const event = JSON.parse(String(data)) as JsonEvent;

      if (event.type === "error") {
        // Ждать таймаута незачем: ход звонка уже не состоится, а причина
        // отказа полезнее, чем «не дождались события».
        this.failure ??= String(event.code);
        this.wake();

        return;
      }

      this.waiting.get(event.type)?.(event);
    });
  }

  async run(
    scenarioVersionId: string,
    assignmentId: string,
    turns: number,
    pcm: Uint8Array,
  ): Promise<void> {
    await once(this.socket, "open");

    this.send({ type: "start", scenarioVersionId, assignmentId });
    await this.expect("call.offered");

    this.send({ type: "accept" });
    await this.expect("call.accepted");
    await this.expect("audio.done");

    for (let turn = 0; turn < turns; turn += 1) {
      await this.speak(pcm);
    }

    this.send({ type: "end" });
    await this.expect("call.ended");
  }

  /** Открытый сокет держит и процесс прогона, и звонок на сервере. */
  close(): void {
    this.socket.close();
  }

  private async speak(pcm: Uint8Array): Promise<void> {
    this.firstAudioAt = null;
    this.send({ type: "listen.start" });
    await this.expect("listen.started");

    // Темп настоящий: сервис распознавания и цикл событий должны увидеть ту же
    // нагрузку, что и на занятии, а не пачку кадров одним куском.
    for (let offset = 0; offset < pcm.byteLength; offset += FRAME_BYTES) {
      this.socket.send(pcm.subarray(offset, offset + FRAME_BYTES));
      await delay(FRAME_MS);
    }

    const startedAt = performance.now();
    this.send({ type: "listen.stop" });

    const stopped = await this.expect("listen.stopped");
    const recognisedAt = performance.now();

    await this.expect("audio.done");

    this.turns.push({
      recogniseMs: recognisedAt - startedAt,
      queueMs: Math.max(
        0,
        recognisedAt - startedAt - Number(stopped.processingMs ?? 0),
      ),
      answerMs: (this.firstAudioAt ?? recognisedAt) - startedAt,
    });
  }

  private send(command: Record<string, unknown>): void {
    this.socket.send(JSON.stringify(command));
  }

  private expect(type: string): Promise<JsonEvent> {
    return new Promise((resolve, reject) => {
      if (this.closed !== null) {
        reject(new Error(`${this.closed} while waiting for ${type}`));

        return;
      }

      const timer = setTimeout(() => {
        this.waiting.delete(type);
        this.pending = null;
        reject(
          new Error(
            `Timed out waiting for ${type}${
              this.failure === null ? "" : ` after error ${this.failure}`
            }`,
          ),
        );
      }, 60_000);

      this.pending = () => {
        clearTimeout(timer);
        this.waiting.delete(type);
        this.pending = null;
        reject(
          new Error(
            `${
              this.closed ?? `server answered ${this.failure ?? "an error"}`
            } while waiting for ${type}`,
          ),
        );
      };

      this.waiting.set(type, (event) => {
        clearTimeout(timer);
        this.waiting.delete(type);
        this.pending = null;
        resolve(event);
      });
    });
  }

  private wake(): void {
    this.pending?.();
  }
}

type JsonEvent = Record<string, unknown> & { type: string };

const once = (socket: WebSocket, event: "open"): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.once(event, () => {
      resolve();
    });
    socket.once("error", reject);
  });

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const percentile = (values: readonly number[], share: number): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.floor(share * (sorted.length - 1)),
  );

  return Math.round(sorted[index]);
};

const report = (label: string, values: readonly number[]): void => {
  console.log(
    `${label.padEnd(22)} p50 ${String(percentile(values, 0.5)).padStart(6)} ms` +
      `   p95 ${String(percentile(values, 0.95)).padStart(6)} ms` +
      `   max ${String(percentile(values, 1)).padStart(6)} ms`,
  );
};

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const token = await login(options);
  const assignment = await findAssignment(
    options.email,
    options.scenarioVersionId,
  );
  const pcm =
    options.wav === null ? syntheticPcm(3) : await readPcm(options.wav);
  const url = `${options.api.replace(/^http/, "ws")}/voice-pipeline/stream`;

  console.log(
    `• ${options.clients} operators, ${options.turns} turns each, ${
      pcm.byteLength / (SAMPLE_RATE * BYTES_PER_SAMPLE)
    }s of speech per turn`,
  );

  // Чтение обнуляет окно измерения, поэтому первое — это старт отсчёта.
  await runtimeHealth(options.api);

  const startedAt = performance.now();
  const operators = Array.from(
    { length: options.clients },
    () => new SyntheticOperator(url, token),
  );

  const outcomes = await Promise.allSettled(
    operators.map((operator) =>
      operator.run(
        assignment.scenarioVersionId,
        assignment.assignmentId,
        options.turns,
        pcm,
      ),
    ),
  );

  for (const operator of operators) {
    operator.close();
  }

  const failed = outcomes.filter((outcome) => outcome.status === "rejected");
  const turns = operators.flatMap((operator) => operator.turns);

  console.log(
    `• ${turns.length} turns in ${Math.round(
      (performance.now() - startedAt) / 1_000,
    )}s, ${failed.length} operators failed`,
  );

  for (const outcome of failed) {
    console.log(`  ! ${String((outcome as PromiseRejectedResult).reason)}`);
  }

  report(
    "recognition",
    turns.map((turn) => turn.recogniseMs),
  );
  report(
    "queue wait",
    turns.map((turn) => turn.queueMs),
  );
  report(
    "speech to answer",
    turns.map((turn) => turn.answerMs),
  );

  console.log("• backend runtime", await runtimeHealth(options.api));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
