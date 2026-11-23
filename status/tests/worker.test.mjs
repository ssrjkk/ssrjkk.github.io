import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import worker, {
  TARGETS,
  PROBE_METHOD,
  HISTORY_LIMIT,
  KV_KEY,
  STALE_AFTER_MS,
  probe,
  runProbe,
  isFresh
} from "../worker.js";

// сеть по умолчанию запрещена: тест без двойника падает с адресом запроса, а не
// уходит в прод из CI.
globalThis.fetch = async (input) => {
  throw new Error(`проверка полезла в сеть без двойника: ${String(input)}`);
};

function response({ status = 200, body = "hello", declared = body.length, headers = {} } = {}) {
  const bytes = new Uint8Array(Buffer.from(body));
  const entries = { ...headers };
  if (declared !== null) entries["content-length"] = String(declared);
  const map = new Map(Object.entries(entries));
  return {
    status,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    headers: { get: (name) => (map.has(name.toLowerCase()) ? map.get(name.toLowerCase()) : null) }
  };
}

const target = (overrides) => ({ id: "t", name: "T", url: "https://example.invalid/", ...overrides });

function envWith(previous = null) {
  const store = new Map();
  if (previous !== null) store.set(KV_KEY, typeof previous === "string" ? previous : JSON.stringify(previous));
  return {
    STATUS_KV: {
      get: async (key) => store.get(key) ?? null,
      put: async (key, value) => {
        store.set(key, value);
      }
    },
    store
  };
}

function allUp() {
  return async () => response({ status: 200, body: '{"status":"ready"}' });
}

test("a complete response counts as up", async () => {
  const outcome = await probe(target(), { fetchImpl: allUp() });
  assert.deepEqual(outcome, { ok: true, code: 200, ms: outcome.ms });
  assert.ok(outcome.ms >= 0);
});

test("a response shorter than its Content-Length is not up", async () => {
  const outcome = await probe(target(), { fetchImpl: async () => response({ body: "hel", declared: 10 }), attempts: 1 });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, 200, "усечённый ответ остаётся ответом 200 — это важно для отчёта");
});

test("maintenance keeps the http code", async () => {
  const outcome = await probe(target(), { fetchImpl: async () => response({ status: 503, body: "down" }), attempts: 1 });
  assert.deepEqual({ ok: outcome.ok, code: outcome.code }, { ok: false, code: 503 });
});

test("a ready api is up and a not-ready api is down", async () => {
  const ready = await probe(target({ expect: "ready" }), {
    fetchImpl: async () => response({ body: '{"status":"ready"}' }),
    attempts: 1
  });
  assert.equal(ready.ok, true);
  const busy = await probe(target({ expect: "ready" }), {
    fetchImpl: async () => response({ body: '{"status":"maintenance"}' }),
    attempts: 1
  });
  assert.equal(busy.ok, false, "JSON с другим статусом — сервис не готов");
});

test("an html page is not a ready api", async () => {
  const outcome = await probe(target({ expect: "ready" }), { fetchImpl: async () => response({ body: "<html>" }), attempts: 1 });
  assert.equal(outcome.ok, false);
});

test("an array json is not a ready api", async () => {
  const outcome = await probe(target({ expect: "ready" }), {
    fetchImpl: async () => response({ body: '["ready"]' }),
    attempts: 1
  });
  assert.equal(outcome.ok, false, "readiness ищется в объекте, а не в любом теле");
});

test("a body over the read cap is not up", async () => {
  const outcome = await probe(target(), {
    fetchImpl: async () => response({ body: "x".repeat(2_000_001) }),
    attempts: 1
  });
  assert.equal(outcome.ok, false);
});

test("a transport error retries once and can still pass", async () => {
  let calls = 0;
  const outcome = await probe(target(), {
    delayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new Error("socket closed");
      return response({});
    }
  });
  assert.equal(calls, 2, "первая попыка упала, вторая читает ответ");
  assert.equal(outcome.ok, true);
});

test("a transport error that never recovers reports code 0", async () => {
  const outcome = await probe(target(), { delayMs: 0, fetchImpl: async () => {
    throw new Error("timeout");
  } });
  assert.deepEqual({ ok: outcome.ok, code: outcome.code }, { ok: false, code: 0 });
});

