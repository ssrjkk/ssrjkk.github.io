import test from "node:test";
import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

import worker, {
  LANG,
  COMMANDS,
  LANG_CACHE_LIMIT,
  resetCaches,
  displayName,
  projectCard,
  projectDetailKeyboard,
  shareProjectUrl
} from "../cloudflare-worker/worker.js";

const BASE = "https://bot.example";
const SECRET = "hook-secret";

// сеть по умолчанию запрещена: тест, забывший installFetch, падает с адресом
// запроса, а не молча уходит в GitHub из CI и не зависит от порядка проверок.
globalThis.fetch = async (input) => {
  throw new Error(`проверка полезла в сеть без двойника: ${String(input)}`);
};

const { buildSync } = createRequire(import.meta.url)("esbuild");
const CATALOGUE = JSON.parse(readFileSync(new URL("../projects.json", import.meta.url), "utf8"));

// Кеш звёзд и язык держатся в памяти модуля: проверки, которым важно начало TTL,
// сбрасывают его явно и работают с тем же бандлом, что лежит в проде.
function cleanWorkerCache() {
  resetCaches();
  return worker;
}

// Тот же src и те же флаги esbuild, что у npm run build, но с другими данными:
// так проверяются ветки, которые текущий каталог не показывает ни разу.
async function workerWithCatalogue(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "bot-catalogue-"));
  const data = JSON.parse(JSON.stringify(CATALOGUE));
  mutate(data);
  mkdirSync(join(dir, "src"));
  copyFileSync(fileURLToPath(new URL("../src/worker.js", import.meta.url)), join(dir, "src", "worker.js"));
  writeFileSync(join(dir, "projects.json"), JSON.stringify(data));
  const outfile = join(dir, "bundle.js");
  buildSync({
    entryPoints: [join(dir, "src", "worker.js")],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    charset: "utf8",
    legalComments: "none",
    outfile,
    logLevel: "silent"
  });
  // Исходник прочитан при import, временная папка больше не нужна.
  const instance = (await import(pathToFileURL(outfile).href)).default;
  rmSync(dir, { recursive: true, force: true });
  return instance;
}

async function webhookOn(instance, env, ctx, update) {
  const response = await instance.fetch(
    new Request(`${BASE}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": SECRET },
      body: JSON.stringify(update)
    }),
    env,
    ctx
  );
  await Promise.allSettled(ctx.pending);
  return response;
}

function dbReturning(rowsByCall) {
  const calls = [];
  let index = 0;
  return {
    calls,
    prepare(sql) {
      calls.push(sql);
      return {
        bind() {
          return this;
        },
        async run() {
          return { success: true };
        },
        async all() {
          return { results: rowsByCall[index++] ?? [] };
        },
        async first() {
          return null;
        }
      };
    }
  };
}

// editFiles правит любой файл фикстуры после копирования; null — файла нет вовсе.
// Так проверяются ветки, которые портят не данные, а сам бандл или конфигурацию.
function checkBundleData(mutate = () => {}, editReadme = (text) => text, editHub = (text) => text, editFiles = {}) {
  // Проверка читает README, соседний .github/workflows и карточки хаба,
  // поэтому фикстура — копия раскладки репозитория: <tmp>/bot рядом с
  // <tmp>/.github и <tmp>/index.html.
  const base = mkdtempSync(join(tmpdir(), "port-bundle-"));
  const root = join(base, "bot");
  try {
    mkdirSync(root);
    for (const folder of ["scripts", "src", "cloudflare-worker"]) mkdirSync(join(root, folder));
    for (const file of ["scripts/check-bundle.mjs", "src/worker.js", "cloudflare-worker/worker.js", "cloudflare-worker/wrangler.toml", "README.md"]) {
      copyFileSync(new URL(`../${file}`, import.meta.url), join(root, file));
    }
    const workflowsDir = fileURLToPath(new URL("../../.github/workflows/", import.meta.url));
    const workflows = existsSync(workflowsDir) ? readdirSync(workflowsDir) : [];
    mkdirSync(join(base, ".github", "workflows"), { recursive: true });
    for (const file of workflows) writeFileSync(join(base, ".github", "workflows", file), "");
    const hubPath = fileURLToPath(new URL("../../index.html", import.meta.url));
    if (existsSync(hubPath)) writeFileSync(join(base, "index.html"), editHub(readFileSync(hubPath, "utf8")));
    const readmePath = join(root, "README.md");
    writeFileSync(readmePath, editReadme(readFileSync(readmePath, "utf8")));
    const data = JSON.parse(readFileSync(new URL("../projects.json", import.meta.url), "utf8"));
    mutate(data);
    writeFileSync(join(root, "projects.json"), JSON.stringify(data));
    for (const [file, edit] of Object.entries(editFiles)) {
      const target = join(root, file);
      if (edit === null) rmSync(target, { force: true });
      else writeFileSync(target, edit(readFileSync(target, "utf8")));
    }
    return spawnSync(process.execPath, [join(root, "scripts/check-bundle.mjs")], { encoding: "utf8" });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function makeEnv(overrides = {}) {
  const kv = new Map();
  const inserts = [];
  const puts = [];
  return {
    inserts,
    puts,
    BOT_TOKEN: "test-token",
    OWNER_ID: "42",
    SETUP_KEY: "setup-key",
    WEBHOOK_SECRET: SECRET,
    BOT_KV: {
      async get(key) {
        return kv.has(key) ? kv.get(key) : null;
      },
      async put(key, value, options) {
        kv.set(key, value);
        puts.push({ key, options });
      }
    },
    BOT_DB: {
      prepare(sql) {
        return {
          bind(...args) {
            this.args = args;
            return this;
          },
          async run() {
            inserts.push({ sql, args: this.args || [] });
            return { success: true };
          },
          async all() {
            return { results: [] };
          },
          async first() {
            return null;
          }
        };
      }
    },
    ...overrides
  };
}

function trackedInserts(env, kind) {
  return env.inserts.filter((row) => row.sql.includes("INSERT INTO events") && row.args[1] === kind);
}

function makeCtx() {
  const pending = [];
  return {
    pending,
    waitUntil(promise) {
      pending.push(promise);
    }
  };
}

function installFetch({
  photoFails = false,
  events = [],
  eventsStatus = 200,
  telegram = null,
  stars = null,
  starsDefault = 7,
  githubStatus = 200,
  githubError = false
} = {}) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith("https://api.github.com/")) {
      // Запросы к GitHub пишутся в тот же журнал: `/news` должен подтверждать,
      // что свежий кеш в KV экономит бюджет (60 запросов в час на IP).
      calls.push({ method: "github", body: { url } });
      if (url.includes("/events/public")) return jsonResponse(events, eventsStatus);
      if (githubError) throw new Error("fetch failed");
      if (githubStatus !== 200) return jsonResponse({ message: "API rate limit exceeded" }, githubStatus);
      const name = decodeURIComponent(url.split("/").pop());
      // null в списке звёзд — это репозиторий, ответивший без поля stargazers_count.
      const count = stars && name in stars ? stars[name] : starsDefault;
      return jsonResponse(count === null ? { full_name: name } : { stargazers_count: count });
    }
    if (url.startsWith("https://api.telegram.org/")) {
      const method = url.split("/").pop();
      const body = init.body ? JSON.parse(init.body) : {};
      calls.push({ method, body });
      // Ответ Telegram можно подменить по номеру попытки — так проверяют бэкофф,
      // где важен не только статус, но и порядок ответов на один и тот же метод.
      if (telegram) {
        const scripted = telegram({ method, body, attempt: callsOf(calls, method).length });
        if (scripted) return scripted;
      }
      if (method === "sendPhoto" && photoFails) {
        return jsonResponse({ ok: false, description: "wrong file identifier" });
      }
      return jsonResponse({ ok: true, result: { message_id: calls.length } });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  return calls;
}

function messageUpdate(text, { chatId = 100, userId = 100, messageId = 1 } = {}) {
  return {
    update_id: 1,
    message: {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: "private" },
      from: { id: userId, is_bot: false, first_name: "Test" },
      text
    }
  };
}

function callbackUpdate(data, { chatId = 100, messageId = 10 } = {}) {
  return {
    update_id: 2,
    callback_query: {
      id: "cb-1",
      from: { id: chatId, is_bot: false, first_name: "Test" },
      data,
      message: {
        message_id: messageId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: "private" }
      }
    }
  };
}

async function sendWebhook(env, ctx, update, headers = {}) {
  const request = new Request(`${BASE}/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": SECRET,
      ...headers
    },
    body: JSON.stringify(update)
  });
  const response = await worker.fetch(request, env, ctx);
  await Promise.allSettled(ctx.pending);
  return response;
}

function callsOf(calls, method) {
  return calls.filter((call) => call.method === method);
}

function lastText(calls) {
  const messages = callsOf(calls, "sendMessage");
  assert.ok(messages.length > 0, "expected a sendMessage call");
  return messages.at(-1).body.text;
}

function keyboardData(call) {
  return (call.body.reply_markup?.inline_keyboard ?? []).flat().map((button) => button.callback_data ?? button.url);
}

// Каждый отказ гейта регистрируется здесь: число в README сверяется с тем, что
// прогон действительно проверил, а не с тем, что кто-то помнит.
const gateRejections = [];
function expectGateRejection(result, expected, label) {
  gateRejections.push(label);
  assert.equal(result.status, 1, result.stdout);
  if (expected) assert.match(result.stderr, expected);
}

test("bundle validation accepts the current catalogue", () => {
  const result = checkBundleData();
  assert.equal(result.status, 0, result.stderr);
});

for (const [name, editReadme] of [
  ["a workflow the README points at but the repo has not", (text) => text.replace(".github/workflows/bot-ci.yml", ".github/workflows/bot-codeql.yml")],
  ["a documented command the worker does not handle", (text) => text.replace("| `/help` |", "| `/ghost` | ничего |\n| `/help` |")],
  ["a handled command missing from the README table", (text) => text.replace("| `/myid` | Chat ID |\n", "")]
]) {
  test(`bundle validation rejects ${name}`, () => {
    const result = checkBundleData(() => {}, editReadme);
    expectGateRejection(result, null, name);
  });
}

for (const [name, mutate, expected] of [
  ["impostor repository host", (data) => { const p = data.projects[0]; p.repo = `https://example.test/ssrjkk/${p.name}`; }, /repo должен вести на github\.com\/ssrjkk\/bothive/],
  ["lookalike Telegram host", (data) => { data.projects[0].bot = "https://not.t.me/ssrjkk_bot"; }, /bot должен вести на t\.me/],
  ["insecure documentation URL", (data) => { data.projects.find((p) => p.name === "agent-skills").links[0].url = "http://example.test/registry"; }, /ссылка документации должна быть https-URL/]
]) {
  test(`bundle validation rejects ${name}`, () => {
    const result = checkBundleData(mutate);
    expectGateRejection(result, expected, name);
  });
}

