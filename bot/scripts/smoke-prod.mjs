// Смоук против задеплоенного воркера. Тесты гоняют воркер на моках и не видят того,
// что бывает только в проде: версия не раскатилась по edge, KV отвалилась, секрет
// вебхука перестал проверяться. Проверки три: живость, счётчики каталога и охрана
// /webhook. Любая падает кодом возврата 1 — без «пропустили, если таймаут».
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_URL = "https://ssrjkk-bot.ray013lefe.workers.dev";
export const ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 15000;

function readData() {
  return JSON.parse(readFileSync(join(ROOT, "projects.json"), "utf8"));
}

// Воркер считает sites и bots тем же способом, что и карточки, — сверяем прод с
// projects.json из репозитория, а не с числами, которые кто-то переписал руками.
export function buildExpectation(data) {
  return {
    projects: data.projects.length,
    sites: data.projects.filter((project) => project.site).length,
    bots: data.projects.filter((project) => project.bot).length
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Повторяем только сбой транспорта и 5xx: у Cloudflare это холодный старт или
// раскатка версии по edge. Другой статус — это ответ прода, его повторяют только
// чтобы замаскировать поломку.
async function request(fetchImpl, url, init, { attempts, retryDelayMs }) {
  let failure = "ни одной попытки";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      const text = await res.text();
      failure = `HTTP ${res.status}`;
      if (res.status >= 500 && attempt < attempts) {
        await sleep(retryDelayMs);
        continue;
      }
      return { status: res.status, text, json: parseJson(text) };
    } catch (error) {
      failure = String(error?.message ?? error);
      if (attempt < attempts) await sleep(retryDelayMs);
    }
  }
  return { status: 0, text: "", json: null, error: failure };
}

// Что писать в отчёте: исчерпанные попытки, ответ прода или первые строки тела.
// Статус без тела в CI бесполезен — его и так видно, а «почему» теряется.
function answered(res) {
  return res.error ? `${res.status} ${res.error}` : `${res.status} ${res.text.trim().slice(0, 60)}`;
}

export async function runChecks(fetchImpl, options = {}) {
  const {
    baseUrl = DEFAULT_URL,
    data = readData(),
    attempts = ATTEMPTS,
    retryDelayMs = RETRY_DELAY_MS
  } = options;
  const expected = buildExpectation(data);
  const results = [];

  const health = await request(fetchImpl, `${baseUrl}/health`, {}, { attempts, retryDelayMs });
  results.push({
    name: "health",
    ok: health.status === 200 && health.text.trim() === "OK",
    detail: answered(health)
  });

  const root = await request(fetchImpl, `${baseUrl}/`, {}, { attempts, retryDelayMs });
  const reported = root.json ?? {};
  const drifted = Object.entries(expected).filter(([key]) => reported[key] !== expected[key]);
  results.push({
    name: "counts",
    ok: root.status === 200 && drifted.length === 0,
    detail:
      root.status !== 200
        ? answered(root)
        : drifted.length
          ? `разошлось с projects.json: ${drifted.map(([key, value]) => `${key}=${reported[key]} ждали ${value}`).join(", ")}`
          : Object.entries(expected).map(([key, value]) => `${key}=${value}`).join(" ")
  });

  // Пустой update: если проверка секрета однажды отпадёт, воркер не обработает ничего,
  // но смоук это увидит — 200 вместо 403.
  const hook = await request(
    fetchImpl,
    `${baseUrl}/webhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ update_id: 0 })
    },
    { attempts, retryDelayMs }
  );
  results.push({ name: "webhook guard", ok: hook.status === 403, detail: answered(hook) });

  return { results, ok: results.every((result) => result.ok) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseUrl = (process.env.WORKER_URL ?? DEFAULT_URL).replace(/\/+$/, "");
  const { results, ok } = await runChecks(fetch, { baseUrl });
  for (const result of results) {
    console.log(`${result.ok ? "OK  " : "FAIL"} ${result.name}: ${result.detail}`);
  }
  console.log(
    `${baseUrl}: ${results.filter((result) => result.ok).length}/${results.length} проверок пройдено`
  );
  // process.exit() на Windows обрывает живые handle'ы fetch, и Node падает ассертом
  // libuv уже после вывода результата. Ставим код возврата и даём петле догореть.
  process.exitCode = ok ? 0 : 1;
}