test("a response without Content-Length is judged by the bytes it gave", async () => {
  const withoutLength = await probe(target(), {
    attempts: 1,
    fetchImpl: async () => response({ body: "chunked", declared: null })
  });
  assert.equal(withoutLength.ok, true, "chunked-ответ не считается усечённым");
  const brokenLength = await probe(target(), {
    attempts: 1,
    fetchImpl: async () => response({ body: "abc", declared: "not-a-number" })
  });
  assert.equal(brokenLength.ok, false, "не число в Content-Length читается как битый ответ");
});

test("without an injected fetch the probe falls back to the platform one", async () => {
  const real = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    return response({ body: '{"status":"ready"}' });
  };
  try {
    const env = envWith();
    await worker.scheduled({ scheduledTime: Date.parse("2026-11-11T12:00:00Z") }, env);
    assert.equal(seen.length, TARGETS.length, "каждая цель опросилась платформенным fetch");
    assert.equal(JSON.parse(env.store.get(KV_KEY)).summary.up, TARGETS.length);
  } finally {
    globalThis.fetch = real;
  }
});

test("runProbe writes the payload and keeps the history window", async () => {
  const env = envWith();
  const okFetch = allUp();
  const payload = await runProbe(env, {
    now: new Date("2026-11-11T12:00:00.500Z"),
    fetchImpl: async (url) =>
      String(url) === "https://tippy-egi.pages.dev/" ? response({ status: 503, body: "x" }) : okFetch(url)
  });
  assert.equal(payload.probe_method, PROBE_METHOD);
  assert.equal(payload.generated_at, "2026-11-11T12:00:00Z", "без дробей и с суффиксом Z");
  assert.equal(payload.targets.length, TARGETS.length);
  assert.deepEqual(payload.summary, { total: TARGETS.length, up: TARGETS.length - 1, down: 1 });
  assert.equal(payload.targets[0].history.length, 1);
  assert.equal(payload.targets.find((item) => item.id === "tippy").uptime, 0, "up=0 в первом же прогоне");
  assert.equal(env.store.get(KV_KEY), JSON.stringify(payload), "прогон сохранён ровно в том виде, что отдаётся наружу");
});

test("history continues from a compatible previous probe and caps at the window", async () => {
  const history = Array.from({ length: HISTORY_LIMIT }, (_, index) => (index % 2 === 0 ? 1 : 0));
  const previous = {
    probe_method: PROBE_METHOD,
    targets: TARGETS.map((item) => ({ ...item, history, uptime: 50 }))
  };
  const payload = await runProbe(envWith(previous), { fetchImpl: allUp(), now: new Date() });
  const first = payload.targets[0];
  assert.equal(first.history.length, HISTORY_LIMIT, "окно не растёт бесконечно");
  assert.equal(first.history.at(-1), 1);
  assert.equal(first.history.at(-2), history.at(-1), "старые проверки остались в том же порядке");
  assert.ok(first.uptime > 49 && first.uptime < 52, `uptime считается по окну, получено ${first.uptime}`);
});

test("history from another probe method is dropped, not averaged", async () => {
  const previous = {
    probe_method: "an-older-method",
    targets: TARGETS.map((item) => ({ ...item, history: [1, 1, 1, 1] }))
  };
  const payload = await runProbe(envWith(previous), { fetchImpl: allUp(), now: new Date() });
  assert.deepEqual(payload.targets[0].history, [1], "uptime только от текущего метода");
  assert.equal(payload.targets[0].uptime, 100);
});

test("a payload stored as garbage does not break the next run", async () => {
  const payload = await runProbe(envWith("{not json"), { fetchImpl: allUp(), now: new Date() });
  assert.equal(payload.targets[0].history.length, 1);
});