for (const [name, editHub] of [
  ["a hub card opening a project the catalogue has not", (text) => text.replace("?start=p_raven", "?start=p_raven-v2")],
  ["a hub card opening another bot", (text) => text.replace("t.me/ssrjkk_bot?start=p_raven", "t.me/other_bot?start=p_raven")],
  ["a hub without a single link into the bot", (text) => text.replace(/\r?\n\s*<a class="card-link" href="https:\/\/t\.me\/ssrjkk_bot\?start=p_[^\n]*\n/g, "\n")]
]) {
  test(`bundle validation rejects ${name}`, () => {
    const result = checkBundleData(() => {}, (text) => text, editHub);
    expectGateRejection(result, /index\.html|deep-/, name);
  });
}

// Проверка данных — это обещание, на котором держится код воркера: title и lang
// обязательны, поэтому displayName и stackTokens не встретят пустоту. Каждый отказ
// сверяется по тексту замечания, а не только по коду возврата: молчаливый exit 1
// прошёл бы и при совсем другой поломке.
const DATA_FAILURES = [
  ["a missing top-level key", /нет ключа «channels»/, (d) => { delete d.channels; }],
  ["an empty catalogue", /projects должен быть непустым списком/, (d) => { d.projects = []; }],
  ["a hub that is not a URL", /hub не является URL/, (d) => { d.hub = "ssrjkk.github.io"; }],
  ["a bot link outside t.me", /bot должен вести на t\.me/, (d) => { d.bot = "https://example.test/ssrjkk_bot"; }],
  ["a project without a title", /пустое поле «title»/, (d) => { d.projects[0].title = "   "; }],
  ["a project without a lang", /пустое поле «lang»/, (d) => { delete d.projects[0].lang; }],
  ["a project without an English description", /пустое поле «desc_en»/, (d) => { d.projects[0].desc_en = ""; }],
  ["a repeated project name", /имя проекта повторяется/, (d) => { d.projects[1].name = d.projects[0].name; }],
  ["stars that are not a number", /stars должен быть неотрицательным числом/, (d) => { d.projects[0].stars = "12"; }],
  ["negative stars", /stars должен быть неотрицательным числом/, (d) => { d.projects[0].stars = -1; }],
  ["a private flag that is not a boolean", /private должен быть true или false/, (d) => { d.projects[0].private = "yes"; }],
  ["a repo that is not a URL", /repo не является URL/, (d) => { d.projects[0].repo = "ssrjkk/bothive"; }],
  ["a site over http", /site не является https-URL/, (d) => { d.projects[0].site = "http://ssrjkk.github.io/bothive/"; }],
  ["a bot over http", /bot не является https-URL/, (d) => { d.projects.find((p) => p.bot).bot = "http://t.me/ssrjkk_bot"; }],
  ["a Pages site without the trailing slash", /site на GitHub Pages должен заканчиваться слэшем/, (d) => { d.projects[0].site = "https://ssrjkk.github.io/bothive"; }],
  ["a screenshot outside the profile repository", /shot должен лежать в/, (d) => { d.projects[0].shot = "https://raw.githubusercontent.com/ssrjkk/bothive/main/shot.png"; }],
  ["a screenshot over http", /shot не является https-URL/, (d) => { d.projects[0].shot = "http://raw.githubusercontent.com/ssrjkk/ssrjkk/main/assets/shots/bothive.png"; }],
  ["a documentation link with credentials", /ссылка документации должна быть https-URL без учётных данных/, (d) => { d.projects.find((p) => p.links).links[0].url = "https://user:pass@example.test/docs"; }],
  ["a documentation link without a name", /пустое имя ссылки документации/, (d) => { d.projects.find((p) => p.links).links[0].name = " "; }],
  ["a channel without a name", /channels\[0\]: пустое имя/, (d) => { d.channels[0].name = ""; }],
  ["a channel that is not an https URL", /channels\[0\]: url не является https-URL/, (d) => { d.channels[0].url = "ftp://t.me/b2wmain"; }],
  ["a profile link without a name", /links\[0\]: пустое имя/, (d) => { d.links[0].name = ""; }],
  ["a profile link that is not an https URL", /links\[0\]: url не является https-URL/, (d) => { d.links[0].url = "javascript:alert(1)"; }],
  ["a project the bundle has never heard of", /«ghost-project» есть в projects\.json, но нет в бандле/, (d) => { d.projects[0].name = "ghost-project"; }],
  ["a description the bundle does not carry", /описание проекта «bothive» не найдено в бандле/, (d) => { d.projects[0].desc = "Совсем другое описание проекта, которого в бандле нет."; }],
  ["a channel link the bundle does not carry", /ссылка «B2W Main» есть в projects\.json, но нет в бандле/, (d) => { d.channels[0].url = "https://t.me/other_channel"; }]
];

for (const [name, expected, mutate] of DATA_FAILURES) {
  test(`bundle validation rejects ${name}`, () => {
    const result = checkBundleData(mutate);
    expectGateRejection(result, expected, name);
  });
}

// Секреты и форма бандла: гейт обязан падать на подложенном токене, иначе он
// декоративный. Токены здесь синтетические и живут только во временной фикстуре.
const FILE_FAILURES = [
  ["projects.json that does not parse", /projects\.json не разбирается/, { "projects.json": () => "{ не json" }],
  ["a bundle that cannot be read", /бандл не читается/, { "cloudflare-worker/worker.js": null }],
  ["a missing source file", /нет src\/worker\.js/, { "src/worker.js": null }],
  ["a missing README", /нет bot\/README\.md/, { "README.md": null }],
  ["a missing wrangler config", /wrangler\.toml не читается/, { "cloudflare-worker/wrangler.toml": null }],
  ["a wrangler config without bindings", /в wrangler\.toml не найдено ни одной привязки/, { "cloudflare-worker/wrangler.toml": (t) => t.replace(/^\s*binding\s*=.*$/gm, "") }],
  ["a binding the bundle never uses", /привязка «GHOST_KV» объявлена в wrangler\.toml, но не встречается в бандле/, { "cloudflare-worker/wrangler.toml": (t) => t.replace('binding = "BOT_KV"', 'binding = "GHOST_KV"') }],
  ["a planted Telegram token", /в бандле найден токен Telegram-бота/, { "cloudflare-worker/worker.js": (t) => `${t}\nconst leak = "123456789:${"A".repeat(35)}";\n` }],
  ["a planted GitHub token", /в бандле найден токен GitHub/, { "cloudflare-worker/worker.js": (t) => `${t}\nconst leak = "ghp_${"B".repeat(36)}";\n` }],
  ["a planted private key", /в бандле найден приватный ключ/, { "cloudflare-worker/worker.js": (t) => `${t}\nconst leak = "-----BEGIN RSA PRIVATE KEY-----";\n` }],
  ["a key-shaped string left in the bundle", /в бандле найден длинная строка, похожая на ключ/, { "cloudflare-worker/worker.js": (t) => `${t}\nconst leak = "${"C".repeat(44)}";\n` }],
  ["a bundle that is not a worker module", /бандл не экспортирует обработчик по умолчанию/, { "cloudflare-worker/worker.js": (t) => t.replace("worker_default as default", "worker_default as handler") }],
  ["a source map that is not there", /бандл ссылается на source map «worker\.js\.map»/, { "cloudflare-worker/worker.js": (t) => `${t}\n//# sourceMappingURL=worker.js.map\n` }]
];

for (const [name, expected, files] of FILE_FAILURES) {
  test(`bundle validation rejects ${name}`, () => {
    const result = checkBundleData(() => {}, (text) => text, (text) => text, files);
    expectGateRejection(result, expected, name);
  });
}

test("the README count of gate mutations is the count the suite really runs", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.equal(Number(readme.match(/(\d+) mutations of the data/)[1]), gateRejections.length);
  assert.equal(Number(readme.match(/(\d+) мутаций данных/)[1]), gateRejections.length);
  assert.equal(new Set(gateRejections).size, gateRejections.length, "одно и то же замечание посчитано дважды");
});

test("bundle validation reports the catalogue it accepted", () => {
  const result = checkBundleData();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Воркер в порядке: 20 проектов, 20 сайтов, 4 ботов, 2 привязок/);
});

test("health endpoint answers OK", async () => {
  const response = await worker.fetch(new Request(`${BASE}/health`), makeEnv(), makeCtx());
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "OK");
});

test("root endpoint reports the catalogue size", async () => {
  const response = await worker.fetch(new Request(`${BASE}/`), makeEnv(), makeCtx());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.name, "ssrjkk-bot");
  assert.equal(body.projects, 20);
  assert.equal(body.sites, 20);
  assert.equal(body.bots, 4);
  assert.equal(body.github, "https://github.com/ssrjkk");
});

test("webhook rejects a missing or wrong secret header", async () => {
  const calls = installFetch();
  const env = makeEnv();
  const missing = await worker.fetch(
    new Request(`${BASE}/webhook`, { method: "POST", body: "{}" }),
    env,
    makeCtx()
  );
  assert.equal(missing.status, 403);
  const wrong = await sendWebhook(env, makeCtx(), messageUpdate("/start"), {
    "X-Telegram-Bot-Api-Secret-Token": "nope"
  });
  assert.equal(wrong.status, 403);
  assert.equal(calls.length, 0);
});

test("/start shows the menu with sites and bots", async () => {
  const calls = installFetch();
  const env = makeEnv();
  const response = await sendWebhook(env, makeCtx(), messageUpdate("/start", { chatId: 101 }));
  assert.equal(response.status, 200);

  const text = lastText(calls);
  assert.match(text, /Проектов: 20/);
  assert.match(text, /Сайтов: 20/);
  assert.match(text, /Ботов: 4/);

  const button = callsOf(calls, "sendMessage").at(-1);
  const data = keyboardData(button);
  assert.ok(data.includes("show:sites"));
  assert.ok(data.includes("show:bots"));
  assert.ok(data.includes("page:0"));
});

test("/projects paginates three cards per page", async () => {
  const calls = installFetch();
  const env = makeEnv();
  await sendWebhook(env, makeCtx(), messageUpdate("/projects", { chatId: 102 }));

  const first = callsOf(calls, "sendMessage").at(-1);
  assert.match(first.body.text, /Мои проекты/);
  assert.equal((first.body.text.match(/<b>/g) || []).length >= 3, true);
  assert.ok(keyboardData(first).includes("page:1"));

  const ctx = makeCtx();
  await sendWebhook(env, ctx, callbackUpdate("page:1", { chatId: 102 }));
  const edited = callsOf(calls, "editMessageText").at(-1);
  assert.ok(edited, "expected editMessageText for pagination");
  assert.ok(keyboardData(edited).some((value) => value.startsWith("p:")));
  assert.ok(keyboardData(edited).includes("page:0"));
});

test("/sites lists every project site as a URL button", async () => {
  const calls = installFetch();
  await sendWebhook(makeEnv(), makeCtx(), messageUpdate("/sites", { chatId: 103 }));

  const sent = callsOf(calls, "sendMessage").at(-1);
  assert.match(sent.body.text, /Сайты проектов/);
  const urls = keyboardData(sent).filter((value) => value.startsWith("https://"));
  assert.equal(urls.length, 20);
  assert.ok(new Set(urls).has("https://ssrjkk.github.io/bothive/"));
  assert.ok(new Set(urls).has("https://wake-7k6.pages.dev"));
  assert.ok(new Set(urls).has("https://ssrjkk.github.io/noema/"));
  assert.ok(new Set(urls).has("https://ssrjkk.github.io/twinby-swipe-bot/"));
});

test("/bots lists every Telegram bot as a URL button", async () => {
  const calls = installFetch();
  await sendWebhook(makeEnv(), makeCtx(), messageUpdate("/bots", { chatId: 104 }));

  const sent = callsOf(calls, "sendMessage").at(-1);
  assert.match(sent.body.text, /Telegram-боты/);
  const urls = keyboardData(sent).filter((value) => value.startsWith("https://"));
  assert.equal(urls.length, 4);
  assert.ok(new Set(urls).has("https://t.me/ssrjkk_bot"));
  assert.ok(new Set(urls).has("https://t.me/waketrade_bot"));
});

