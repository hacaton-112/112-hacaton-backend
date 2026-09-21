/**
 * Сравнивает разбор вопроса оператора с рассуждением и без него.
 *
 * Берёт настоящее тело запроса, снятое со звонка (/root/probe-intent.json),
 * и гоняет его несколько раз в обоих режимах на разных фразах оператора.
 *
 *   docker compose run --rm --no-deps -v $PWD/test:/app/test -v /root:/host \
 *     --entrypoint bun backend test/manual/intent-thinking-probe.mjs
 */

const BASE_URL = process.env.LLM_BASE_URL ?? "http://local-llm:8080/v1";
const SOURCE = process.env.PROBE_BODY ?? "/host/probe-intent.json";
const RUNS = Number(process.env.PROBE_RUNS ?? 5);

const template = await Bun.file(SOURCE).json();
const facts = JSON.parse(template.messages[1].content).facts;

/** Что оператор спросил -> какие идентификаторы здесь правильные. */
const CASES = [
  { text: "ваш адрес", expect: ["address_street"] },
  { text: "назовите точный адрес", expect: ["address_street"] },
  { text: "где вы находитесь", expect: ["caller_position"] },
  { text: "в квартире есть дети", expect: ["trapped_children"] },
  { text: "э", expect: [] },
];

async function understand(operatorText, thinking) {
  const body = structuredClone(template);
  body.stream = false;
  body.chat_template_kwargs = { enable_thinking: thinking };
  body.reasoning_effort = thinking ? "low" : "none";
  body.max_tokens = thinking ? 512 : 64;
  body.messages[1].content = JSON.stringify({ facts, operatorText });

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  try {
    return JSON.parse(json.choices[0].message.content).askedFactIds ?? [];
  } catch {
    return ["<parse-error>"];
  }
}

const verdict = (got, expect) => {
  if (got.length === facts.length) return "ВСЕ";
  if (got.length === 0) return expect.length === 0 ? "ok" : "ПУСТО";
  const exact =
    got.length === expect.length && expect.every((id) => got.includes(id));
  if (exact) return "ok";
  return expect.every((id) => got.includes(id)) ? "шире" : "мимо";
};

for (const thinking of [false, true]) {
  console.log(`\n=== thinking ${thinking ? "ON" : "OFF"} ===`);
  for (const { text, expect } of CASES) {
    const verdicts = [];
    let sample = [];
    for (let run = 0; run < RUNS; run += 1) {
      const got = await understand(text, thinking);
      verdicts.push(verdict(got, expect));
      sample = got;
    }
    console.log(
      `${JSON.stringify(text)} -> ${verdicts.join(", ")}  (последний: ${
        sample.length === facts.length ? "весь список" : JSON.stringify(sample)
      })`,
    );
  }
}