test("isFresh accepts a run inside the schedule window and rejects older ones", () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  const stamp = (offset) => ({ generated_at: new Date(now - offset).toISOString().slice(0, 19) + "Z" });
  assert.equal(isFresh(stamp(0), now), true);
  assert.equal(isFresh(stamp(15 * 60 * 1000), now), true);
  assert.equal(isFresh(stamp(STALE_AFTER_MS + 1000), now), false);
  assert.equal(isFresh({}, now), false, "без метки времени данные не свежие");
  assert.equal(isFresh(null, now), false, "пустой кэш — не свежие");
  assert.equal(isFresh({ generated_at: "вчера" }, now), false, "метку, которую нельзя распарсить, нельзя назвать свежей");
});

test("GET / serves the stored payload with CORS and no cache", async () => {
  const payload = { probe_method: PROBE_METHOD, summary: { total: 1, up: 1, down: 0 } };
  const env = envWith(payload);
  const response = await worker.fetch(new Request("https://status.workers.dev/"), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(await response.text(), JSON.stringify(payload));
});

test("GET / before the first probe says there is no data", async () => {
  const response = await worker.fetch(new Request("https://status.workers.dev/"), envWith());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "no probe yet" });
});

test("GET /health tells OK, STALE and NO DATA apart", async () => {
  const stamp = (offsetMs) => new Date(Date.now() - offsetMs).toISOString().slice(0, 19) + "Z";
  const request = () => new Request("https://status.workers.dev/health");

  const ok = await worker.fetch(request(), envWith({ generated_at: stamp(5 * 60 * 1000) }));
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "OK");

  const stale = await worker.fetch(request(), envWith({ generated_at: stamp(2 * 60 * 60 * 1000) }));
  assert.equal(stale.status, 503);
  assert.equal(await stale.text(), "STALE", "двухчасовые данные не называются живыми");

  const empty = await worker.fetch(request(), envWith());
  assert.equal(empty.status, 503);
  assert.equal(await empty.text(), "NO DATA");

  const broken = await worker.fetch(request(), envWith("{not json"));
  assert.equal(broken.status, 500);
  assert.equal(await broken.text(), "BAD DATA");
});

test("OPTIONS preflight answers the headers the hub needs", async () => {
  const response = await worker.fetch(new Request("https://status.workers.dev/", { method: "OPTIONS" }), envWith());
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.match(response.headers.get("Access-Control-Allow-Methods"), /POST/);
  assert.equal(response.headers.get("Access-Control-Allow-Headers"), "x-status-key");
});

test("POST /refresh is closed without the secret and opens the probe with it", async () => {
  const env = envWith();
  env.STATUS_KEY = "sensitive-key";
  env.PROBE_FETCH = allUp();

  const wrong = await worker.fetch(
    new Request("https://status.workers.dev/refresh", { method: "POST", headers: { "x-status-key": "guessed" } }),
    env
  );
  assert.equal(wrong.status, 403, "не тот ключ не запускает опрос");

  const short = await worker.fetch(
    new Request("https://status.workers.dev/refresh", { method: "POST", headers: { "x-status-key": "sen" } }),
    env
  );
  assert.equal(short.status, 403, "ключ не принимается по префиксу");

  const right = await worker.fetch(
    new Request("https://status.workers.dev/refresh", { method: "POST", headers: { "x-status-key": "sensitive-key" } }),
    env
  );
  assert.equal(right.status, 200);
  assert.deepEqual(await right.json(), { total: TARGETS.length, up: TARGETS.length, down: 0 });
  assert.ok(env.store.get(KV_KEY), "ручной прогон сохранён так же, как прогон по расписанию");

  const noSecret = await worker.fetch(new Request("https://status.workers.dev/refresh", { method: "POST" }), envWith());
  assert.equal(noSecret.status, 500, "без STATUS_KEY refresh закрыт, а не открыт");

  const noHeader = await worker.fetch(new Request("https://status.workers.dev/refresh", { method: "POST" }), env);
  assert.equal(noHeader.status, 403, "запрос совсем без заголовка не проходит");

  const get = await worker.fetch(new Request("https://status.workers.dev/refresh"), env);
  assert.equal(get.status, 405);
});

