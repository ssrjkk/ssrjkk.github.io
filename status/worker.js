// Живой статус витрины ssrjkk.github.io.
//
// GitHub Actions умеет только обещать `cron: */15`: на бесплатном плане расписание
// задерживается, и замеры давали паузы 3ч26 — 7ч53 вместо четверти часа. Cloudflare
// Cron Triggers отрабатывают по факту, поэтому опрос живёт здесь, а хаб читает этот
// эндпоинт напрямую: страница больше не зависит от коммита и пересборки Pages.
//
// Формат payload тот же, что отдавал прежний продюсер на Actions (probe_method не
// менялся), поэтому история переехала в KV и uptime не начался с нуля.

export const PROBE_METHOD = "complete-response-readiness-v1";
export const HISTORY_LIMIT = 60;
export const KV_KEY = "status:latest";
export const STALE_AFTER_MS = 30 * 60 * 1000;
const PROBE_TIMEOUT_MS = 9000;
const PROBE_ATTEMPTS = 2;
const RETRY_DELAY_MS = 2000;
const MAX_BODY_BYTES = 2_000_000;

// (id, имя на витрине, URL, ожидаемое поле readiness) — ровно то, что показано на хабе.
export const TARGETS = [
  { id: "hub", name: "Хаб", url: "https://ssrjkk.github.io/" },
  { id: "bothive", name: "Bothive", url: "https://ssrjkk.github.io/bothive/" },
  { id: "raven", name: "Raven", url: "https://ssrjkk.github.io/raven/" },
  { id: "agent-skills", name: "Agent Skills", url: "https://ssrjkk.github.io/agent-skills/" },
  { id: "drafter", name: "Drafter", url: "https://ssrjkk.github.io/drafter/" },
  { id: "ezzoffer", name: "EZZoffer", url: "https://ssrjkk.github.io/ezzoffer/" },
  { id: "harvest", name: "Harvest", url: "https://ssrjkk.github.io/harvest/" },
  { id: "shroud", name: "Shroud", url: "https://ssrjkk.github.io/shroud/" },
  { id: "wake", name: "Wake · сайт", url: "https://wake-7k6.pages.dev/" },
  {
    id: "wake-api",
    name: "Wake · API",
    url: "https://wake-backend-production-3483.up.railway.app/ready",
    expect: "ready"
  },
  { id: "tippy", name: "Tippy on Base", url: "https://tippy-egi.pages.dev/" },
  { id: "tippy-pages", name: "Tippy on Base · Pages", url: "https://ssrjkk.github.io/tippy-on-base/" },
  { id: "corvid", name: "Corvid CRM", url: "https://ssrjkk.github.io/corvid_crm/" },
  { id: "verso", name: "Verso", url: "https://ssrjkk.github.io/verso/" },
  { id: "volley", name: "Volley", url: "https://ssrjkk.github.io/volley/" },
  { id: "mobius", name: "Mobius", url: "https://ssrjkk.github.io/mobius/" },
  { id: "noema", name: "Noema", url: "https://ssrjkk.github.io/noema/" },
  { id: "qa-arsenal", name: "QA Arsenal", url: "https://ssrjkk.github.io/qa-arsenal/" },
  { id: "qualix", name: "Qualix", url: "https://ssrjkk.github.io/qualix/" },
  { id: "b2w", name: "B2W Crypto", url: "https://ssrjkk.github.io/b2w-crypto-tg-bot/" },
  { id: "tt-bot", name: "TT Bot", url: "https://ssrjkk.github.io/tt_bot/" },
  { id: "twinby", name: "Twinby", url: "https://ssrjkk.github.io/twinby-swipe-bot/" }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Одна цель. «Up» засчитывается только когда ответ прочитан целиком: Content-Length
// больше фактических байт — это усечённый ответ, а не работающий сайт.
export async function probe(target, {
  fetchImpl = fetch,
  timeoutMs = PROBE_TIMEOUT_MS,
  attempts = PROBE_ATTEMPTS,
  delayMs = RETRY_DELAY_MS
} = {}) {
  let code = 0;
  let ms = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const start = Date.now();
    let ok = false;
    try {
      const response = await fetchImpl(target.url, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": "ssrjkk-hub-status/2.0", "Cache-Control": "no-cache" }
      });
      code = response.status;
      const bytes = new Uint8Array(await response.arrayBuffer());
      ms = Date.now() - start;
      const declared = response.headers.get("content-length");
      const complete = declared === null || Number(declared) === bytes.length;
      ok = code >= 200 && code < 400 && bytes.length <= MAX_BODY_BYTES && complete;
      if (ok && target.expect) {
        // API считается живым, только когда он сам говорит, что готов: страница с 200
        // и JSON с другим статусом одинаково бесполезны пользователю.
        let payload = null;
        try {
          payload = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          payload = null;
        }
        ok = Boolean(payload) && typeof payload === "object" && !Array.isArray(payload)
          && payload.status === target.expect;
      }
    } catch {
      ms = Date.now() - start;
      code = 0;
      ok = false;
    }
    if (ok) return { ok: true, code, ms };
    if (attempt < attempts) await sleep(delayMs);
  }
  return { ok: false, code, ms };
}

