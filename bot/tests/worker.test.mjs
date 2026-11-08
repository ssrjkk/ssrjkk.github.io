import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import worker, { projectCard, projectDetailKeyboard } from "../cloudflare-worker/worker.js";

const BASE = "https://bot.example";
const SECRET = "hook-secret";

function checkBundleData(mutate = () => {}) {
  const root = mkdtempSync(join(tmpdir(), "port-bundle-"));
  try {
    for (const folder of ["scripts", "src", "cloudflare-worker"]) mkdirSync(join(root, folder));
    for (const file of ["scripts/check-bundle.mjs", "src/worker.js", "cloudflare-worker/worker.js", "cloudflare-worker/wrangler.toml"]) {
      copyFileSync(new URL(`../${file}`, import.meta.url), join(root, file));
    }
    const data = JSON.parse(readFileSync(new URL("../projects.json", import.meta.url), "utf8"));
    mutate(data);
    writeFileSync(join(root, "projects.json"), JSON.stringify(data));
    return spawnSync(process.execPath, [join(root, "scripts/check-bundle.mjs")], { encoding: "utf8" });
  } finally {
    rmSync(root, { recursive: true, force: true });
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
  return {
    BOT_TOKEN: "test-token",
    OWNER_ID: "42",
    SETUP_KEY: "setup-key",
    WEBHOOK_SECRET: SECRET,
    BOT_KV: {
      async get(key) {
        return kv.has(key) ? kv.get(key) : null;
      },
      async put(key, value) {
        kv.set(key, value);
      }
    },
    BOT_DB: {
      prepare() {
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
    },
    ...overrides
  };
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

function installFetch({ photoFails = false } = {}) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith("https://api.github.com/")) {
      return jsonResponse({ stargazers_count: 7 });
    }
    if (url.startsWith("https://api.telegram.org/")) {
      const method = url.split("/").pop();
      const body = init.body ? JSON.parse(init.body) : {};
      calls.push({ method, body });
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

test("bundle validation accepts the current catalogue", () => {
  const result = checkBundleData();
  assert.equal(result.status, 0, result.stderr);
});

for (const [name, mutate] of [
  ["impostor repository host", (data) => { data.projects[0].repo = "https://example.test/ssrjkk/shopwatch"; }],
  ["lookalike Telegram host", (data) => { data.projects[0].bot = "https://not.t.me/wwwatchshop_bot"; }],
  ["insecure documentation URL", (data) => { data.projects.find((p) => p.name === "agent-skills").links[0].url = "http://example.test/registry"; }]
]) {
  test(`bundle validation rejects ${name}`, () => {
    const result = checkBundleData(mutate);
    assert.equal(result.status, 1, result.stdout);
  });
}

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
  assert.equal(body.sites, 11);
  assert.equal(body.bots, 5);
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
  assert.match(text, /Сайтов: 11/);
  assert.match(text, /Ботов: 5/);

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
  assert.equal(urls.length, 11);
  assert.ok(new Set(urls).has("https://ssrjkk.github.io/shopwatch/"));
  assert.ok(new Set(urls).has("https://tippy-egi.pages.dev"));
  assert.ok(new Set(urls).has("https://wake-7k6.pages.dev"));
});

test("/bots lists every Telegram bot as a URL button", async () => {
  const calls = installFetch();
  await sendWebhook(makeEnv(), makeCtx(), messageUpdate("/bots", { chatId: 104 }));

  const sent = callsOf(calls, "sendMessage").at(-1);
  assert.match(sent.body.text, /Telegram-боты/);
  const urls = keyboardData(sent).filter((value) => value.startsWith("https://"));
  assert.equal(urls.length, 5);
  assert.ok(new Set(urls).has("https://t.me/ssrjkk_bot"));
  assert.ok(new Set(urls).has("https://t.me/wwwatchshop_bot"));
});

test("project detail sends the screenshot with site, repo and bot buttons", async () => {
  const calls = installFetch();
  await sendWebhook(makeEnv(), makeCtx(), callbackUpdate("p:shopwatch", { chatId: 105 }));

  const photos = callsOf(calls, "sendPhoto");
  assert.equal(photos.length, 1);
  assert.match(photos[0].body.photo, /raw\.githubusercontent\.com\/ssrjkk\/ssrjkk\/main\/assets\/shots\/shopwatch\.jpg/);
  assert.match(photos[0].body.caption, /OneWatch/);

  const buttons = photos[0].body.reply_markup.inline_keyboard.flat();
  const urls = buttons.map((button) => button.url).filter(Boolean);
  assert.ok(new Set(urls).has("https://ssrjkk.github.io/shopwatch/"));
  assert.ok(new Set(urls).has("https://github.com/ssrjkk/shopwatch"));
  assert.ok(new Set(urls).has("https://t.me/wwwatchshop_bot"));
});

test("project detail falls back to a text message when the photo fails", async () => {
  const calls = installFetch({ photoFails: true });
  await sendWebhook(makeEnv(), makeCtx(), callbackUpdate("p:raven", { chatId: 106 }));

  const text = lastText(calls);
  assert.match(text, /Raven/);
  assert.match(text, /Скриншот/);
  assert.match(text, /assets\/shots\/raven\.jpg/);
});

test("project detail without a screenshot sends a text card", async () => {
  const calls = installFetch();
  await sendWebhook(makeEnv(), makeCtx(), callbackUpdate("p:qualix", { chatId: 107 }));

  assert.equal(callsOf(calls, "sendPhoto").length, 0);
  assert.match(lastText(calls), /Qualix/);
});

test("a project marked private hides the repository link", () => {
  const hidden = {
    name: "port",
    title: "Port",
    lang: "JavaScript",
    desc: "Каталог проектов в Telegram.",
    desc_en: "A Telegram project catalogue.",
    repo: "https://github.com/ssrjkk/port",
    bot: "https://t.me/ssrjkk_bot",
    private: true,
  };

  const card = projectCard(hidden, {}, "ru");
  assert.match(card, /исходники закрыты/);
  assert.doesNotMatch(card, /github\.com\/ssrjkk\/port/);
  assert.match(projectCard(hidden, {}, "en"), /source private/);

  const urls = projectDetailKeyboard("ru", hidden)
    .flat()
    .map((button) => button.url)
    .filter(Boolean);
  assert.equal(new Set(urls).has("https://github.com/ssrjkk/port"), false);
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
  assert.match(callsOf(calls, "editMessageText").at(-1).body.text, /Language: 🇬🇧 English/);

  await sendWebhook(env, makeCtx(), messageUpdate("/start", { chatId: 112 }));
  assert.match(lastText(calls), /Hi! I'm ssrjkk bot/);
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
  assert.equal(photos.length, 11);
  assert.equal(articles.length, 9);
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

  const commands = callsOf(calls, "setMyCommands").at(-1);
  const names = commands.body.commands.map((command) => command.command);
  assert.deepEqual(names, [
    "start",
    "projects",
    "sites",
    "bots",
    "search",
    "top",
    "links",
    "channels",
    "about",
    "stats",
    "myid",
    "help"
  ]);
});