test("the scheduled event probes and stores", async () => {
  const env = envWith();
  env.PROBE_FETCH = allUp();
  await worker.scheduled({ scheduledTime: Date.parse("2026-11-11T12:00:00Z") }, env);
  const payload = JSON.parse(env.store.get(KV_KEY));
  assert.equal(payload.generated_at, "2026-11-11T12:00:00Z", "метка берётся из события, а не из времени процесса");
  assert.equal(payload.summary.up, TARGETS.length);
});

test("unknown paths say not found", async () => {
  const response = await worker.fetch(new Request("https://status.workers.dev/nope"), envWith());
  assert.equal(response.status, 404);
});

test("probe without options takes the platform fetch and the built-in timings", async () => {
  const real = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, options) => {
    seen.push(String(url));
    assert.ok(options.signal, "запрос без таймаута оставил бы воркер висеть на мёртвом хосте");
    return response({});
  };
  try {
    const outcome = await probe(target());
    assert.equal(outcome.ok, true);
    assert.deepEqual(seen, [target().url]);
  } finally {
    globalThis.fetch = real;
  }
});

test("runProbe without options still probes every target", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => response({ body: '{"status":"ready"}' });
  try {
    const payload = await runProbe(envWith());
    assert.equal(payload.summary.up, TARGETS.length);
    assert.match(payload.generated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  } finally {
    globalThis.fetch = real;
  }
});

test("PROBE_TIMEOUT_MS from the environment caps the wait", async () => {
  const env = envWith();
  env.PROBE_TIMEOUT_MS = "40";
  let aborted = 0;
  const payload = await runProbe(env, {
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        aborted += 1;
        reject(new Error("подвешенный хост"));
      });
    })
  });
  assert.ok(aborted > 0, "таймаут реально отменяет запрос, а не остаётся числом в env");
  assert.equal(payload.summary.up, 0);
  assert.equal(payload.targets[0].code, 0);
});

test("history restarts when the previous probe has nothing to continue from", async () => {
  const noEntry = { probe_method: PROBE_METHOD, targets: [] };
  const first = await runProbe(envWith(noEntry), { fetchImpl: allUp(), now: new Date() });
  assert.deepEqual(first.targets[0].history, [1], "цель без прошлой истории начинает с одного сэмпла");

  const notAnArray = {
    probe_method: PROBE_METHOD,
    targets: TARGETS.map((item, index) => ({ ...item, history: index === 0 ? null : [1, 0] }))
  };
  const second = await runProbe(envWith(notAnArray), { fetchImpl: allUp(), now: new Date() });
  assert.deepEqual(second.targets[0].history, [1], "null вместо истории не усредняется");
  assert.deepEqual(second.targets[1].history, [1, 0, 1]);

  const noTargets = { probe_method: PROBE_METHOD, targets: null };
  const third = await runProbe(envWith(noTargets), { fetchImpl: allUp(), now: new Date() });
  assert.deepEqual(third.targets[0].history, [1], "битый массив целей не роняет прогон");
});

test("an api down on http is not revived by a ready body", async () => {
  const outcome = await probe(target({ expect: "ready" }), {
    attempts: 1,
    fetchImpl: async () => response({ status: 503, body: '{"status":"ready"}' })
  });
  assert.deepEqual({ ok: outcome.ok, code: outcome.code }, { ok: false, code: 503 });
});

test("a scheduled event without a timestamp stamps the run with the current time", async () => {
  const env = envWith();
  env.PROBE_FETCH = allUp();
  await worker.scheduled(undefined, env);
  const payload = JSON.parse(env.store.get(KV_KEY));
  const age = Date.now() - Date.parse(payload.generated_at);
  assert.ok(age >= -5000 && age < 60_000, `метка проставлена процессом, расхождение ${age} мс`);
});

// Гейт расхождения: список целей и витрина не должны разъезжаться. Пока опрос жил в
// Actions, ссылка без проверки молча оставалась на странице.
const strip = (url) => url.replace(/\/+$/, "");
const HUB_HOST = "ssrjkk.github.io";
// Хост берём из разобранного URL: подстрока домена проходит и внутри
// https://ssrjkk.github.io.evil/, и после решётки в чужом адресе.
const hostOf = (url) => new URL(url).hostname;
const hubHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
// Только страницы: карточки хаба всегда кончаются слэшем, а ссылки на данные
// (skills_catalog.json) — это файл, а не сервис, который можно опросить.
const hubPages = [...hubHtml.matchAll(/href="(https:\/\/ssrjkk\.github\.io\/[^"]*?)"/g)]
  .map((match) => match[1])
  .filter((url) => url.endsWith("/") && !url.includes("?"))
  .map(strip);

