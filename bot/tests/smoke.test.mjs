import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ATTEMPTS, DEFAULT_URL, buildExpectation, main, runChecks } from "../scripts/smoke-prod.mjs";
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

const SCRIPT = join(fileURLToPath(new URL("..", import.meta.url)), "scripts", "smoke-prod.mjs");

// Живой HTTP-двойник прода: CLI обязан вести себя как runChecks, включая код возврата.
// На Windows process.exit() обрывал незакрытые fetch-ручки и ронял Node ассертом libuv
// уже после отчёта — проверка на пустой stderr держит именно это.
function serve(routes) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      req.resume();
      const path = new URL(req.url, "http://127.0.0.1").pathname;
      const [status, body, type] = routes[path] ?? [404, "Not found", "text/plain"];
      res.writeHead(status, { "Content-Type": type });
      res.end(body);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function runChild(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT], { env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("smoke CLI не завершился за 60 секунд"));
    }, 60000);
    child.on("error", reject);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

async function runCli(routes) {
  const server = await serve(routes);
  try {
    return await runChild({ WORKER_URL: `http://127.0.0.1:${server.address().port}` });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

function healthyRoutes(reported = buildExpectation(DATA)) {
  return {
    "/health": [200, "OK", "text/plain"],
    "/": [200, JSON.stringify(reported), "application/json"],
    "/webhook": [403, "Forbidden", "text/plain"]
  };
}

test("the smoke CLI exits 0 against a healthy worker", async () => {
  const run = await runCli(healthyRoutes());
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.doesNotMatch(run.stderr, /Assertion failed/, "живые fetch-ручки не должны обрывать процесс");
  for (const name of ["health", "counts", "webhook guard"]) {
    assert.match(run.stdout, new RegExp(`OK\\s+${name}`));
  }
  assert.match(run.stdout, /3\/3 проверок пройдено/);
});

test("the smoke CLI exits 1 when prod counts drift from projects.json", async () => {
  const expected = buildExpectation(DATA);
  const run = await runCli(healthyRoutes({ ...expected, bots: 0 }));
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stdout, /FAIL counts/);
  assert.match(run.stdout, /bots=0 ждали \d+/);
  assert.match(run.stdout, /2\/3 проверок пройдено/);
});

test("the smoke CLI compares prod with the repository data, never with prod itself", async () => {
  const run = await runCli({
    "/health": [200, "OK", "text/plain"],
    "/": [200, JSON.stringify({ projects: 1, sites: 1, bots: 1 }), "application/json"],
    "/webhook": [403, "Forbidden", "text/plain"]
  });
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stdout, new RegExp(`projects=1 ждали ${DATA.projects.length}`));
});

test("the smoke CLI defaults to the deployed worker url", async () => {
  const url = new URL(DEFAULT_URL);
  assert.equal(url.hostname, "ssrjkk-bot.ray013lefe.workers.dev");
  assert.equal(url.protocol, "https:");
  assert.match(DEFAULT_URL, /^https:\/\//, "дефолт без WORKER_URL обязан вести на прод, а не на localhost");
});

test("the smoke reports a failure that is not an Error object", async () => {
  // Чужие обёртки над fetch бросают что угодно, не только Error: текст сбоя обязан
  // попасть в отчёт и в таком случае, иначе в CI остаётся пустое «почему».
  const prod = fakeProd({ ...healthy(), "/health": () => { throw "Connection reset by peer"; } });
  const { results, ok } = await runChecks(prod.impl, { baseUrl: BASE, data: DATA, retryDelayMs: 0 });
  assert.equal(ok, false);
  assert.equal(prod.seen.filter((path) => path === "/health").length, ATTEMPTS);
  assert.equal(check(results, "health").detail, "0 Connection reset by peer");
});

test("the smoke without WORKER_URL asks the deployed worker", async () => {
  const saved = process.env.WORKER_URL;
  delete process.env.WORKER_URL;
  const logged = [];
  const log = console.log;
  console.log = (...args) => {
    logged.push(args.join(" "));
  };
  try {
    const prod = fakeProd(healthy());
    const { ok } = await main({ fetchImpl: prod.impl });
    assert.equal(ok, true, JSON.stringify(prod.seen));
    assert.deepEqual(prod.seen, ["/health", "/", "/webhook"]);
    assert.match(logged.at(-1), new RegExp(`^${DEFAULT_URL}: 3/3 проверок пройдено$`), logged.at(-1));
  } finally {
    console.log = log;
    if (saved === undefined) delete process.env.WORKER_URL;
    else process.env.WORKER_URL = saved;
  }
});