test("/about counts the catalogue instead of hardcoding it", async () => {
  const calls = installFetch();
  const catalogue = JSON.parse(readFileSync(new URL("../projects.json", import.meta.url), "utf8"));

  await sendWebhook(makeEnv(), makeCtx(), messageUpdate("/about", { chatId: 118 }));
  assert.match(lastText(calls), new RegExp(`Проектов: ${catalogue.projects.length}`));

  await sendWebhook(makeEnv(), makeCtx(), callbackUpdate("lang:en", { chatId: 118 }));
  await sendWebhook(makeEnv(), makeCtx(), messageUpdate("/about", { chatId: 118 }));
  assert.match(lastText(calls), new RegExp(`Projects: ${catalogue.projects.length}`));
});

test("project detail sends the screenshot with site, repo and bot buttons", async () => {
  const calls = installFetch();
  await sendWebhook(makeEnv(), makeCtx(), callbackUpdate("p:wake", { chatId: 105 }));

  const photos = callsOf(calls, "sendPhoto");
  assert.equal(photos.length, 1);
  assert.match(photos[0].body.photo, /raw\.githubusercontent\.com\/ssrjkk\/ssrjkk\/main\/assets\/shots\/wake\.jpg/);
  assert.match(photos[0].body.caption, /Wake/);

  const buttons = photos[0].body.reply_markup.inline_keyboard.flat();
  const urls = buttons.map((button) => button.url).filter(Boolean);
  assert.ok(new Set(urls).has("https://wake-7k6.pages.dev"));
  assert.ok(new Set(urls).has("https://github.com/ssrjkk/wake"));
  assert.ok(new Set(urls).has("https://t.me/waketrade_bot"));
});

test("project detail falls back to a text message when the photo fails", async () => {
  const calls = installFetch({ photoFails: true });
  await sendWebhook(makeEnv(), makeCtx(), callbackUpdate("p:raven", { chatId: 106 }));

  const text = lastText(calls);
  assert.match(text, /Raven/);
  assert.match(text, /Скриншот/);
  assert.match(text, /assets\/shots\/raven\.jpg/);
});

test("every catalogue project publishes a screenshot", () => {
  const catalogue = JSON.parse(readFileSync(new URL("../projects.json", import.meta.url), "utf8"));
  for (const project of catalogue.projects) {
    assert.equal(
      project.shot,
      `https://raw.githubusercontent.com/ssrjkk/ssrjkk/main/assets/shots/${project.name}.jpg`,
      `${project.name}: shot должен вести на профильный репозиторий`
    );
  }
});

test("an unknown project answers with a text card instead of a photo", async () => {
  const calls = installFetch();
  await sendWebhook(makeEnv(), makeCtx(), callbackUpdate("p:no-such-project", { chatId: 107 }));

  assert.equal(callsOf(calls, "sendPhoto").length, 0);
  assert.match(lastText(calls), /не найден/i);
});

test("a project marked private hides the repository link", () => {
  const hidden = {
    name: "closed-demo",
    title: "Closed demo",
    lang: "JavaScript",
    desc: "Каталог проектов в Telegram.",
    desc_en: "A Telegram project catalogue.",
    repo: "https://github.com/ssrjkk/closed-demo",
    bot: "https://t.me/ssrjkk_bot",
    private: true,
  };

  const card = projectCard(hidden, {}, "ru");
  assert.match(card, /исходники закрыты/);
  assert.doesNotMatch(card, /github\.com\/ssrjkk\/closed-demo/);
  assert.match(projectCard(hidden, {}, "en"), /source private/);

  const urls = projectDetailKeyboard("ru", hidden)
    .flat()
    .map((button) => button.url)
    .filter(Boolean);
  assert.equal(new Set(urls).has("https://github.com/ssrjkk/closed-demo"), false);
  assert.ok(new Set(urls).has("https://t.me/ssrjkk_bot"));
});

test("the live catalogue publishes a repository link for every project", () => {
  const catalogue = JSON.parse(
    readFileSync(new URL("../projects.json", import.meta.url), "utf8")
  );

  assert.equal(catalogue.projects.filter((project) => project.private).length, 0);

  for (const project of catalogue.projects.filter((entry) => entry.repo)) {
    const links = new Set(projectCard(project, {}, "ru").split("\n").at(-1).split(" · "));
    assert.ok(links.has(`<a href="${project.repo}">GitHub</a>`), `${project.name}: repository link missing`);
    const urls = projectDetailKeyboard("ru", project)
      .flat()
      .map((button) => button.url)
      .filter(Boolean);
    assert.ok(new Set(urls).has(project.repo), `${project.name}: кнопка GitHub должна вести в репозиторий`);
  }
});

test("project cards and keyboards include documentation links", () => {
  const catalogue = JSON.parse(readFileSync(new URL("../projects.json", import.meta.url), "utf8"));
  const project = catalogue.projects.find((entry) => entry.name === "agent-skills");
  assert.equal(project.links.length, 3);
  for (const lang of ["ru", "en"]) {
    const card = projectCard(project, {}, lang);
    for (const link of project.links) {
      assert.ok(card.includes(`<a href="${link.url}">${link.name}</a>`));
    }
    assert.deepEqual(
      projectDetailKeyboard(lang, project)[1],
      project.links.map((link) => ({ text: link.name, url: link.url }))
    );
  }
});

test("documentation link labels and attributes are HTML escaped", () => {
  const card = projectCard({
    name: "fixture",
    lang: "Python",
    desc: "Documentation",
    links: [{ name: "<Registry>", url: 'https://example.test/?a="value"&b=1' }]
  }, {}, "en");
  assert.ok(card.includes('<a href="https://example.test/?a=&quot;value&quot;&amp;b=1">&lt;Registry&gt;</a>'));
});

test("/search escapes HTML in the query and finds projects by stack", async () => {
  const calls = installFetch();
  const env = makeEnv();
  await sendWebhook(env, makeCtx(), messageUpdate("/search python", { chatId: 108 }));
  assert.match(lastText(calls), /Результаты по запросу «python»/);

  await sendWebhook(env, makeCtx(), messageUpdate("/search <b>", { chatId: 109 }));
  const text = lastText(calls);
  assert.match(text, /&lt;b&gt;/);
  assert.doesNotMatch(text, /<b>«/);
});

test("unknown commands do not leak markup", async () => {
  const calls = installFetch();
  await sendWebhook(makeEnv(), makeCtx(), messageUpdate("/<script>", { chatId: 110 }));
  const text = lastText(calls);
  assert.match(text, /Не знаю такой команды/);
  assert.doesNotMatch(text, /<\/script>/);
});

test("/stats is owner only", async () => {
  const calls = installFetch();
  await sendWebhook(makeEnv(), makeCtx(), messageUpdate("/stats", { chatId: 111 }));
  assert.match(lastText(calls), /только владельцу/);
});

