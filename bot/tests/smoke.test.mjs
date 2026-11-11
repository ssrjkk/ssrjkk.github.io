import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ATTEMPTS, buildExpectation, runChecks } from "../scripts/smoke-prod.mjs";
import worker from "../cloudflare-worker/worker.js";

const DATA = JSON.parse(
  readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "projects.json"), "utf8")
);
const BASE = "https://prod.test";

// Ответы по путям: значение, функция (свежий Response на каждую попытку) или массив
// значений по одному на попытку — так проверяют повторы. Error имитирует сетевой сбой.
function fakeProd(routes) {
  const seen = [];
  const counts = new Map();
  const impl = async (input) => {
    const path = new URL(String(input)).pathname;
    seen.push(path);
    if (!(path in routes)) throw new Error(`unexpected request: ${path}`);
    const index = counts.get(path) ?? 0;
    counts.set(path, index + 1);
    const route = Array.isArray(routes[path]) ? routes[path][Math.min(index, routes[path].length - 1)] : routes[path];
    if (route instanceof Error) throw route;
    return typeof route === "function" ? route() : route;
  };
  return { impl, seen };
}

const text = (body, status = 200) => new Response(body, { status });
const json = (body, status = 200) => text(JSON.stringify(body), status);

// Прод-контракт: /health → «OK», / → счётчики каталога, /webhook без секрета → 403.
function healthy(reported = buildExpectation(DATA)) {
  return {
    ["/health"]: text("OK"),
    ["/"]: json(reported),
    ["/webhook"]: text("Forbidden", 403)
  };
}

function check(results, name) {
  return results.find((result) => result.name === name);
}

test("the smoke passes against a healthy worker", async () => {
  const prod = fakeProd(healthy());
  const { results, ok } = await runChecks(prod.impl, { baseUrl: BASE, data: DATA, retryDelayMs: 0 });
  assert.equal(ok, true, JSON.stringify(results));
  assert.equal(results.length, 3);
  assert.deepEqual(prod.seen, ["/health", "/", "/webhook"]);
});

test("the smoke expectation matches what the worker itself reports", async () => {
  // Смук сверяет прод с projects.json. Если воркер начнёт считать sites или bots
  // иначе, чем здесь, проверка превратится в самообман — сверяем с живым обработчиком.
  const reported = await (await worker.fetch(new Request(`${BASE}/`), {}, {})).json();
  assert.deepEqual(
    { projects: reported.projects, sites: reported.sites, bots: reported.bots },
    buildExpectation(DATA)
  );
});

for (const [name, routes] of [
  ["health does not answer OK", { ...healthy(), "/health": text("Not found", 404) }],
  ["the webhook takes updates without a secret", { ...healthy(), "/webhook": json({ ok: true }) }],
  ["the root endpoint is gone", { ...healthy(), "/": text("Not found", 404) }]
]) {
  test(`the smoke turns red when ${name}`, async () => {
    const prod = fakeProd(routes);
    const { results, ok } = await runChecks(prod.impl, { baseUrl: BASE, data: DATA, retryDelayMs: 0 });
    assert.equal(ok, false, JSON.stringify(results));
    assert.equal(results.filter((result) => !result.ok).length, 1, JSON.stringify(results));
  });
}

test("the smoke turns red when prod counts drift from projects.json", async () => {
  const expected = buildExpectation(DATA);
  const prod = fakeProd(healthy({ ...expected, sites: expected.sites - 1 }));
  const { results, ok } = await runChecks(prod.impl, { baseUrl: BASE, data: DATA, retryDelayMs: 0 });
  assert.equal(ok, false);
  assert.equal(check(results, "counts").ok, false);
  assert.match(check(results, "counts").detail, /sites=\d+ ждали \d+/);
});

test("the smoke retries a 5xx and passes once the edge answers", async () => {
  // Первая версия могла ещё не разъехаться по edge: 503 — повод спросить ещё раз.
  const prod = fakeProd({ ...healthy(), "/health": [text("Upstream refresh failed", 503), text("OK")] });
  const { results, ok } = await runChecks(prod.impl, { baseUrl: BASE, data: DATA, retryDelayMs: 0 });
  assert.equal(ok, true, JSON.stringify(results));
  assert.deepEqual(prod.seen.slice(0, 2), ["/health", "/health"]);
  assert.equal(check(results, "health").ok, true);
});

test("the smoke gives up after the attempts are spent", async () => {
  const prod = fakeProd({ ...healthy(), "/": new Error("socket hang up") });
  const { results, ok } = await runChecks(prod.impl, { baseUrl: BASE, data: DATA, retryDelayMs: 0 });
  assert.equal(ok, false);
  assert.equal(prod.seen.filter((path) => path === "/").length, ATTEMPTS);
  assert.match(check(results, "counts").detail, /socket hang up/);
});

test("the smoke reports a 5xx instead of inventing a mismatch", async () => {
  // Тело Response читается один раз, поэтому на три попытки нужен свежий ответ.
  const prod = fakeProd({ ...healthy(), "/": () => text("Upstream refresh failed", 503) });
  const { results, ok } = await runChecks(prod.impl, { baseUrl: BASE, data: DATA, retryDelayMs: 0 });
  assert.equal(ok, false);
  assert.equal(prod.seen.filter((path) => path === "/").length, ATTEMPTS, "5xx — сбой, его повторяют");
  assert.match(check(results, "counts").detail, /^503 Upstream refresh failed$/);
});

test("the smoke does not retry a wrong-but-answered status", async () => {
  // 403 там, где ждём 200, — это ответ прода, а не сбой: повтор только тянет время.
  const prod = fakeProd({ ...healthy(), "/webhook": text("Forbidden", 403), "/health": text("nope", 401) });
  await runChecks(prod.impl, { baseUrl: BASE, data: DATA, retryDelayMs: 0 });
  assert.equal(prod.seen.filter((path) => path === "/health").length, 1);
});
