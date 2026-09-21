/**
 * Раскладывает задержку ответа на префилл и декод на реальном звонке.
 *
 * llama-server отдаёт timings: prompt_n/prompt_ms — сколько токенов промпта
 * посчитано заново и за сколько, predicted_n/predicted_ms — сколько
 * сгенерировано. Ходы идут подряд, поэтому со второго работает KV-кеш.
 *
 *   docker compose run --rm --no-deps -v $PWD/test:/app/test \
 *     --entrypoint bun backend test/manual/latency-probe.mjs
 */

const TARGETS = [
  { name: "студент v2 0.6B Q8_0", url: "http://system-112-student-test:8080/v1" },
  { name: "база 0.6B (прод)", url: "http://local-llm:8080/v1" },
];

// Формат промпта v2 — тот же, на котором учился студент (render_v2.py).
const SYSTEM =
  "Ты заявитель: сам звонишь в 112 за помощью. Ты не оператор и не диспетчер. " +
  "Отвечай только на последнюю реплику оператора и только тем, что знаешь.";

// S-015 — демо-сценарий «Пожар в жилом доме», факты из сида движка.
const PERSONA = "Мужчина 34 лет, волнуется, говорит быстро и рублеными фразами.";
const PANIC = "в панике, отвечает одним-двумя предложениями и сбивается на отдельных словах";
const FACTS = [
  "Горит квартира на пятом этаже, дым идёт по всему подъезду.",
  "Улица Учебная.",
  "Дом двенадцать, второй подъезд.",
  "Пятый этаж, квартира тридцать четыре.",
  "В квартире остались двое детей, они кричат из окна и выйти не могут.",
  "Дети в дальней комнате, дышат, но дверь в коридор уже горит.",
  "Заявитель стоит во дворе у детской площадки, видит окна квартиры.",
];

// Реплики в форме, в которой их отдаёт ASR: строчные, без пунктуации.
const TURNS = [
  "служба сто двенадцать что у вас случилось",
  "где вы находитесь",
  "ваш адрес",
  "в квартире есть люди",
  "э",
  "они дышат",
  "какие службы вы уже отправили",
  "помощь едет не кладите трубку",
];

function userPrompt(history, line) {
  const conversation = history
    .slice(-10)
    .map(([role, text]) => (role === "op" ? "Оператор: " : "Ты: ") + text)
    .join("\n");
  // Меняющиеся каждый ход паника и реплика оператора — в хвосте, чтобы
  // персона, факты и история оставались общим префиксом для KV-кеша.
  return (
    `Ты: ${PERSONA}\n` +
    `Знаешь:\n${FACTS.map((fact) => "- " + fact).join("\n")}\n` +
    `Разговор:\n${conversation || "(начало)"}\n` +
    `Сейчас: ${PANIC}\n` +
    `Оператор: ${line}`
  );
}

async function ask(url, history, line) {
  const started = performance.now();
  const response = await fetch(`${url}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "training-model",
      stream: false,
      temperature: 0.3,
      max_tokens: 80,
      cache_prompt: true,
      chat_template_kwargs: { enable_thinking: false },
      reasoning_effort: "none",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt(history, line) },
      ],
    }),
  });
  const json = await response.json();
  const wall = performance.now() - started;
  const t = json.timings ?? {};
  return {
    reply: (json.choices?.[0]?.message?.content ?? "").trim(),
    wall: Math.round(wall),
    promptN: t.prompt_n,
    promptMs: Math.round(t.prompt_ms ?? 0),
    predictedN: t.predicted_n,
    predictedMs: Math.round(t.predicted_ms ?? 0),
  };
}

for (const target of TARGETS) {
  console.log(`\n=== ${target.name} ===`);
  const history = [];
  for (const line of TURNS) {
    const r = await ask(target.url, history, line);
    console.log(
      `  ${JSON.stringify(line).padEnd(38)} всего ${String(r.wall).padStart(5)} мс | ` +
        `префилл ${String(r.promptN).padStart(3)} ток ${String(r.promptMs).padStart(4)} мс | ` +
        `декод ${String(r.predictedN).padStart(2)} ток ${String(r.predictedMs).padStart(4)} мс`,
    );
    console.log(`      «${r.reply.replace("\n", " | ").slice(0, 120)}»`);
    // Первая строка ответа — сдвиг паники и эмоция, в историю идёт только реплика.
    history.push(["op", line], ["me", r.reply.split("\n").at(-1)]);
  }
}
