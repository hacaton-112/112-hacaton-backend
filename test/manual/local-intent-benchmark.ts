import {
  LocalLlmAdapter,
  LocalLlmConfigSchema,
} from "@/modules/ai-gateway/adapters/local-llm/local-llm.adapter";
import type { FactQuestion } from "@/contracts";

/** Identical, synthetic intent corpus for Qwen / compatible BitNet servers.
 * No DB, no generated personal data, no automatic model download.
 * bun run test/manual/local-intent-benchmark.ts --model=training-model --rounds=3
 * --dry-run prints the corpus without contacting a server.
 */
const facts: FactQuestion[] = [
  { id: "address", label: "Адрес происшествия", question: "Назовите адрес" },
  {
    id: "conscious",
    label: "Сознание пострадавшего",
    question: "Пострадавший в сознании?",
  },
  {
    id: "count",
    label: "Количество пострадавших",
    question: "Сколько пострадавших?",
  },
  {
    id: "age",
    label: "Возраст пострадавшего",
    question: "Сколько лет пострадавшему?",
  },
  { id: "caller_name", label: "Имя заявителя", question: "Как вас зовут?" },
];
const cases: { question: string; expected: string[] }[] = [
  { question: "Назовите адрес", expected: ["address"] },
  { question: "Куда направить бригаду?", expected: ["address"] },
  {
    question: "Человек реагирует, если с ним разговаривать?",
    expected: ["conscious"],
  },
  {
    question: "Помощь нужна одному или нескольким людям?",
    expected: ["count"],
  },
  {
    question: "Не спрашиваю адрес, скажите возраст пострадавшего",
    expected: ["age"],
  },
  {
    question: "Сколько пострадавших и где это произошло?",
    expected: ["count", "address"],
  },
  { question: "Как зовут пострадавшего?", expected: [] },
  { question: "Как мне к вам обращаться?", expected: ["caller_name"] },
  { question: "Постарайтесь успокоиться", expected: [] },
  { question: "Повторите, пожалуйста", expected: [] },
  { question: "Какой у него пульс?", expected: [] },
  { question: "Есть ли рядом опасность?", expected: [] },
];
async function main(): Promise<void> {
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ facts, cases }, null, 2));
    return;
  }
  const option = (name: string, fallback: string) =>
    process.argv
      .find((arg) => arg.startsWith("--" + name + "="))
      ?.split("=")[1] ?? fallback;
  const rounds = Number(option("rounds", "3"));
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 100)
    throw new Error("rounds: 1..100");
  const config = LocalLlmConfigSchema.parse({
    baseUrl: option("base-url", "http://127.0.0.1:8080/v1"),
    model: option("model", "training-model"),
    timeoutMs: Number(option("timeout-ms", "2500")),
    intentTimeoutMs: Number(option("timeout-ms", "2500")),
  });
  const adapter = new LocalLlmAdapter(config);
  const measurements: {
    correct: boolean;
    durationMs: number;
    failed: boolean;
  }[] = [];
  for (let round = 0; round < rounds; round++) {
    for (const [index, test] of cases.entries()) {
      const start = performance.now();
      let actual: readonly string[] = [];
      let error: string | undefined;
      try {
        actual = await adapter.understand(
          {
            requestId: "bench-" + round + "-" + index,
            operatorText: test.question,
            facts,
          },
          new AbortController().signal,
        );
      } catch (cause) {
        error = cause instanceof Error ? cause.message : "failed";
      }
      const durationMs = performance.now() - start;
      const correct =
        !error &&
        JSON.stringify([...actual].sort()) ===
          JSON.stringify([...test.expected].sort());
      measurements.push({ correct, durationMs, failed: Boolean(error) });
      console.log(
        JSON.stringify({
          round,
          question: test.question,
          expected: test.expected,
          actual,
          correct,
          durationMs,
          error,
        }),
      );
    }
  }
  const sorted = measurements
    .map((row) => row.durationMs)
    .sort((a, b) => a - b);
  const quantile = (p: number) =>
    sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
  console.log(
    JSON.stringify({
      modelAlias: config.model,
      server: config.baseUrl,
      rounds,
      total: measurements.length,
      correct: measurements.filter((row) => row.correct).length,
      failed: measurements.filter((row) => row.failed).length,
      p50Ms: quantile(0.5),
      p95Ms: quantile(0.95),
      note: "Sequential intent-only benchmark; includes cold first request. Record actual model SHA/quantization, server version, CPU and thread settings separately. Not a ten-call load test.",
    }),
  );
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
