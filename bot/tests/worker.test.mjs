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
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import worker, {
  LANG,
  COMMANDS,
  LANG_CACHE_LIMIT,
  projectCard,
  projectDetailKeyboard,
  shareProjectUrl
} from "../cloudflare-worker/worker.js";

const BASE = "https://bot.example";
const SECRET = "hook-secret";

function checkBundleData(mutate = () => {}, editReadme = (text) => text, editHub = (text) => text) {
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

function installFetch({ photoFails = false, events = [], eventsStatus = 200, telegram = null } = {}) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith("https://api.github.com/")) {
      // Запросы к GitHub пишутся в тот же журнал: `/news` должен подтверждать,
      // что свежий кеш в KV экономит бюджет (60 запросов в час на IP).
      calls.push({ method: "github", body: { url } });
      if (url.includes("/events/public")) return jsonResponse(events, eventsStatus);
      return jsonResponse({ stargazers_count: 7 });
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
    assert.equal(result.status, 1, result.stdout);
  });
}

for (const [name, mutate] of [
  ["impostor repository host", (data) => { const p = data.projects[0]; p.repo = `https://example.test/ssrjkk/${p.name}`; }],
  ["lookalike Telegram host", (data) => { data.projects[0].bot = "https://not.t.me/ssrjkk_bot"; }],
  ["insecure documentation URL", (data) => { data.projects.find((p) => p.name === "agent-skills").links[0].url = "http://example.test/registry"; }]
]) {
  test(`bundle validation rejects ${name}`, () => {
    const result = checkBundleData(mutate);
    assert.equal(result.status, 1, result.stdout);
  });
}

for (const [name, editHub] of [
  ["a hub card opening a project the catalogue has not", (text) => text.replace("?start=p_raven", "?start=p_raven-v2")],
  ["a hub card opening another bot", (text) => text.replace("t.me/ssrjkk_bot?start=p_raven", "t.me/other_bot?start=p_raven")],
  ["a hub without a single link into the bot", (text) => text.replace(/\r?\n\s*<a class="card-link" href="https:\/\/t\.me\/ssrjkk_bot\?start=p_[^\n]*\n/g, "\n")]
]) {
  test(`bundle validation rejects ${name}`, () => {
    const result = checkBundleData(() => {}, (text) => text, editHub);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /index\.html|deep-/);
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
  assert.match(callsOf(calls, "editMessageText").at(-1).body.text, /Language: 🇬🇧 English/);
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