// История прошлого прогона годна, только если метод проверки не менялся: uptime со
// смешанных методик читался бы как выдуманная цифра.
function historyFrom(previous, id) {
  if (!previous || previous.probe_method !== PROBE_METHOD || !Array.isArray(previous.targets)) return [];
  const found = previous.targets.find((target) => target.id === id);
  return Array.isArray(found?.history) ? found.history.slice(-HISTORY_LIMIT) : [];
}

function buildPayload(results, previous, now) {
  const targets = TARGETS.map((target) => {
    const outcome = results.get(target.id);
    const history = [...historyFrom(previous, target.id), outcome.ok ? 1 : 0].slice(-HISTORY_LIMIT);
    return {
      id: target.id,
      name: target.name,
      url: target.url,
      ok: outcome.ok,
      code: outcome.code,
      ms: outcome.ms,
      uptime: Math.round((1000 * history.filter(Boolean).length) / history.length) / 10,
      history
    };
  });
  return {
    probe_method: PROBE_METHOD,
    generated_at: `${now.toISOString().slice(0, 19)}Z`,
    targets,
    summary: {
      total: targets.length,
      up: targets.filter((target) => target.ok).length,
      down: targets.filter((target) => !target.ok).length
    }
  };
}

export async function runProbe(env, { fetchImpl = fetch, now = new Date() } = {}) {
  const outcomes = await Promise.all(
    TARGETS.map(async (target) => [target.id, await probe(target, { fetchImpl, ...(env.PROBE_TIMEOUT_MS ? { timeoutMs: Number(env.PROBE_TIMEOUT_MS) } : {}) })])
  );
  const stored = await env.STATUS_KV.get(KV_KEY);
  let previous = null;
  if (stored) {
    try {
      previous = JSON.parse(stored);
    } catch {
      previous = null;
    }
  }
  const payload = buildPayload(new Map(outcomes), previous, now);
  await env.STATUS_KV.put(KV_KEY, JSON.stringify(payload));
  return payload;
}

// Свежим считается не старше двух пропусков расписания: данные старше получаса уже
// не «живой статус», даже если поле generated_at на месте.
export function isFresh(payload, now = Date.now()) {
  if (!payload?.generated_at) return false;
  const stamp = Date.parse(payload.generated_at);
  return Number.isFinite(stamp) && now - stamp <= STALE_AFTER_MS;
}

function json(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function storedPayload(env) {
  const raw = await env.STATUS_KV.get(KV_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return "broken";
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "x-status-key",
          "Access-Control-Max-Age": "86400",
          "Cache-Control": "no-store"
        }
      });
    }

    if (url.pathname === "/health") {
      const payload = await storedPayload(env);
      if (payload === null) return new Response("NO DATA", { status: 503, headers: { "Cache-Control": "no-store" } });
      if (payload === "broken") return new Response("BAD DATA", { status: 500, headers: { "Cache-Control": "no-store" } });
      const fresh = isFresh(payload);
      return new Response(fresh ? "OK" : "STALE", {
        status: fresh ? 200 : 503,
        headers: { "Cache-Control": "no-store" }
      });
    }

    if (url.pathname === "/refresh") {
      if (request.method !== "POST") return json('{"error":"POST only"}', 405);
      // Ключ задаётся через `wrangler secret put STATUS_KEY`. Без секрета refresh
      // закрыт, а не открыт наружу.
      const expected = env.STATUS_KEY ?? "";
      if (!expected) return json('{"error":"STATUS_KEY is not set"}', 500);
      const given = request.headers.get("x-status-key") ?? "";
      let same = given.length === expected.length;
      for (let index = 0; index < given.length; index += 1) {
        // Сравнение без раннего выхода: длина и содержимое проверяются целиком,
        // иначе перебор угадывает ключ по времени ответа.
        same = same && given.charCodeAt(index) === expected.charCodeAt(index);
      }
      if (!same) return json('{"error":"forbidden"}', 403);
      const payload = await runProbe(env, { fetchImpl: env.PROBE_FETCH ?? fetch });
      return json(JSON.stringify(payload.summary));
    }

    if (url.pathname !== "/") return json('{"error":"not found"}', 404);

    const stored = await env.STATUS_KV.get(KV_KEY);
    if (!stored) return json('{"error":"no probe yet"}', 503);
    return json(stored);
  },

  async scheduled(event, env) {
    await runProbe(env, { fetchImpl: env.PROBE_FETCH ?? fetch, now: new Date(event?.scheduledTime ?? Date.now()) });
  }
};
