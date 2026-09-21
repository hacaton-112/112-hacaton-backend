/**
 * Решающий опыт: можно ли обойтись ОДНИМ вызовом модели вместо двух.
 *
 * Модели отдаётся весь набор фактов, разрешённых жёсткими правилами сценария,
 * и она сама выбирает, чем отвечать. Проверяется два свойства:
 *   1) берёт ли она факт, о котором реально спросили;
 *   2) не вываливает ли остальное без спроса.
 *
 * Гоняется на обеих моделях: 0.6B и 1.7B.
 *
 *   docker compose run --rm --no-deps -v $PWD/test:/app/test \
 *     --entrypoint bun backend test/manual/one-call-probe.mjs
 */

const DEFAULT_ENDPOINTS = [
  { name: "Gemma4 Q4_0 (2710M)", url: "http://172.18.0.10:8080/v1" },
  { name: "Gemma4 QAT-Q4_K_XL (2499M)", url: "http://172.18.0.9:8080/v1" },
  { name: "Gemma4 Q3_K_M (2419M)", url: "http://172.18.0.11:8080/v1" },
];
const ENDPOINTS = process.env.PROBE_URL
  ? [
      {
        name: process.env.PROBE_NAME ?? process.env.PROBE_URL,
        url: process.env.PROBE_URL,
      },
    ]
  : DEFAULT_ENDPOINTS;
const RUNS = Number(process.env.PROBE_RUNS ?? 3);
const MAX_TOKENS = Number(process.env.PROBE_MAX_TOKENS ?? 160);
const COMPACT = process.env.PROBE_COMPACT === "1";

// Факты S-015, доступные на этом ходу: never и below_panic отфильтрованы
// движком заранее, как и будет в новой схеме.
const FACTS = [
  "Горит квартира на пятом этаже, дым идёт по всему подъезду.",
  "Улица Учебная.",
  "Дом двенадцать, второй подъезд.",
  "Пятый этаж, квартира тридцать четыре.",
  "В квартире остались двое детей, они кричат из окна и выйти не могут.",
  "Дети в дальней комнате, дышат, но дверь в коридор уже горит.",
  "Заявитель стоит во дворе у детской площадки, видит окна квартиры.",
];

const NUMBERED = process.env.PROBE_NUMBERED === "1";

const FULL_SYSTEM = [
  "Ты живой заявитель в учебном звонке 112. Отвечай по-русски от первого лица, своими словами.",
  "Тебе дан список того, что ты знаешь.",
  "Отвечай ТОЛЬКО на то, о чём оператор спросил в последней реплике. Про остальное молчи, даже если знаешь.",
  "Если о спрошенном в списке ничего нет — скажи, что не знаешь. Ничего не выдумывай.",
  "Не копируй слова оператора.",
  ...(NUMBERED
    ? [
        "Не произноси номера пунктов.",
        "В f перечисли номера пунктов, которые действительно прозвучали в t. Если ни один — пустой список.",
        "Верни только компактный JSON {t, f}.",
      ]
    : ["Верни только компактный JSON {t} с одной репликой."]),
].join(" ");
const COMPACT_SYSTEM = [
  "Ты заявитель в звонке 112. Коротко ответь по-русски только на последний вопрос оператора.",
  "Бери сведения только из списка. Если ответа там нет, скажи, что не знаешь. Ничего не выдумывай.",
  "Место происшествия и место, где находишься ты сам, — разные сведения.",
  "Если ясного вопроса нет, переспроси и не раскрывай сведения.",
  "Верни только JSON {t} с репликой заявителя.",
].join(" ");
const SYSTEM = COMPACT ? COMPACT_SYSTEM : FULL_SYSTEM;

const HISTORY = [
  "Заявитель: Горит квартира! Пятый этаж, дым по всему подъезду!",
  "Оператор: Что у вас случилось?",
  "Заявитель: Горит квартира на пятом этаже, дым идёт по всему подъезду.",
].join("\n");

/** Как движок засчитывает факт: по словам содержания в самой реплике. */
const CONTENT_KEYWORDS = [
  [1, ["горит", "пожар", "дым"]],
  [2, ["учебн"]],
  [3, ["двенадцат", "подъезд"]],
  [4, ["пятый этаж", "тридцать четыре", "квартира тридцать"]],
  [5, ["двое детей", "дети кричат", "из окна"]],
  [6, ["дышат", "дальней комнате"]],
  [7, ["во дворе", "детской площадк"]],
];