test("every page the hub links is probed", () => {
  const probed = new Set(TARGETS.map((item) => strip(item.url)));
  for (const url of hubPages) {
    assert.ok(probed.has(url), `хаб ссылается на ${url}, но в статусе этой цели нет`);
  }
  assert.ok(hubPages.length >= 18, `на хабе ${hubPages.length} страниц — проверка не должна стать пустой`);
});

test("every probed github.io page is really on the hub", () => {
  const linked = new Set(hubPages);
  for (const item of TARGETS) {
    if (hostOf(item.url) !== HUB_HOST) continue;
    assert.ok(linked.has(strip(item.url)), `${item.id} опрашивается, но на хабе такой ссылки нет`);
  }
});

test("external targets are pinned to the deployments the hub advertises", () => {
  const external = TARGETS.filter((item) => hostOf(item.url) !== HUB_HOST);
  assert.deepEqual(
    external.map((item) => item.id),
    ["wake", "wake-api", "tippy"],
    "список внешних целей меняется только вместе с хабом"
  );
  assert.ok(hubHtml.includes("wake-7k6.pages.dev"), "сайт Wake стоит на витрине ссылкой");
  assert.ok(hubHtml.includes("tippy-on-base"), "Tippy остаётся проектом витрины");
  assert.deepEqual(
    external.filter((item) => item.expect).map((item) => item.url),
    ["https://wake-backend-production-3483.up.railway.app/ready"],
    "readiness ожидается ровно от одного API — другой JSON не нужен"
  );
});

test("target ids and names are unique", () => {
  assert.equal(new Set(TARGETS.map((item) => item.id)).size, TARGETS.length);
  assert.equal(new Set(TARGETS.map((item) => item.name)).size, TARGETS.length);
});

// Второй источник правды о статусе — это то, из-за чего «каждые 15 минут» и
// разошлись с реальностью: закоммиченный снапшот обновляется тогда, когда GitHub
// соблаговолит запустить планировщик.
const STATUS_URL = "https://ssrjkk-status.ray013lefe.workers.dev/";

test("the hub reads the live endpoint instead of a committed snapshot", () => {
  assert.ok(hubHtml.includes(`var STATUS_URL = "${STATUS_URL}"`), "хаб обязан брать статус с воркера");
  assert.ok(!hubHtml.includes("status.json"), "закоммиченный status.json как источник статуса вернуться не должен");
  const timeout = hubHtml.match(/AbortSignal\.timeout\((\d+)\)/);
  assert.ok(timeout, "междоменный fetch без таймаута оставляет строку статуса пустой на полминуты");
  assert.ok(Number(timeout[1]) <= 10_000, `ожидание ответа ${timeout[1]} мс — дольше, чем пустая строка стоит терпеть`);
  const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.match(wrangler, /crons = \["\*\/15 \* \* \* \*"\]/, "обещание на странице стоит ровно до тех пор, пока работает расписание");
});

test("the hub calls data stale exactly where the worker does", () => {
  const bound = hubHtml.match(/if \(mins > (\d+)\)/);
  assert.ok(bound, "на странице должен быть явный порог устаревания статуса");
  assert.equal(Number(bound[1]) * 60 * 1000, STALE_AFTER_MS, "страница и /health должны называть устаревшим одно и то же");
  assert.match(hubHtml, /\.sb-updated\.stale\{/, "класс устаревания живёт в стилях, а не только в скрипте");
});

test("no workflow still drives the retired status generator", () => {
  const dir = new URL("../../.github/workflows/", import.meta.url);
  for (const file of readdirSync(dir)) {
    const text = readFileSync(new URL(file, dir), "utf8");
    assert.ok(!/generate_status|status\.json/.test(text), `${file} всё ещё зовёт удалённый продюсер статуса`);
  }
});
