/**
 * Проверяет, что реально доезжает до движка от речи оператора.
 *
 * Фраза озвучивается Piper'ом мужским голосом и отправляется в ASR ровно так,
 * как это делает клиент. Сравнивается сказанное и распознанное.
 *
 *   docker compose run --rm --no-deps -v $PWD/test:/app/test \
 *     --entrypoint bun backend test/manual/asr-probe.mjs
 */

const TTS = process.env.TTS_URL ?? "http://piper-tts:5000";
const ASR = process.env.ASR_URL ?? "http://asr:8787";

const PHRASES = [
  "Служба 112, что у вас случилось?",
  "Назовите точный адрес происшествия.",
  "Назовите ваш адрес.",
  "Где вы сейчас находитесь?",
  "В квартире есть люди или дети?",
  "Они в сознании, дышат?",
  "Какой номер дома?",
  "Пожарные уже выехали, оставайтесь на связи.",
];

const normalize = (value) =>
  value
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

/** Доля слов оригинала, уцелевших в расшифровке. */
function survival(said, heard) {
  const source = normalize(said).split(" ").filter(Boolean);
  const target = new Set(normalize(heard).split(" ").filter(Boolean));
  if (!source.length) return 0;
  const kept = source.filter((word) => target.has(word)).length;
  return kept / source.length;
}

async function synthesize(text) {
  const response = await fetch(`${TTS}/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/wav" },
    body: JSON.stringify({ text, voice: "ru_RU-dmitri-medium" }),
  });
  if (!response.ok) throw new Error(`TTS HTTP ${response.status}`);
  return response.arrayBuffer();
}

async function transcribe(wav) {
  const response = await fetch(`${ASR}/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: wav,
  });
  if (!response.ok) throw new Error(`ASR HTTP ${response.status}`);
  return response.json();
}

let totalSurvival = 0;
let exact = 0;

for (const phrase of PHRASES) {
  try {
    const wav = await synthesize(phrase);
    const result = await transcribe(wav);
    const heard = result.text ?? "";
    const rate = survival(phrase, heard);
    totalSurvival += rate;
    if (normalize(heard) === normalize(phrase)) exact += 1;
    console.log(
      `сказано:    ${phrase}\n` +
        `распознано: ${heard || "(пусто)"}\n` +
        `слов уцелело: ${Math.round(rate * 100)}%  ` +
        `аудио ${(result.audioDurationSec ?? 0).toFixed(2)}с  ` +
        `обработка ${Math.round(result.processingMs ?? 0)}мс  rtf ${result.rtf ?? "?"}\n`,
    );
  } catch (error) {
    console.log(`сказано: ${phrase}\nОШИБКА: ${error.message}\n`);
  }
}

console.log(
  `итог: дословно совпало ${exact}/${PHRASES.length}, ` +
    `слов уцелело в среднем ${Math.round((totalSurvival / PHRASES.length) * 100)}%`,
);