test("language switch changes the next reply", async () => {
  const calls = installFetch();
  const env = makeEnv();
  const ctx = makeCtx();
  await sendWebhook(env, ctx, callbackUpdate("lang:en", { chatId: 112 }));
  assert.match(callsOf(calls, "editMessageText").at(-1).body.text, /Language: English/);
  assert.equal(await env.BOT_KV.get("lang:112"), "en");

  await sendWebhook(env, makeCtx(), messageUpdate("/start", { chatId: 112 }));
  assert.match(lastText(calls), /Hi! I'm ssrjkk bot/);
});

test("cards fall back to catalogue stars when GitHub rate-limits", () => {
  // Кеш звёзд живёт в модуле, поэтому интеграционный прогон не отличил бы 403 от
  // прошлого успеха — фолбэк проверяется прямо на сборке карточки.
  const project = { name: "raven", title: "Raven", lang: "Python", desc: "r", desc_en: "e", stars: 3 };
  assert.match(projectCard(project, {}, "ru"), /3★/, "без ответа GitHub берём stars из projects.json");
  assert.match(projectCard(project, { raven: { stars: 7 } }, "ru"), /7★/, "живой GitHub важнее данных");
  assert.match(projectCard({ ...project, stars: 0 }, {}, "ru"), /Raven/, "ноль в данных не печатается как звёзды");
});

test("inline query returns photos for projects with screenshots", async () => {
  const calls = installFetch();
  const env = makeEnv();
  await worker.fetch(
    new Request(`${BASE}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": SECRET },
      body: JSON.stringify({
        update_id: 3,
        inline_query: { id: "iq-1", from: { id: 200, language_code: "ru" }, query: "", offset: "" }
      })
    }),
    env,
    makeCtx()
  );

  const answer = callsOf(calls, "answerInlineQuery").at(-1);
  assert.ok(answer, "expected answerInlineQuery");
  assert.equal(answer.body.results.length, 20);
  const photos = answer.body.results.filter((result) => result.type === "photo");
  const articles = answer.body.results.filter((result) => result.type === "article");
  assert.equal(photos.length, 20);
  assert.equal(articles.length, 0);
  assert.ok(photos.every((result) => result.photo_url.startsWith("https://raw.githubusercontent.com/")));
  const skillPhoto = photos.find((result) => result.title === "Agent Skills");
  assert.match(skillPhoto.caption, /120/);
  assert.deepEqual(skillPhoto.reply_markup.inline_keyboard[1].map((button) => button.url), [
    "https://ssrjkk.github.io/agent-skills/skills_catalog.json",
    "https://ssrjkk.github.io/agent-skills/roadmaps.html",
    "https://ssrjkk.github.io/agent-skills/guides.html"
  ]);
});

test("/setup requires the setup key and registers commands", async () => {
  const calls = installFetch();
  const env = makeEnv();

  const denied = await worker.fetch(new Request(`${BASE}/setup`), env, makeCtx());
  assert.equal(denied.status, 403);

  const response = await worker.fetch(new Request(`${BASE}/setup?key=setup-key`), env, makeCtx());
  assert.equal(response.status, 200);

  const webhook = callsOf(calls, "setWebhook").at(-1);
  assert.equal(webhook.body.url, `${BASE}/webhook`);
  assert.equal(webhook.body.secret_token, SECRET);

  // Меню команд регистрируется отдельно на каждый язык, иначе Telegram покажет
  // русские подсказки англоязычным пользователям.
  const registrations = callsOf(calls, "setMyCommands");
  assert.deepEqual(registrations.map((call) => call.body.language_code), ["ru", "en"]);
  const names = registrations.map((call) => call.body.commands.map((command) => command.command));
  assert.deepEqual(names[0], [
    "start",
    "projects",
    "news",
    "sites",
    "bots",
    "search",
    "top",
    "links",
    "channels",
    "about",
    "feedback",
    "stats",
    "myid",
    "help"
  ]);
  assert.deepEqual(names[1], names[0], "наборы команд ru и en совпадают");
  assert.notDeepEqual(
    registrations[0].body.commands.map((command) => command.description),
    registrations[1].body.commands.map((command) => command.description),
    "подсказки переведены"
  );
});

test("/start p_<project> opens that card directly", async () => {
  const calls = installFetch();
  const env = makeEnv();
  await sendWebhook(env, makeCtx(), messageUpdate("/start p_raven"));
  const photo = callsOf(calls, "sendPhoto").at(-1);
  assert.match(photo.body.caption, /Raven/);
  assert.equal(trackedInserts(env, "open").at(-1).args[2], "raven");
});

test("a referral link credits the inviter and never the invitee", async () => {
  installFetch();
  const env = makeEnv();
  await sendWebhook(env, makeCtx(), messageUpdate("/start ref_42", { userId: 100 }));
  const refs = trackedInserts(env, "ref");
  assert.equal(refs.length, 1);
  assert.equal(refs[0].args[2], "42");

  await sendWebhook(env, makeCtx(), messageUpdate("/start ref_100", { userId: 100 }));
  assert.equal(trackedInserts(env, "ref").length, 1, "приглашение самому себе не пишется");

  for (const payload of ["/start ref_42x", "/start promo_autumn", "/start ref_"]) {
    await sendWebhook(env, makeCtx(), messageUpdate(payload, { userId: 101 }));
  }
  assert.equal(trackedInserts(env, "ref").length, 1, "в рефералы пишутся только числовые id");
});

test("opening a card and walking the menu are counted", async () => {
  installFetch();
  const env = makeEnv();
  await sendWebhook(env, makeCtx(), callbackUpdate("p:wake"));
  assert.equal(trackedInserts(env, "open").at(-1).args[2], "wake");

  await sendWebhook(env, makeCtx(), callbackUpdate("show:sites"));
  assert.equal(trackedInserts(env, "nav").at(-1).args[2], "sites");

  await sendWebhook(env, makeCtx(), callbackUpdate("lang:en"));
  assert.equal(trackedInserts(env, "lang").at(-1).args[2], "en");
});

test("the detail card offers an invite button only when the user is known", () => {
  const project = { name: "raven", title: "Raven", site: "https://raven.example/" };
  const anonymous = projectDetailKeyboard("ru", project).flat();
  const personal = projectDetailKeyboard("ru", project, 42).flat();
  assert.ok(!anonymous.some((button) => button.callback_data === "ref:raven"));
  assert.ok(personal.some((button) => button.callback_data === "ref:raven"));
});

test("the invite button returns a personal link and a share link", async () => {
  const calls = installFetch();
  const env = makeEnv();
  // Отдельный chat: langCache живёт в модуле, и в чужом чате язык уже мог
  // переключиться на EN.
  const shareButton = () => {
    const buttons = callsOf(calls, "sendMessage").at(-1).body.reply_markup.inline_keyboard.flat();
    const button = buttons.find((item) => typeof item.url === "string" && item.url.startsWith("https://t.me/share"));
    assert.ok(button, "рядом с личной ссылкой должна быть кнопка «Поделиться»");
    return new URL(button.url);
  };
  await sendWebhook(env, makeCtx(), callbackUpdate("ref:raven", { chatId: 130 }));
  assert.match(lastText(calls), /t\.me\/ssrjkk_bot\?start=ref_130/);

  const share = shareButton();
  assert.equal(share.searchParams.get("url"), "https://t.me/ssrjkk_bot?start=ref_130");
  assert.equal(share.searchParams.get("text"), "Мои проекты у ssrjkk: Raven");

  await sendWebhook(env, makeCtx(), callbackUpdate("lang:en", { chatId: 130 }));
  await sendWebhook(env, makeCtx(), callbackUpdate("ref:raven", { chatId: 130 }));
  assert.equal(shareButton().searchParams.get("text"), "ssrjkk's projects: Raven");
});

test("inline results are addressed by project name", async () => {
  const calls = installFetch();
  const request = new Request(`${BASE}/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": SECRET },
    body: JSON.stringify({ update_id: 7, inline_query: { id: "q1", from: { id: 5 }, query: "raven" } })
  });
  await worker.fetch(request, makeEnv(), makeCtx());
  const results = callsOf(calls, "answerInlineQuery").at(-1).body.results;
  assert.ok(results.length > 0);
  assert.deepEqual(results.map((result) => result.id), ["raven"]);
});

test("a chosen inline result is counted for that project", async () => {
  installFetch();
  const env = makeEnv();
  const response = await sendWebhook(env, makeCtx(), {
    update_id: 8,
    chosen_inline_result: { from: { id: 77 }, result_id: "mobius" }
  });
  assert.equal(response.status, 200);
  const picks = trackedInserts(env, "inline");
  assert.equal(picks.length, 1);
  assert.equal(picks[0].args[2], "mobius");
});

test("/stats reports opens, inline picks, the week and referrers", async () => {
  const calls = installFetch();
  const counts = { cmd: [{ value: "projects", c: 4 }], nav: [{ value: "sites", c: 2 }], open: [{ value: "raven", c: 3 }], search: [{ value: "python", c: 2 }], ref: [{ value: "42", c: 1 }] };
  const today = new Date().toISOString().slice(0, 10);
  const env = makeEnv({
    BOT_DB: {
      prepare(sql) {
        return {
          bind(kind) {
            this.kind = kind;
            return this;
          },
          async all() {
            if (sql.includes("kind = ?")) return { results: counts[this.kind] || [] };
            if (sql.includes("date(ts) d")) return { results: [{ d: today, c: 5 }] };
            if (sql.includes("GROUP BY user_id")) return { results: [{ user_id: 7, c: 9 }] };
            return { results: [] };
          },
          async run() {
            return { success: true };
          },
          async first() {
            return { users: 12, msgs: 40, cmds: 9, opens: 3, inline_picks: 2, feedback: 4, today: 5 };
          }
        };
      }
    }
  });
  await sendWebhook(env, makeCtx(), messageUpdate("/stats", { chatId: 42, userId: 42 }));
  const text = lastText(calls);
  assert.match(text, /Пользователей: <b>12<\/b>/);
  assert.match(text, /Открытий карточек: <b>3<\/b>/);
  assert.match(text, /Выборов из inline: <b>2<\/b>/);
  assert.match(text, /Отзывов: <b>4<\/b>/);
  assert.match(text, /Raven — 3/, "топ открытых проектов по названиям, а не по id");
  assert.match(text, /python — 2/);
  assert.match(text, /<code>42<\/code> → 1/);
  assert.match(text, /\d\d\.\d\d █ 5/, "день недели с максимумом получает полную клетку");
});

test("both language packs cover every string the worker uses", () => {
  const source = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  const used = new Set([...source.matchAll(/LANG\[(?:lang|next)\]\.(\w+)/g)].map((match) => match[1]));
  const ru = Object.keys(LANG.ru).sort();
  const en = Object.keys(LANG.en).sort();
  assert.deepEqual(ru, en, "ru и en должны нести одни и те же ключи");
  for (const key of used) assert.ok(ru.includes(key), `LANG[lang].${key} есть в коде, но не в словарях`);
});

// Меню бота читается текстом: эмодзи в подписи кнопки или в заголовке — это откат,
// поэтому проверяем и исходник, и собранный бандл, и каждую строку обоих пакетов.
test("the bot interface carries no emoji", () => {
  const FORBIDDEN = /[\p{Emoji_Presentation}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu;
  const found = [];
  const scan = (where, text) => {
    for (const match of String(text).matchAll(FORBIDDEN)) found.push(`${where} → U+${match[0].codePointAt(0).toString(16)}`);
  };
  for (const file of ["../src/worker.js", "../cloudflare-worker/worker.js"]) {
    scan(file, readFileSync(new URL(file, import.meta.url), "utf8"));
  }
  for (const [language, pack] of Object.entries(LANG)) {
    for (const [key, value] of Object.entries(pack)) {
      scan(`${language}.${key}`, typeof value === "function" ? value("a", "b", "c", "d") : value);
    }
  }
  assert.deepEqual(found, [], `эмодзи в интерфейсе бота: ${found.join(", ")}`);
});

test("every command the Telegram menu advertises is handled", () => {
  const source = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  for (const [language, list] of Object.entries(COMMANDS)) {
    for (const { command } of list) {
      assert.match(
        source,
        new RegExp(`cmd === "/${command}"`),
        `«/${command}» есть в меню ${language}, но воркер её не обрабатывает`
      );
    }
  }
});

// Формат payload — из живого ответа /users/ssrjkk/events/public: в PushEvent без
// авторизации нет ни commits, ни size, только ref/head/before/push_id.
function pushEvent(repo, branch, head = "ea098cd3", before = "56d36f22") {
  return {
    type: "PushEvent",
    repo: { name: `ssrjkk/${repo}` },
    payload: { ref: `refs/heads/${branch}`, head, before, push_id: 49597532153, repository_id: 1414676630 }
  };
}

test("/news describes public events, escapes them and caches the set in KV", async () => {
  const calls = installFetch({
    events: [
      pushEvent("raven", "main", "aa11"),
      pushEvent("raven", "main", "bb22"),
      pushEvent("wake", "master", "cc33"),
      pushEvent("verso", "main", "56d36f22", "56d36f22"),
      { type: "ReleaseEvent", repo: { name: "ssrjkk/harvest" }, payload: { release: { tag_name: "v1.2.0" } } },
      {
        type: "PullRequestEvent",
        repo: { name: "ssrjkk/mobius" },
        payload: { action: "opened", pull_request: { title: "<b>hot</b> fix" } }
      },
      { type: "CreateEvent", repo: { name: "ssrjkk/volley" }, payload: { ref_type: "branch", ref: "gh-pages" } },
      { type: "DeleteEvent", repo: { name: "ssrjkk/qa-arsenal" }, payload: { ref_type: "branch", ref: "tmp" } },
      { type: "WatchEvent", repo: { name: "ssrjkk/qualix" }, payload: {} }
    ]
  });
  const env = makeEnv();
  await sendWebhook(env, makeCtx(), messageUpdate("/news", { chatId: 140 }));

  const sent = callsOf(calls, "sendMessage").at(-1);
  assert.match(sent.body.text, /raven<\/b> — push в main/);
  assert.equal(
    (sent.body.text.match(/raven<\/b> — push в main/g) || []).length,
    1,
    "одинаковые пуши одной ветки не превращают список в простыню"
  );
  assert.match(sent.body.text, /wake<\/b> — push в master/);
  assert.match(sent.body.text, /harvest<\/b> — релиз v1\.2\.0/);
  assert.match(sent.body.text, /volley<\/b> — создан branch gh-pages/);
  assert.match(sent.body.text, /qa-arsenal<\/b> — удалён branch tmp/);
  assert.match(
    sent.body.text,
    /mobius<\/b> — pull request opened: &lt;b&gt;hot&lt;\/b&gt; fix/,
    "заголовок чужого pull request экранируется"
  );
  assert.ok(!sent.body.text.includes("qualix"), "неописанный тип события не попадает в выдачу");
  assert.ok(!sent.body.text.includes("verso"), "пустой push (head == before) не событие");
  assert.deepEqual(
    keyboardData(sent).filter((value) => value.startsWith("https://github.com/")),
    [
      "https://github.com/ssrjkk/raven",
      "https://github.com/ssrjkk/wake",
      "https://github.com/ssrjkk/harvest",
      "https://github.com/ssrjkk/mobius"
    ]
  );

  const cached = JSON.parse(await env.BOT_KV.get("news"));
  assert.equal(cached.data.length, 6, "в кеш ложится тот же набор, что показан");
  assert.ok(cached.ts > 0 && cached.ts <= Date.now(), "кеш помечен временем сборки");
});

test("/news answers from a fresh KV entry without touching GitHub", async () => {
  const calls = installFetch();
  const env = makeEnv();
  await env.BOT_KV.put(
    "news",
    JSON.stringify({
      ts: Date.now(),
      data: [{ repo: "qualix", url: "https://github.com/ssrjkk/qualix", what: ["release", "v9.0"] }]
    })
  );
  await sendWebhook(env, makeCtx(), messageUpdate("/news", { chatId: 141 }));

  assert.equal(callsOf(calls, "github").length, 0, "свежий кеш не тратит бюджет GitHub");
  assert.match(lastText(calls), /qualix<\/b> — релиз v9\.0/);
});

test("/news ignores a KV entry that is not a list", async () => {
  const calls = installFetch();
  const env = makeEnv();
  await env.BOT_KV.put("news", JSON.stringify({ ts: Date.now(), data: { repo: "raven" } }));
  await sendWebhook(env, makeCtx(), messageUpdate("/news", { chatId: 142 }));
  assert.equal(callsOf(calls, "github").length, 1, "битая запись не считается кешем");
  assert.match(lastText(calls), /Свежих событий нет/);
});

// 403 — лимит на IP, 202 — лента ещё генерируется; оба приходят с пустым телом и
// оба не означают, что репозитории молчали сутки.
for (const [status, body] of [
  [403, { message: "API rate limit exceeded" }],
  [202, []]
]) {
  test(`/news keeps the last set when GitHub answers ${status}`, async () => {
    const calls = installFetch({ events: body, eventsStatus: status });
    const env = makeEnv();
    const staleAt = Date.now() - 20 * 60 * 1000;
    await env.BOT_KV.put(
      "news",
      JSON.stringify({
        ts: staleAt,
        data: [{ repo: "raven", url: "https://github.com/ssrjkk/raven", what: ["push", "main"] }]
      })
    );
    await sendWebhook(env, makeCtx(), messageUpdate("/news", { chatId: 151 }));

    assert.equal(callsOf(calls, "github").length, 1, "устаревший кеш всё равно пытается обновиться");
    assert.match(lastText(calls), /raven<\/b> — push в main/, `${status} не должен стирать показанное`);
    assert.equal(
      JSON.parse(await env.BOT_KV.get("news")).ts,
      staleAt,
      "пустой ответ GitHub не перезаписывает кеш"
    );
  });
}

test("a news entry lives a day so a rate limit cannot blank the section", async () => {
  installFetch({
    events: [{ type: "ReleaseEvent", repo: { name: "ssrjkk/raven" }, payload: { release: { tag_name: "v1" } } }]
  });
  const env = makeEnv();
  await sendWebhook(env, makeCtx(), messageUpdate("/news", { chatId: 152 }));
  const put = env.puts.find((row) => row.key === "news");
  assert.equal(put.options.expirationTtl, 86400, "свежесть держится по ts, а не по TTL ключа");
});

test("/news says so when GitHub has nothing to show", async () => {
  const calls = installFetch();
  await sendWebhook(makeEnv(), makeCtx(), messageUpdate("/news", { chatId: 153 }));
  assert.match(lastText(calls), /Свежих событий нет/);
  assert.deepEqual(keyboardData(callsOf(calls, "sendMessage").at(-1)), ["show:menu"]);
});

test("/news is translated through the same cached set", async () => {
  const calls = installFetch({
    events: [{ type: "CreateEvent", repo: { name: "ssrjkk/noema" }, payload: { ref_type: "tag", ref: "v0.1" } }]
  });
  const env = makeEnv();
  await sendWebhook(env, makeCtx(), messageUpdate("/news", { chatId: 143 }));
  await sendWebhook(env, makeCtx(), callbackUpdate("lang:en", { chatId: 143 }));
  await sendWebhook(env, makeCtx(), messageUpdate("/news", { chatId: 143 }));
  const en = lastText(calls);
  assert.match(en, /noema<\/b> — created tag v0\.1/);
  assert.match(en, /What happened on GitHub/);
});

test("the menu and the callback both open /news", async () => {
  const calls = installFetch({
    events: [
      { type: "ReleaseEvent", repo: { name: "ssrjkk/raven" }, payload: { release: { tag_name: "v2.0" } } }
    ]
  });
  const env = makeEnv();
  await sendWebhook(env, makeCtx(), messageUpdate("/start", { chatId: 144 }));
  const menu = callsOf(calls, "sendMessage").at(-1);
  assert.ok(keyboardData(menu).includes("show:news"), "в главном меню есть кнопка обновлений");

  await sendWebhook(env, makeCtx(), callbackUpdate("show:news", { chatId: 144 }));
  assert.match(callsOf(calls, "editMessageText").at(-1).body.text, /Что произошло на GitHub/);
});

test("/projects offers stack facets taken from the catalogue", async () => {
  const calls = installFetch();
  const env = makeEnv();
  const catalogue = JSON.parse(readFileSync(new URL("../projects.json", import.meta.url), "utf8"));

  await sendWebhook(env, makeCtx(), messageUpdate("/projects", { chatId: 145 }));
  const sent = callsOf(calls, "sendMessage").at(-1);
  const facets = sent.body.reply_markup.inline_keyboard
    .flat()
    .filter((button) => (button.callback_data || "").startsWith("stack:"));
  assert.equal(facets.length, 6, "показываем шесть самых частых технологий");
  const stacks = new Set(catalogue.projects.flatMap((project) => String(project.lang).split(",").map((t) => t.trim())));
  for (const facet of facets) {
    const token = facet.callback_data.slice(6, facet.callback_data.lastIndexOf(":"));
    assert.ok(stacks.has(token), `фасет «${token}» не из каталога`);
  }

  await sendWebhook(env, makeCtx(), callbackUpdate("stack:Python:0", { chatId: 145 }));
  const edited = callsOf(calls, "editMessageText").at(-1);
  assert.match(edited.body.text, /<b>Мои проекты — Python:<\/b>/);
  const python = new Set(
    catalogue.projects
      .filter((project) =>
        String(project.lang).split(",").map((token) => token.trim().toLowerCase()).includes("python")
      )
      .map((project) => project.name)
  );
  const shown = edited.body.reply_markup.inline_keyboard
    .flat()
    .filter((button) => (button.callback_data || "").startsWith("p:"))
    .map((button) => button.callback_data.slice(2));
  assert.ok(shown.length > 0 && shown.length <= 3);
  for (const name of shown) assert.ok(python.has(name), `${name} не Python-проект`);
  assert.deepEqual(
    edited.body.reply_markup.inline_keyboard
      .flat()
      .filter((button) => (button.callback_data || "").startsWith("stack:"))
      .map((button) => button.text)
      .filter((text) => text.startsWith("✓")),
    ["✓ Python"],
    "активный фасет отмечен"
  );
  assert.ok(keyboardData(edited).includes("page:0"), "есть кнопка сброса фильтра");
  assert.ok(
    keyboardData(edited).some((value) => value.startsWith("stack:Python:1")),
    "пагинация внутри фильтра остаётся в фильтре"
  );
});

test("a facet without projects says so instead of showing an empty list", async () => {
  const calls = installFetch();
  await sendWebhook(makeEnv(), makeCtx(), callbackUpdate("stack:cobol:0", { chatId: 146 }));
  const edited = callsOf(calls, "editMessageText").at(-1);
  assert.match(edited.body.text, /<b>Мои проекты — cobol:<\/b>/);
  assert.match(edited.body.text, /Проектов со стеком «cobol»/);
  assert.ok(!keyboardData(edited).some((value) => value.startsWith("p:")), "пустой список не предлагает карточек");
});

test("facet clicks are counted as navigation", async () => {
  installFetch();
  const env = makeEnv();
  await sendWebhook(env, makeCtx(), callbackUpdate("stack:TypeScript:0", { chatId: 147 }));
  assert.equal(trackedInserts(env, "nav").at(-1).args[2], "stack:TypeScript");
});

test("/feedback forwards a note to the owner escaped and counted", async () => {
  const calls = installFetch();
  const env = makeEnv();
  await sendWebhook(env, makeCtx(), messageUpdate("/feedback <b>привет</b> & <i>мир</i>", { chatId: 148, userId: 148 }));

  const toOwner = callsOf(calls, "sendMessage").filter((call) => String(call.body.chat_id) === "42");
  assert.equal(toOwner.length, 1);
  assert.match(toOwner[0].body.text, /&lt;b&gt;привет&lt;\/b&gt; &amp; &lt;i&gt;мир&lt;\/i&gt;/);
  assert.match(toOwner[0].body.text, /<code>148<\/code>/);
  assert.match(lastText(calls), /передано владельцу/);
  assert.equal(trackedInserts(env, "feedback").length, 1);

  await sendWebhook(env, makeCtx(), messageUpdate("/feedback", { chatId: 148, userId: 148 }));
  assert.match(lastText(calls), /Формат: \/feedback/);
  assert.equal(
    callsOf(calls, "sendMessage").filter((call) => String(call.body.chat_id) === "42").length,
    1,
    "пустой отзыв владельцу не отправляется"
  );
  assert.equal(trackedInserts(env, "feedback").length, 1, "несданный отзыв не считается");
});

test("/feedback without an owner configured does not claim delivery", async () => {
  const calls = installFetch();
  const env = makeEnv({ OWNER_ID: "" });
  await sendWebhook(env, makeCtx(), messageUpdate("/feedback есть замечание", { chatId: 149, userId: 149 }));
  assert.match(lastText(calls), /не настроен|not configured/i);
  assert.deepEqual(
    [...new Set(callsOf(calls, "sendMessage").map((call) => String(call.body.chat_id)))],
    ["149"],
    "без OWNER_ID сообщения летят только ответившему, а не в пустой чат"
  );
  assert.equal(trackedInserts(env, "feedback").length, 0);
});

test("/feedback truncates a long note so the owner chat stays readable", async () => {
  const calls = installFetch();
  const env = makeEnv();
  await sendWebhook(env, makeCtx(), messageUpdate(`/feedback ${"а".repeat(1200)}`, { chatId: 150, userId: 150 }));
  const toOwner = callsOf(calls, "sendMessage").find((call) => String(call.body.chat_id) === "42");
  assert.equal("а".repeat(900), toOwner.body.text.match(/а+/g).sort((x, y) => y.length - x.length)[0]);
  assert.ok(toOwner.body.text.length < 950);
});

test("a project card shares a deep link with the project description", () => {
  const project = { name: "raven", title: "Raven", desc: "Поиск по репозиториям.", desc_en: "Repository search." };

  const ru = new URL(shareProjectUrl("ru", project));
  assert.equal(ru.searchParams.get("url"), "https://t.me/ssrjkk_bot?start=p_raven");
  assert.equal(ru.searchParams.get("text"), "Raven — Поиск по репозиториям.");
  assert.equal(
    new URL(shareProjectUrl("en", project)).searchParams.get("text"),
    "Raven — Repository search."
  );

  const buttons = projectDetailKeyboard("ru", project).flat();
  const share = buttons.find((button) => (button.url || "").startsWith("https://t.me/share"));
  assert.equal(share.text, LANG.ru.shareProject);
  assert.equal(share.url, shareProjectUrl("ru", project));
});

// Бэкофф проверяют на /help: команда даёт ровно один sendMessage и не трогает GitHub,
// поэтому число обращений к Telegram — это число попыток, а не побочных запросов.
function telegramStatuses(method, status, body, until = 1) {
  let attempts = 0;
  return (call) => {
    if (call.method !== method) return null;
    attempts += 1;
    return attempts <= until ? jsonResponse(body, status) : null;
  };
}

test("callApi repeats a 429 instead of dropping the answer", async () => {
  const calls = installFetch({
    telegram: telegramStatuses("sendMessage", 429, {
      ok: false,
      error_code: 429,
      description: "Too Many Requests",
      parameters: { retry_after: 0 }
    })
  });
  const response = await sendWebhook(makeEnv(), makeCtx(), messageUpdate("/help", { chatId: 160 }));

  const messages = callsOf(calls, "sendMessage");
  assert.equal(messages.length, 2, "первый ответ 429, второй — обычный");
  assert.equal(response.status, 200);
  assert.equal(messages[0].body.text, messages[1].body.text, "повтор отправляет то же сообщение");
});

test("callApi waits the seconds Telegram asks for", async () => {
  const calls = installFetch({
    telegram: telegramStatuses("sendMessage", 429, {
      ok: false,
      error_code: 429,
      parameters: { retry_after: 1 }
    })
  });
  const startedAt = Date.now();
  await sendWebhook(makeEnv(), makeCtx(), messageUpdate("/help", { chatId: 161 }));
  const waited = Date.now() - startedAt;

  assert.equal(callsOf(calls, "sendMessage").length, 2);
  assert.ok(waited >= 1000, `retry_after=1s, подождали ${waited}мс`);
});

test("callApi keeps the wait inside its own budget", async () => {
  // Telegram может попросить паузу на десятки секунд. Вебхук ждёт ответ бота,
  // поэтому платим потолок и останавливаемся, а не висим половину лимита воркера.
  const calls = installFetch({
    telegram: telegramStatuses(
      "sendMessage",
      429,
      { ok: false, error_code: 429, parameters: { retry_after: 40 } },
      Infinity
    )
  });
  const startedAt = Date.now();
  await sendWebhook(makeEnv(), makeCtx(), messageUpdate("/help", { chatId: 162 }));
  const waited = Date.now() - startedAt;

  assert.equal(callsOf(calls, "sendMessage").length, 2, "бюджет на паузы кончился — третьего раза нет");
  assert.ok(waited >= 3000 && waited < 4000, `ждали ${waited}мс вместо запрошенных 40000`);
});

test("callApi stops after three attempts of the same 429", async () => {
  const calls = installFetch({
    telegram: () =>
      jsonResponse({ ok: false, error_code: 429, parameters: { retry_after: 0 } }, 429)
  });
  const response = await sendWebhook(makeEnv(), makeCtx(), messageUpdate("/help", { chatId: 163 }));

  assert.equal(callsOf(calls, "sendMessage").length, 3);
  assert.equal(response.status, 200, "исчерпанный лимит не должен злить Telegram ределивером");
});

test("callApi does not repeat a 500", async () => {
  const calls = installFetch({
    telegram: telegramStatuses("sendMessage", 500, {
      ok: false,
      error_code: 500,
      description: "Internal Server Error"
    })
  });
  await sendWebhook(makeEnv(), makeCtx(), messageUpdate("/help", { chatId: 164 }));
  assert.equal(callsOf(calls, "sendMessage").length, 1, "под 500 send мог состояться — повтор это дубликат");
});

test("callApi repeats a 503 that answers with an empty body", async () => {
  // 502/503 приходят с фронта Telegram без JSON-тела: парсер не должен на них падать.
  let attempts = 0;
  const calls = installFetch({
    telegram: ({ method }) => {
      if (method !== "editMessageText") return null;
      attempts += 1;
      return attempts === 1 ? new Response("", { status: 503 }) : null;
    }
  });
  await sendWebhook(makeEnv(), makeCtx(), callbackUpdate("show:menu", { chatId: 165 }));
  assert.equal(callsOf(calls, "editMessageText").length, 2);
});

test("the language cache drops the oldest chat instead of growing forever", async () => {
  // Кеш языка живёт в модуле воркера и переживает запросы, поэтому у него есть потолок.
  // Проверяем без доступа к Map: вытесненный чат обязан снова перечитать KV, а живой —
  // нет, иначе потолок есть, а вытеснение не то.
  const env = makeEnv();
  const first = 900_001;
  installFetch();
  for (let offset = 0; offset <= LANG_CACHE_LIMIT; offset++) {
    await sendWebhook(env, makeCtx(), messageUpdate("/help", { chatId: first + offset }));
  }

  await env.BOT_KV.put(`lang:${first}`, "en");
  const evicted = installFetch();
  await sendWebhook(env, makeCtx(), messageUpdate("/help", { chatId: first }));
  assert.equal(lastText(evicted), LANG.en.help, "вытесненный чат перечитал язык из KV");

  const last = first + LANG_CACHE_LIMIT;
  await env.BOT_KV.put(`lang:${last}`, "en");
  const cached = installFetch();
  await sendWebhook(env, makeCtx(), messageUpdate("/help", { chatId: last }));
  assert.equal(lastText(cached), LANG.ru.help, "язык из кеша в KV не перечитывается");
});

test("every channel handle the bot prints has a button behind it", () => {
  // Канал может стать приватным — тогда он остаётся только кнопкой со ссылкой-инвайтом,
  // а хендл в тексте превращается в мёртвую ссылку для читателя.
  const catalogue = JSON.parse(readFileSync(new URL("../projects.json", import.meta.url), "utf8"));
  const urls = [
    ...(catalogue.channels || []),
    ...(catalogue.links || []),
    { url: catalogue.bot },
    ...catalogue.projects.flatMap((project) => [project.site, project.bot].filter(Boolean).map((url) => ({ url })))
  ];
  const linked = new Set(
    urls
      .map((item) => item.url)
      .filter((url) => url.startsWith("https://t.me/") && !url.includes("+"))
      .map((url) => `@${new URL(url).pathname.slice(1)}`)
  );

  let mentions = 0;
  for (const pack of Object.values(LANG)) {
    for (const value of Object.values(pack)) {
      const text = typeof value === "function" ? value(1, 1) : String(value);
      for (const handle of text.match(/@[A-Za-z][A-Za-z0-9_]+/g) ?? []) {
        mentions += 1;
        assert.ok(linked.has(handle), `${handle} упоминается в тексте, но кнопки со ссылкой нет`);
      }
    }
  }
  assert.ok(mentions > 0, "иначе проверка ничего не проверяет");
});

test("/channels offers every catalogue channel by its own url", async () => {
  const catalogue = JSON.parse(readFileSync(new URL("../projects.json", import.meta.url), "utf8"));
  const calls = installFetch();
  await sendWebhook(makeEnv(), makeCtx(), messageUpdate("/channels", { chatId: 167 }));

  const buttons = callsOf(calls, "sendMessage").at(-1).body.reply_markup.inline_keyboard
    .flat()
    .filter((button) => button.url);
  assert.deepEqual(
    buttons.map((button) => button.url),
    catalogue.channels.map((channel) => channel.url),
    "кнопки повторяют каталог каналов: приватный канал доступен только своей ссылкой"
  );
});


function rowsOf(call) {
  return call.body.reply_markup?.inline_keyboard ?? [];
}

function recordingDb(store) {
  return {
    prepare(sql) {
      store.push(sql);
      return {
        bind() {
          return this;
        },
        async run() {
          return { success: true };
        },
        async all() {
          return { results: [] };
        },
        async first() {
          return null;
        }
      };
    }
  };
}

function starCounts(text) {
  return [...text.matchAll(/— (\d+)★/g)].map((match) => Number(match[1]));
}

test("/top ranks by live stars, not by the order of projects.json", async () => {
  const instance = cleanWorkerCache();
  const calls = installFetch({ stars: { raven: 41, wake: 17, bothive: 5 }, starsDefault: 0 });
  await webhookOn(instance, makeEnv(), makeCtx(), messageUpdate("/top", { chatId: 301 }));

  const text = lastText(calls);
  assert.ok(text.startsWith(LANG.ru.topTitle), "шапка топа берётся из языкового пакета");
  assert.deepEqual(starCounts(text), [41, 17, 5], "три строки по убыванию живых звёзд");
  const lines = text.split("\n").filter((line) => line.includes("★"));
  assert.equal(lines.length, 3, "топ печатает ровно три проекта");
  lines.forEach((line, index) => {
    assert.ok(line.startsWith(`${index + 1}. `), `строка ${index + 1} начинается с номера, а не с картинки`);
  });
  assert.match(lines[0], /Raven/, "первой строкой должен быть лидер по звёздам");
  assert.deepEqual(rowsOf(callsOf(calls, "sendMessage").at(-1)), [], "команда печатает текст без кнопок");
});

test("/top falls back to the stars in projects.json when GitHub says nothing", async () => {
  const instance = cleanWorkerCache();
  const calls = installFetch({ githubStatus: 403 });
  await webhookOn(instance, makeEnv(), makeCtx(), messageUpdate("/top", { chatId: 302 }));

  const expected = CATALOGUE.projects
    .map((project) => project.stars || 0)
    .sort((a, b) => b - a)
    .slice(0, 3);
  assert.deepEqual(starCounts(lastText(calls)), expected, "лимит GitHub не должен превращать топ в нули");
  assert.equal(
    callsOf(calls, "github").length,
    CATALOGUE.projects.length,
    "каждый репозиторий всё равно спрошен, просто ответ отвергнут"
  );
});

test("a fresh stars record in KV is reused, and so is the copy in the module", async () => {
  const instance = cleanWorkerCache();
  const env = makeEnv();
  await env.BOT_KV.put("stars", JSON.stringify({ ts: Date.now(), data: { raven: { stars: 99 } } }));
  const calls = installFetch({ stars: { raven: 1 } });
  await webhookOn(instance, env, makeCtx(), messageUpdate("/top", { chatId: 303 }));
  assert.equal(callsOf(calls, "github").length, 0, "свежий кеш в KV не тратит бюджет GitHub");
  assert.deepEqual(starCounts(lastText(calls)).slice(0, 1), [99], "топ собран из кеша, а не из данных");

  // Второй запрос идёт по копии в памяти модуля — с пустым KV, чтобы KV при этом
  // был ни при чём и проверка не подменила собой первую.
  const second = installFetch({ stars: { raven: 1 } });
  await webhookOn(instance, makeEnv(), makeCtx(), messageUpdate("/top", { chatId: 304 }));
  assert.equal(callsOf(second, "github").length, 0, "в пределах TTL модуль не переспрашивает GitHub");
});

test("/links offers exactly the catalogue links and then the way back", async () => {
  const calls = installFetch();
  await sendWebhook(makeEnv(), makeCtx(), messageUpdate("/links", { chatId: 305 }));

  const last = callsOf(calls, "sendMessage").at(-1);
  assert.equal(last.body.text, LANG.ru.linksTitle);
  assert.deepEqual(
    rowsOf(last).flat().map((button) => button.url ?? button.callback_data),
    [...CATALOGUE.links.map((link) => link.url), "show:menu"],
    "кнопки повторяют каталог ссылок"
  );
});

test("/myid answers the numeric id in a copyable code tag", async () => {
  const calls = installFetch();
  await sendWebhook(makeEnv(), makeCtx(), messageUpdate("/myid", { chatId: -100201, userId: 397602448 }));
  assert.equal(lastText(calls), "Your ID: <code>397602448</code>", "в группе показываем id автора, а не чата");
});

test("/search without a query asks for the format and tracks nothing", async () => {
  const env = makeEnv();
  const calls = installFetch();
  await sendWebhook(env, makeCtx(), messageUpdate("/search", { chatId: 307 }));

  assert.equal(lastText(calls), LANG.ru.searchPrompt);
  assert.equal(trackedInserts(env, "search").length, 0, "пустой запрос не попадает в топ поисков");
  assert.equal(trackedInserts(env, "cmd").length, 1, "саму команду считаем");
});

test("/broadcast reaches every user the bot has seen, ten at a time", async () => {
  const ids = [42, 101, 102, 103, 104, 105, 106, 107, 108, 109, 7, 110];
  const env = makeEnv({ BOT_DB: dbReturning([ids.map((user_id) => ({ user_id }))]) });
  const calls = installFetch({
    telegram: ({ method, body }) =>
      method === "sendMessage" && body.chat_id === 7
        ? jsonResponse({ ok: false, error_code: 400, description: "telegram api error" })
        : null
  });

  // Считаем, сколько отправок живёт одновременно: чанки по 10 — это защита от
  // 429, а не деталь реализации.
  let inflight = 0;
  let peak = 0;
  const transport = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const sending = String(input).includes("/sendMessage");
    if (sending) peak = Math.max(peak, (inflight += 1));
    try {
      return await transport(input, init);
    } finally {
      if (sending) inflight -= 1;
    }
  };

  try {
    await sendWebhook(env, makeCtx(), messageUpdate("/broadcast обновлён каталог", { chatId: 42 }));
  } finally {
    globalThis.fetch = transport;
  }

  assert.equal(peak, 10, "рассылка идёт чанками по десять адресатов");
  const messages = callsOf(calls, "sendMessage").map((call) => call.body);
  assert.equal(messages.length, ids.length + 1, "по строке на каждого плюс итог");
  assert.deepEqual(
    messages.slice(0, ids.length).map((body) => body.chat_id),
    ids,
    "каждый id получает ровно одно сообщение, в порядке выборки"
  );
  assert.ok(messages.slice(0, ids.length).every((body) => body.text === "обновлён каталог"));
  assert.equal(messages.at(-1).text, LANG.ru.broadcastDone(11, 1), "заблокировавший бот читается как недоставленный");
});

test("/broadcast and /stats do not read events for anyone but the owner", async () => {
  const seen = [];
  const env = makeEnv({ BOT_DB: recordingDb(seen) });
  const calls = installFetch();
  await sendWebhook(env, makeCtx(), messageUpdate("/broadcast привет", { chatId: 100 }));
  assert.equal(lastText(calls), LANG.ru.notOwner);

  const second = installFetch();
  await sendWebhook(makeEnv({ BOT_DB: recordingDb(seen) }), makeCtx(), messageUpdate("/stats", { chatId: 100 }));
  assert.equal(lastText(second), LANG.ru.notOwner);
  assert.ok(
    seen.every((sql) => !sql.includes("SELECT DISTINCT user_id")),
    "чужая рассылка не должна читать таблицу событий"
  );
});

test("without OWNER_ID the owner commands say the bot is not configured", async () => {
  const calls = installFetch();
  await sendWebhook(makeEnv({ OWNER_ID: "" }), makeCtx(), messageUpdate("/stats", { chatId: 100 }));
  assert.equal(lastText(calls), LANG.ru.notConfigured);

  const second = installFetch();
  await sendWebhook(makeEnv({ OWNER_ID: "" }), makeCtx(), messageUpdate("/broadcast привет", { chatId: 100 }));
  assert.equal(lastText(second), LANG.ru.notConfigured);
});

test("/broadcast asks for text and refuses an empty audience", async () => {
  const calls = installFetch();
  await sendWebhook(makeEnv(), makeCtx(), messageUpdate("/broadcast   ", { chatId: 42 }));
  assert.equal(lastText(calls), LANG.ru.broadcastPrompt);

  const second = installFetch();
  await sendWebhook(makeEnv({ BOT_DB: dbReturning([[]]) }), makeCtx(), messageUpdate("/broadcast привет", { chatId: 42 }));
  assert.equal(lastText(second), LANG.ru.broadcastEmpty);
  assert.equal(callsOf(second, "sendMessage").length, 1, "пустая рассылка не должна ничего отправлять");
});

test("a menu button renders what the matching command prints", async () => {
  const instance = cleanWorkerCache();
  const pairs = [
    ["show:top", "/top"],
    ["show:sites", "/sites"],
    ["show:bots", "/bots"],
    ["show:links", "/links"],
    ["show:channels", "/channels"],
    ["show:about", "/about"],
    ["show:help", "/help"]
  ];

  for (const [index, [payload, command]] of pairs.entries()) {
    const chatId = 700 + index;
    const commandCalls = installFetch();
    await webhookOn(instance, makeEnv(), makeCtx(), messageUpdate(command, { chatId }));
    const printed = callsOf(commandCalls, "sendMessage").at(-1);

    const buttonCalls = installFetch();
    await webhookOn(instance, makeEnv(), makeCtx(), callbackUpdate(payload, { chatId }));
    const rendered = callsOf(buttonCalls, "editMessageText").at(-1);

    assert.ok(rendered, `${payload} не отредактировал сообщение`);
    assert.equal(rendered.body.text, printed.body.text, `${payload} печатает не то, что ${command}`);
    if (payload === "show:top" || payload === "show:help") {
      assert.deepEqual(
        rowsOf(rendered).flat().map((button) => button.callback_data),
        ["show:menu"],
        `${payload} должен вести обратно в меню`
      );
    } else {
      assert.deepEqual(rowsOf(rendered), rowsOf(printed), `${payload}: кнопки расходятся с ${command}`);
    }
    assert.equal(callsOf(buttonCalls, "answerCallbackQuery").length, 1, `${payload}: Telegram ждёт ответа на нажатие`);
  }
});

test("the language screen and an unknown button both keep the reader inside the bot", async () => {
  const instance = cleanWorkerCache();
  const calls = installFetch();
  await webhookOn(instance, makeEnv(), makeCtx(), callbackUpdate("show:lang", { chatId: 760 }));
  const screen = callsOf(calls, "editMessageText").at(-1);
  assert.equal(screen.body.text, LANG.ru.langMenu);
  assert.deepEqual(
    rowsOf(screen).flat().map((button) => button.callback_data),
    ["lang:ru", "lang:en", "show:menu"]
  );

  const fallback = installFetch();
  await webhookOn(instance, makeEnv(), makeCtx(), callbackUpdate("show:zzz", { chatId: 761 }));
  const unknown = callsOf(fallback, "editMessageText").at(-1);
  assert.equal(unknown.body.text, LANG.ru.menu, "неизвестная кнопка возвращает главное меню, а не тишину");

  const menu = installFetch();
  await webhookOn(instance, makeEnv(), makeCtx(), callbackUpdate("show:menu", { chatId: 762 }));
  assert.deepEqual(
    rowsOf(unknown),
    rowsOf(callsOf(menu, "editMessageText").at(-1)),
    "неизвестная и заглавная кнопка ведут в одно меню"
  );
});

test("/start still greets when the platform refuses the cache write", async () => {
  const instance = cleanWorkerCache();
  const calls = installFetch();
  const ctx = makeCtx();
  // Первым waitUntil идёт событие msg, вторым — кеш звёзд. Отказываем второму:
  // приветствие не должно зависеть от того, удалось ли записать кеш.
  let waits = 0;
  ctx.waitUntil = (promise) => {
    waits += 1;
    if (waits === 2) throw new Error("waitUntil is not allowed after the response");
    ctx.pending.push(promise);
  };

  const response = await webhookOn(instance, makeEnv(), ctx, messageUpdate("/start", { chatId: 800 }));
  assert.equal(response.status, 200, "вебхук не роняет ответ из-за отказа кеша");

  const sites = CATALOGUE.projects.filter((project) => project.site).length;
  const bots = CATALOGUE.projects.filter((project) => project.bot).length;
  const text = lastText(calls);
  assert.match(text, new RegExp(`Сайтов: ${sites} · Ботов: ${bots}`), "счётчики считаются по каталогу");
  assert.match(text, /Звёзд: 0★/, "без кеша звёзды просто не показываются");
  assert.ok(rowsOf(callsOf(calls, "sendMessage").at(-1)).length >= 3, "меню под приветствием остаётся");
});

test("a KV that throws costs the reader neither the language nor the stars", async () => {
  const instance = cleanWorkerCache();
  const env = makeEnv();
  env.BOT_KV = {
    async get(key) {
      throw new Error(`KV ${key} unavailable`);
    },
    async put() {}
  };

  const calls = installFetch();
  const response = await webhookOn(instance, env, makeCtx(), messageUpdate("/help", { chatId: 900 }));
  assert.equal(response.status, 200);
  assert.equal(lastText(calls), LANG.ru.help, "без KV держимся языка по умолчанию");

  const second = installFetch({ stars: { raven: 8 }, starsDefault: 0 });
  await webhookOn(instance, env, makeCtx(), messageUpdate("/top", { chatId: 901 }));
  assert.deepEqual(starCounts(lastText(second)).slice(0, 1), [8], "битый KV не обнуляет звёзды из GitHub");
  assert.ok(lastText(second).includes("★"), "топ печатает звёзды, а не пустую строку");
});

test("inline results follow the data: no screenshot means an article, private means no GitHub link", async () => {
  const instance = await workerWithCatalogue((data) => {
    delete data.projects[0].shot;
    data.projects[0].private = true;
  });
  const calls = installFetch();
  const response = await instance.fetch(
    new Request(`${BASE}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": SECRET },
      body: JSON.stringify({
        update_id: 3,
        inline_query: { id: "iq-2", from: { id: 200, language_code: "ru" }, query: "", offset: "" }
      })
    }),
    makeEnv(),
    makeCtx()
  );
  assert.equal(response.status, 200);

  const results = callsOf(calls, "answerInlineQuery").at(-1).body.results;
  const [closed, next] = results;
  assert.equal(closed.type, "article", "без скриншота Telegram не принимает photo-результат");
  assert.equal(closed.input_message_content.parse_mode, "HTML");
  assert.match(closed.input_message_content.message_text, /исходники закрыты/);
  // Хосты разбираются из URL, а не ищутся подстрокой: «github.com» как подстрока
  // живёт и в https://github.com.evil/, так что проверка пропускала бы подделку.
  const isGithub = (url) => {
    const hostname = new URL(url).hostname;
    return hostname === "github.com" || hostname.endsWith(".github.com");
  };
  const urlsInText = (text) => [...text.matchAll(/https?:\/\/[^\s"<)]+/g)].map((match) => match[0]);
  const urlsInMarkup = (markup) => (markup?.inline_keyboard ?? []).flat().map((button) => button.url).filter(Boolean);
  assert.ok(
    !urlsInText(closed.input_message_content.message_text).some(isGithub),
    "приватный репозиторий не должен получать кнопку GitHub"
  );
  assert.ok(!urlsInMarkup(closed.reply_markup).some(isGithub), "и кнопок под карточкой тоже");
  assert.equal(next.type, "photo", "остальные проекты с картинками остаются картинками");
  // та же проверка на проекте с открытым кодом обязана найти GitHub — иначе две
  // ассертации выше ничего не утверждают
  assert.ok(urlsInMarkup(next.reply_markup).some(isGithub), "публичный проект остаётся с кнопкой GitHub");
});

test("/setup refuses to half-configure a worker without BOT_TOKEN", async () => {
  const response = await worker.fetch(new Request(`${BASE}/setup?key=setup-key`), makeEnv({ BOT_TOKEN: "" }), makeCtx());
  assert.equal(response.status, 500);
  assert.equal(await response.text(), "BOT_TOKEN not set");
});

test("paths Telegram does not use answer 404 instead of pretending to work", async () => {
  for (const [method, path] of [
    ["GET", "/webhook"],
    ["GET", "/nope"],
    ["POST", "/nope"]
  ]) {
    const response = await worker.fetch(new Request(`${BASE}${path}`, { method }), makeEnv(), makeCtx());
    assert.equal(response.status, 404, `${method} ${path} должен быть 404`);
    assert.equal(await response.text(), "Not found");
  }
});

test("/webhook without BOT_TOKEN answers 500 rather than a silent 200", async () => {
  const response = await sendWebhook(
    makeEnv({ BOT_TOKEN: "" }),
    makeCtx(),
    messageUpdate("/start", { chatId: 1 }),
    {}
  );
  assert.equal(response.status, 500);
  assert.equal(await response.text(), "BOT_TOKEN not set");
});

test("a broken update answers 500 so Telegram retries instead of dropping it", async () => {
  const env = makeEnv();
  const broken = await worker.fetch(
    new Request(`${BASE}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": SECRET },
      body: "{not json"
    }),
    env,
    makeCtx()
  );
  assert.equal(broken.status, 500);
  assert.equal(await broken.text(), "Error", "битое тело — это 500, а не «ОК, обработали»");

  const half = await worker.fetch(
    new Request(`${BASE}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": SECRET },
      body: JSON.stringify({ update_id: 9, callback_query: { id: "cb", data: "show:menu", from: { id: 5 } } })
    }),
    env,
    makeCtx()
  );
  assert.equal(half.status, 500, "нажатие без message не должно превращаться в тихий успех");
});

test("a GitHub that does not answer at all still leaves the top readable", async () => {
  const instance = cleanWorkerCache();
  const calls = installFetch({ githubError: true });
  await webhookOn(instance, makeEnv(), makeCtx(), messageUpdate("/top", { chatId: 310 }));

  const expected = CATALOGUE.projects
    .map((project) => project.stars || 0)
    .sort((a, b) => b - a)
    .slice(0, 3);
  assert.deepEqual(starCounts(lastText(calls)), expected, "сетевой сбой не должен превращать топ в нули");
});

test("a noop button answers the tap and touches nothing else", async () => {
  const calls = installFetch();
  await sendWebhook(makeEnv(), makeCtx(), callbackUpdate("noop", { chatId: 311 }));

  assert.deepEqual(
    calls.map((call) => call.method),
    ["answerCallbackQuery"],
    "подсказка «сейчас покажем» не должна ничего редактировать и ничего считать"
  );
  assert.equal(callsOf(calls, "answerCallbackQuery").at(-1).body.callback_query_id, "cb-1");
});

// ——— пакет 2: всё, до чего живой каталог и здоровый Telegram не доводят ———

// D1 без `results` и с `first() === null` — это не то, что отдаёт обвязка из тестов
// выше: так выглядит ответ просроченной или перезапущенной базы.
function dbEmpty() {
  return {
    prepare() {
      return {
        bind() {
          return this;
        },
        async run() {
          return { success: true };
        },
        async all() {
          return {};
        },
        async first() {
          return null;
        }
      };
    }
  };
}

function inlineUpdate(query) {
  return { update_id: 7, inline_query: { id: "iq-1", offset: "", ...query } };
}

test("/news drops events there is nothing to sign", async () => {
  const calls = installFetch({
    events: [
      { type: "PushEvent" },
      { type: "WatchEvent", repo: { name: "ssrjkk/qualix" }, payload: {} },
      { type: "PushEvent", repo: { name: "ssrjkk/raven" }, payload: {} },
      { type: "ReleaseEvent", repo: { name: "ssrjkk/harvest" } },
      { type: "CreateEvent", repo: { name: "ssrjkk/volley" }, payload: { ref_type: "branch" } },
      { type: "DeleteEvent", repo: { name: "ssrjkk/corvid" }, payload: { ref: "tmp" } },
      { type: "PullRequestEvent", repo: { name: "ssrjkk/drafter" }, payload: { pull_request: { title: "нет действия" } } },
      { type: "PullRequestEvent", repo: { name: "ssrjkk/verso" }, payload: { action: "closed" } },
      {
        type: "PullRequestEvent",
        repo: { name: "ssrjkk/tt-bot" },
        payload: { action: "closed", pull_request: {} }
      },
      // Имя репозитория без слэша — из того же ответа GitHub, но подпись обязана
      // остаться читаемой: иначе в списке появляется пустое место вместо проекта.
      { type: "CreateEvent", repo: { name: "solo" }, payload: { ref_type: "branch", ref: "gh-pages" } },
      { type: "DeleteEvent", repo: { name: "ssrjkk/qa-arsenal" }, payload: { ref_type: "branch", ref: "tmp" } },
      {
        type: "PullRequestEvent",
        repo: { name: "ssrjkk/mobius" },
        payload: { action: "opened", pull_request: { title: "правится <b>это</b>" } }
      },
      pushEvent("wake", "main", "ff00", "ee11")
    ]
  });
  await sendWebhook(makeEnv(), makeCtx(), messageUpdate("/news", { chatId: 400 }));

  const text = lastText(calls);
  assert.deepEqual(
    text.split("\n").filter((line) => line.startsWith("•")),
    [
      "• <b>solo</b> — создан branch gh-pages",
      "• <b>qa-arsenal</b> — удалён branch tmp",
      "• <b>mobius</b> — pull request opened: правится &lt;b&gt;это&lt;/b&gt;",
      "• <b>wake</b> — push в main"
    ],
    text
  );
  for (const dropped of ["raven", "harvest", "volley", "corvid", "drafter", "verso", "tt-bot", "qualix"]) {
    assert.ok(!text.includes(dropped), `событие без подписи не должно попадать в ленту: ${dropped}`);
  }
});

test("a GitHub answer without a star count leaves the catalogue number in place", async () => {
  const instance = cleanWorkerCache();
  // 200 без stargazers_count — это не «ноль звёзд», а обрывок ответа: брать из него
  // нечего, и иначе raven с тремя звёздами в данных падает до 0★.
  const calls = installFetch({ stars: { raven: null }, starsDefault: 0 });
  await webhookOn(instance, makeEnv(), makeCtx(), messageUpdate("/top", { chatId: 401 }));

  assert.deepEqual(starCounts(lastText(calls)), [3, 0, 0]);
});

test("an update with no author is answered but never counted", async () => {
  const calls = installFetch();
  const env = makeEnv();
  const update = messageUpdate("/start", { chatId: 402 });
  delete update.message.from;
  const response = await sendWebhook(env, makeCtx(), update);

  assert.equal(response.status, 200);
  assert.match(lastText(calls), /Привет!/, "без автора отвечать всё равно надо");
  assert.equal(env.inserts.length, 0, "трекать некого");
});

test("a message of only spaces is treated as an unknown command", async () => {
  const calls = installFetch();
  await sendWebhook(makeEnv(), makeCtx(), messageUpdate("   ", { chatId: 403 }));

  assert.equal(lastText(calls), LANG.ru.unknown + LANG.ru.help);
});

test("a callback with neither author nor payload changes nothing", async () => {
  const calls = installFetch();
  const env = makeEnv();
  const update = callbackUpdate("noop", { chatId: 404 });
  delete update.callback_query.data;
  delete update.callback_query.from;
  const response = await sendWebhook(env, makeCtx(), update);

  assert.equal(response.status, 200, "Telegram не должен повторять такой апдейт");
  assert.equal(calls.length, 0, "редактировать и отвечать не на что");
  assert.equal(env.inserts.length, 0);
});

test("an invite for a project the catalogue does not know still names it", async () => {
  const calls = installFetch();
  await sendWebhook(makeEnv(), makeCtx(), callbackUpdate("ref:ghost", { chatId: 405 }));

  const buttons = callsOf(calls, "sendMessage").at(-1).body.reply_markup.inline_keyboard.flat();
  const share = buttons.find((button) => String(button.url).startsWith("https://t.me/share/url"));
  assert.ok(share, "кнопка «Поделиться» обязана остаться");
  assert.ok(decodeURIComponent(share.url).includes("ghost"), share.url);
});

test("switching language answers in the language the reader just chose", async () => {
  cleanWorkerCache();
  const calls = installFetch();
  const env = makeEnv();

  await sendWebhook(env, makeCtx(), callbackUpdate("lang:ru", { chatId: 406 }));
  assert.equal(callsOf(calls, "editMessageText").at(-1).body.text, LANG.ru.langSet);

  await sendWebhook(env, makeCtx(), callbackUpdate("lang:не-язык", { chatId: 406 }));
  assert.equal(callsOf(calls, "editMessageText").at(-1).body.text, LANG.ru.langSet);

  await sendWebhook(env, makeCtx(), callbackUpdate("lang:en", { chatId: 406 }));
  assert.equal(callsOf(calls, "editMessageText").at(-1).body.text, LANG.en.langSet);

  await sendWebhook(env, makeCtx(), callbackUpdate("lang:ru", { chatId: 406 }));
  assert.equal(callsOf(calls, "editMessageText").at(-1).body.text, LANG.ru.langSet);
  assert.equal(await env.BOT_KV.get("lang:406"), "ru");
});

test("inline results answer in the language of the one who typed the query", async () => {
  cleanWorkerCache();
  const env = makeEnv();

  for (const [languageCode, pack] of [["en", LANG.en], ["ru", LANG.ru]]) {
    const calls = installFetch();
    await sendWebhook(env, makeCtx(), inlineUpdate({ from: { id: 300, language_code: languageCode }, query: "raven" }));
    const result = callsOf(calls, "answerInlineQuery").at(-1).body.results.find((item) => item.id === "raven");
    assert.ok(result, `raven должен найтись в inline для ${languageCode}`);
    assert.ok(result.caption.includes(pack.siteLabel), result.caption);
    assert.ok(!result.caption.includes(languageCode === "en" ? LANG.ru.siteLabel : LANG.en.siteLabel));
  }
});

test("a chosen inline result with no author is acknowledged and not counted", async () => {
  const calls = installFetch();
  const env = makeEnv();
  const response = await sendWebhook(env, makeCtx(), {
    update_id: 8,
    chosen_inline_result: { result_id: "raven", from: undefined }
  });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 0);
  assert.equal(env.inserts.length, 0);
});

test("/setup without a webhook secret registers a plain url", async () => {
  const calls = installFetch();
  const response = await worker.fetch(
    new Request(`${BASE}/setup?key=setup-key`),
    makeEnv({ WEBHOOK_SECRET: undefined }),
    makeCtx()
  );

  assert.equal(response.status, 200);
  assert.equal("secret_token" in callsOf(calls, "setWebhook").at(-1).body, false);
});

test("/feedback does not thank the reader when the owner chat refused the note", async () => {
  // 400 с пустым телом — это ответ Telegram, а не сбой транспорта: его не повторяют.
  const calls = installFetch({
    telegram: ({ method, body }) =>
      method === "sendMessage" && String(body.chat_id) === "42" ? new Response("", { status: 400 }) : null
  });
  const env = makeEnv();
  await sendWebhook(env, makeCtx(), messageUpdate("/feedback держите скрин", { chatId: 407 }));

  assert.equal(lastText(calls), LANG.ru.feedbackFailed);
  assert.ok(callsOf(calls, "sendMessage").some((call) => String(call.body.chat_id) === "42"));
  assert.equal(trackedInserts(env, "feedback").length, 0, "не доставлено — нечего и считать");
});

test("a D1 answer without rows leaves stats and broadcast on zero", async () => {
  const calls = installFetch();
  const env = makeEnv({ BOT_DB: dbEmpty() });
  await sendWebhook(env, makeCtx(), messageUpdate("/stats", { chatId: 42 }));

  const stats = lastText(calls);
  for (const label of ["Пользователей", "Сообщений", "Сегодня", "Команд", "Открытий карточек", "Выборов из inline", "Отзывов"]) {
    assert.ok(stats.includes(`${label}: <b>0</b>`), `${label}: ${stats}`);
  }
  assert.equal(stats.split(LANG.ru.statsEmpty).length - 1, 6, "каждый пустой список говорит об этом сам");
  assert.match(stats, /▁ 0/, "неделя без событий — это семь нулей, а не пустота");

  await sendWebhook(env, makeCtx(), messageUpdate("/broadcast всем привет", { chatId: 42 }));
  assert.equal(lastText(calls), LANG.ru.broadcastEmpty);
});

test("a project without a title is still named, shared and keyed", () => {
  // Имя без title — это не про каталог (проверка данных требует title у каждого
  // проекта), а про то, что карточка, шеринг и клавиатура подписаны одинаково.
  const bare = { name: "ghost-project", lang: "Python", desc: "d", desc_en: "d" };
  assert.equal(displayName(bare), "ghost-project");
  assert.equal(displayName({ ...bare, title: "Ghost" }), "Ghost");
  assert.ok(projectCard(bare, {}, "ru").startsWith("<b>ghost-project</b>"));
  assert.match(
    projectCard({ ...bare, stars: 0, private: true }, { "ghost-project": { stars: 0 } }, "ru"),
    /исходники закрыты/
  );
  assert.ok(shareProjectUrl("ru", bare).includes("start%3Dp_ghost-project"), shareProjectUrl("ru", bare));
  assert.deepEqual(
    projectDetailKeyboard("ru", bare).flat().map((button) => button.callback_data ?? "url"),
    ["url", "page:0", "show:menu"],
    "без site, repo и бота остаётся только шеринг и возвращальные кнопки"
  );
});