const CASES = [
  { text: "ваш адрес", want: [2], forbid: [5, 6] },
  { text: "назовите точный адрес происшествия", want: [2], forbid: [5, 6] },
  { text: "где вы сами находитесь", want: [7], forbid: [5, 6] },
  { text: "в квартире есть дети?", want: [5], forbid: [2, 3] },
  { text: "они дышат?", want: [6], forbid: [2, 3] },
  { text: "э", want: [], forbid: [2, 5] },
];

const schema = NUMBERED
  ? {
      type: "object",
      additionalProperties: false,
      properties: {
        t: { type: "string", minLength: 1, maxLength: 500 },
        f: {
          type: "array",
          items: { type: "integer", enum: FACTS.map((_, i) => i + 1) },
          maxItems: FACTS.length,
        },
      },
      required: ["t", "f"],
    }
  : {
      type: "object",
      additionalProperties: false,
      properties: { t: { type: "string", minLength: 1, maxLength: 500 } },
      required: ["t"],
    };

function prompt(operatorText) {
  if (COMPACT) {
    return [
      `Оператор: ${operatorText}`,
      "Сведения:\n" + FACTS.map((value) => `- ${value}`).join("\n"),
    ].join("\n\n");
  }
  return [
    "РОЛЬ ЗАЯВИТЕЛЯ:\nМужчина, 34 года. Волнение, быстрая речь. Говорит рублеными фразами. Фон: двор, крики, сирена.",
    "ИСТОРИЯ:\n" + HISTORY,
    "ПОСЛЕДНЯЯ РЕПЛИКА ОПЕРАТОРА:\n" + operatorText,
    "ЧТО ТЫ ЗНАЕШЬ:\n" +
      FACTS.map((value, index) =>
        NUMBERED ? `${index + 1}. ${value}` : `- ${value}`,
      ).join("\n"),
    "КАК ОТВЕЧАТЬ:\nОтветь коротко и только на заданный вопрос.",
  ].join("\n\n");
}

async function ask(url, operatorText) {
  const started = performance.now();
  const response = await fetch(`${url}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "training-model",
      stream: false,
      temperature: 0.3,
      max_tokens: MAX_TOKENS,
      cache_prompt: true,
      chat_template_kwargs: { enable_thinking: false },
      reasoning_effort: "none",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt(operatorText) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "caller_reply",
          description: "Caller reply using only known facts",
          schema,
          strict: true,
        },
      },
    }),
  });
  const json = await response.json();
  const ms = performance.now() - started;
  try {
    const parsed = JSON.parse(json.choices[0].message.content);
    const spoken = parsed.t ?? "";
    const used = NUMBERED
      ? (parsed.f ?? [])
      : CONTENT_KEYWORDS.flatMap(([index, words]) =>
          words.some((word) => spoken.toLowerCase().includes(word))
            ? [index]
            : [],
        );
    return { ms, text: spoken, used };
  } catch {
    return { ms, text: "", used: ["<parse-error>"] };
  }
}

for (const endpoint of ENDPOINTS) {
  console.log(`\n=== ${endpoint.name} ===`);
  const timings = [];
  let good = 0;
  let total = 0;
  for (const { text, want, forbid } of CASES) {
    const verdicts = [];
    let sample = "";
    for (let run = 0; run < RUNS; run += 1) {
      let result;
      try {
        result = await ask(endpoint.url, text);
      } catch (error) {
        console.log(`  ${JSON.stringify(text)} -> недоступно: ${error.message}`);
        break;
      }
      timings.push(result.ms);
      sample = result.text;
      total += 1;
      const hasWanted = want.every((n) => result.used.includes(n));
      const leaked = forbid.some((n) => result.used.includes(n));
      const verdict = leaked
        ? "ЛИШНЕЕ"
        : hasWanted
          ? (good += 1, "ok")
          : "НЕ ОТВЕТИЛ";
      verdicts.push(verdict);
    }
    if (verdicts.length) {
      console.log(
        `  ${JSON.stringify(text)} -> ${verdicts.join(", ")}  «${sample.slice(0, 90)}»`,
      );
    }
  }
  if (timings.length) {
    timings.sort((a, b) => a - b);
    console.log(
      `  итог: ${good}/${total} годных, медиана ${Math.round(timings[Math.floor(timings.length / 2)])} мс`,
    );
  }
}
