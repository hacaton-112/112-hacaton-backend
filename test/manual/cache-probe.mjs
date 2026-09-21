/**
 * Проверяет, переиспользует ли llama-server KV-кеш между ходами звонка.
 *
 * prompt_n — сколько токенов промпта сервер посчитал заново. Если префикс
 * стабилен, на втором ходу это число должно быть намного меньше первого.
 *
 *   docker compose run --rm --no-deps -v $PWD/test:/app/test \
 *     --entrypoint bun backend test/manual/cache-probe.mjs
 */

const BASE_URL = process.env.LLM_BASE_URL ?? "http://local-llm:8080/v1";

const SYSTEM = "Ты заявитель в учебном звонке 112. Отвечай коротко по-русски.";
const PERSONA =
  "РОЛЬ ЗАЯВИТЕЛЯ:\nМужчина, 34 года. Волнение, быстрая речь. Говорит рублеными фразами, часто сбивается, дышит тяжело. Фон: двор, крики соседей, сирены вдалеке.";
const DELIVERY = [
  "КАК ЗВУЧИТ СЕЙЧАС:\nСейчас он взвинчен. Короткие фразы, обрывы.",
  "КАК ЗВУЧИТ СЕЙЧАС:\nСейчас он в панике. Кричит, глотает окончания.",
];
const TURNS = [
  "Оператор: Служба 112, что случилось?",
  "Заявитель: Горит квартира на пятом этаже!",
  "Оператор: Назовите адрес.",
  "Заявитель: Улица Учебная, дом двенадцать!",
  "Оператор: В квартире есть люди?",
  "Заявитель: Там двое детей!",
];

const join = (parts) => parts.join("\n\n");

/** Подача в конце: префикс не меняется между ходами. */
const stablePrefix = (turn) =>
  join([
    PERSONA,
    "ИСТОРИЯ:\n" + TURNS.slice(0, 4 + turn * 2).join("\n"),
    "ДОПУСТИМЫЕ СВЕДЕНИЯ:\n1. В квартире двое детей.",
    DELIVERY[turn],
  ]);

/** Подача в начале: меняется весь префикс, как было до правки. */
const volatilePrefix = (turn) =>
  join([
    PERSONA + " " + DELIVERY[turn].split("\n")[1],
    "ИСТОРИЯ:\n" + TURNS.slice(0, 4 + turn * 2).join("\n"),
    "ДОПУСТИМЫЕ СВЕДЕНИЯ:\n1. В квартире двое детей.",
  ]);

async function ask(user) {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "training-model",
      stream: false,
      temperature: 0,
      max_tokens: 16,
      cache_prompt: true,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });
  const json = await response.json();
  const timings = json.timings ?? {};
  return {
    prompt_n: timings.prompt_n,
    prompt_ms: Math.round(timings.prompt_ms ?? 0),
  };
}

for (const [name, layout] of [
  ["подача в начале (было)", volatilePrefix],
  ["подача в конце (стало)", stablePrefix],
]) {
  const first = await ask(layout(0));
  const second = await ask(layout(1));
  console.log(
    `${name}: ход1 prompt_n=${first.prompt_n} (${first.prompt_ms}ms), ` +
      `ход2 prompt_n=${second.prompt_n} (${second.prompt_ms}ms)`,
  );
}
