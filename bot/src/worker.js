import data from "../projects.json";

const GITHUB_USERNAME = data.github;
const BOT_URL = data.bot;
const PROJECTS = data.projects;
const CHANNELS = data.channels;
const LINKS = data.links;

const API = "https://api.telegram.org";
const GH_API = "https://api.github.com/repos";
const GH_USERS_API = "https://api.github.com/users";
const STARS_TTL = 3600;
const NEWS_TTL = 900;
const NEWS_STALE_TTL = 86400;
const STACK_FACETS = 6;
const PAGE_SIZE = 3;

// Повторяем только то, что Telegram заведомо не исполнил: 429 (лимит сообщений) и
// 502/503/504 (его фронтворк не дошёл до приложения). 500 и сетевые сбои не трогаем —
// под ними сообщение могло уйти, а повтор означает дубликат в чате.
const API_RETRY_STATUS = new Set([429, 502, 503, 504]);
const API_RETRY_ATTEMPTS = 3;
// Потолок намеренно небольшой: вебхук ждёт ответа бота, висящая пауза дороже
// потерянного сообщения.
const API_RETRY_BUDGET = 3000;
const API_RETRY_FALLBACK = 400;

// Экспортируется только для тестов: пакеты ru/en должны покрывать друг друга.
export const LANG = {
  ru: {
    menu: "Главное меню:",
    projectsTitle: "<b>Мои проекты:</b>",
    linksTitle: "Все ссылки:",
    channelsTitle: "Telegram-каналы:",
    sitesTitle: "<b>Сайты проектов:</b>",
    botsTitle: "<b>Telegram-боты:</b>",
    help: "/start - запуск\n/projects - проекты GitHub\n/news - обновления с GitHub\n/sites - сайты проектов\n/bots - Telegram-боты\n/search <запрос> - поиск проектов\n/top - топ по звёздам\n/links - ссылки\n/channels - каналы\n/about - обо мне\n/feedback <текст> - написать владельцу\n/stats - статистика (владелец)\n/myid - мой ID\n/help - справка",
    unknown: "Не знаю такой команды.\n\n",
    page: (cur, total) => `Стр. ${cur}/${total}`,
    prev: "←",
    next: "→",
    projects: "Проекты",
    top: "Топ",
    links: "Ссылки",
    channels: "Каналы",
    sites: "Сайты",
    bots: "Боты",
    helpBtn: "Помощь",
    lang: "Язык",
    aboutBtn: "Обо мне",
    langMenu: "Выбери язык:",
    langSet: "Язык: Русский",
    back: "Назад",
    toMenu: "В меню",
    toProjects: "К проектам",
    siteLabel: "Сайт",
    botLabel: "Бот",
    shotLabel: "Скриншот",
    privateLabel: "исходники закрыты",
    invite: "Пригласить",
    share: "Поделиться",
    shareText: (title) => `Мои проекты у ${GITHUB_USERNAME}: ${title}`,
    shareProject: "Поделиться проектом",
    shareProjectText: (title, description) => `${title} — ${description}`,
    newsBtn: "Обновления",
    newsTitle: "<b>Что произошло на GitHub:</b>",
    newsEmpty: "Свежих событий нет: публичный API GitHub не ответил или репозитории молчат.",
    newsPush: (branch) => `push в ${branch}`,
    newsRelease: (tag) => `релиз ${tag}`,
    newsCreate: (type, ref) => `создан ${type} ${ref}`,
    newsDelete: (type, ref) => `удалён ${type} ${ref}`,
    newsPull: (action, title) => `pull request ${action}: ${title}`,
    feedbackNote: (note, id) => `<b>Обратная связь</b>\n\n${note}\n\nот <code>${id}</code>`,
    stackTitle: (token) => `<b>Мои проекты — ${token}:</b>`,
    stackAll: "Все стеки",
    stackEmpty: (token) => `Проектов со стеком «${token}» в каталоге нет.`,
    feedbackPrompt: "Формат: /feedback <текст>",
    feedbackDone: "Сообщение передано владельцу. Спасибо!",
    feedbackFailed: "Не удалось передать сообщение, попробуй позже.",
    inviteLink: (url) =>
      `Твоя ссылка: <code>${url}</code>\n\nПервый <code>/start</code> по ней попадёт в раздел «Рефералы» в /stats.`,
    notFound: "Проект не найден.",
    notOwner: "Команда доступна только владельцу.",
    notConfigured: "Владелец не настроен (OWNER_ID).",
    statsEmpty: "Пока нет данных.",
    stats: (s) => `<b>Статистика</b>

Пользователей: <b>${s.users}</b>
Сообщений: <b>${s.msgs}</b>
Сегодня: <b>${s.today}</b>
Команд: <b>${s.cmds}</b>
Открытий карточек: <b>${s.opens}</b>
Выборов из inline: <b>${s.inlinePicks}</b>
Отзывов: <b>${s.feedback}</b>

7 дней: ${s.week}

По командам:
${s.cmdList}

По разделам меню:
${s.navList}

Какие проекты открывали:
${s.topProjects}

Поиск:
${s.searchList}

Топ пользователей:
${s.topUsers}

Рефералы:
${s.refList}`,
    searchPrompt: "Формат: /search <запрос>\nНапример: /search python",
    searchEmpty: (q) => `По запросу «${q}» ничего не найдено.`,
    searchTitle: (q) => `<b>Результаты по запросу «${q}»:</b>`,
    topTitle: "<b>Топ проектов по звёздам:</b>",
    about: (projects) => `<b>Обо мне</b>\n\nРазрабатываю ботов, AI-инструменты, Web3 и QA-платформы.\nВсе проекты — открытый код на GitHub.\n\nСтек: Python, TypeScript, Go, Rust, C++, Solidity\nПроектов: ${projects} — сайты, боты и инженерные инструменты\nКанал: @b2wmain\n\nКнопки ниже — мои ссылки.`,
    broadcastPrompt: "Формат: /broadcast <текст>",
    broadcastDone: (ok, fail) => `Отправлено: <b>${ok}</b>, не доставлено: <b>${fail}</b>.`,
    broadcastEmpty: "В рассылке нет ни одного пользователя."
  },
  en: {
    menu: "Main menu:",
    projectsTitle: "<b>My projects:</b>",
    linksTitle: "All links:",
    channelsTitle: "Telegram channels:",
    sitesTitle: "<b>Project sites:</b>",
    botsTitle: "<b>Telegram bots:</b>",
    help: "/start - start\n/projects - GitHub projects\n/news - what happened on GitHub\n/sites - project sites\n/bots - Telegram bots\n/search <query> - search projects\n/top - top by stars\n/links - links\n/channels - channels\n/about - about me\n/feedback <text> - write to the owner\n/stats - stats (owner)\n/myid - my ID\n/help - help",
    unknown: "Unknown command.\n\n",
    page: (cur, total) => `Page ${cur}/${total}`,
    prev: "←",
    next: "→",
    projects: "Projects",
    top: "Top",
    links: "Links",
    channels: "Channels",
    sites: "Sites",
    bots: "Bots",
    helpBtn: "Help",
    lang: "Language",
    aboutBtn: "About me",
    langMenu: "Choose language:",
    langSet: "Language: English",
    back: "Back",
    toMenu: "Menu",
    toProjects: "Projects",
    siteLabel: "Site",
    botLabel: "Bot",
    shotLabel: "Screenshot",
    privateLabel: "source private",
    invite: "Invite",
    share: "Share",
    shareText: (title) => `${GITHUB_USERNAME}'s projects: ${title}`,
    shareProject: "Share this project",
    shareProjectText: (title, description) => `${title} — ${description}`,
    newsBtn: "Updates",
    newsTitle: "<b>What happened on GitHub:</b>",
    newsEmpty: "No fresh events: the public GitHub API did not answer or the repositories are quiet.",
    newsPush: (branch) => `pushed to ${branch}`,
    newsRelease: (tag) => `release ${tag}`,
    newsCreate: (type, ref) => `created ${type} ${ref}`,
    newsDelete: (type, ref) => `deleted ${type} ${ref}`,
    newsPull: (action, title) => `pull request ${action}: ${title}`,
    feedbackNote: (note, id) => `<b>Feedback</b>\n\n${note}\n\nfrom <code>${id}</code>`,
    stackTitle: (token) => `<b>My projects — ${token}:</b>`,
    stackAll: "All stacks",
    stackEmpty: (token) => `No catalogue project uses «${token}».`,
    feedbackPrompt: "Format: /feedback <text>",
    feedbackDone: "Message passed to the owner. Thanks!",
    feedbackFailed: "Could not deliver the message, try again later.",
    inviteLink: (url) =>
      `Your link: <code>${url}</code>\n\nThe first <code>/start</code> through it appears under Referrals in /stats.`,
    notFound: "Project not found.",
    notOwner: "Only the owner can use this command.",
    notConfigured: "Owner is not configured (OWNER_ID).",
    statsEmpty: "No data yet.",
    stats: (s) => `<b>Statistics</b>

Users: <b>${s.users}</b>
Messages: <b>${s.msgs}</b>
Today: <b>${s.today}</b>
Commands: <b>${s.cmds}</b>
Cards opened: <b>${s.opens}</b>
Inline picks: <b>${s.inlinePicks}</b>
Feedback: <b>${s.feedback}</b>

7 days: ${s.week}

By command:
${s.cmdList}

By menu section:
${s.navList}

Projects opened:
${s.topProjects}

Search:
${s.searchList}

Top users:
${s.topUsers}

Referrals:
${s.refList}`,
    searchPrompt: "Format: /search <query>\nExample: /search python",
    searchEmpty: (q) => `Nothing found for «${q}».`,
    searchTitle: (q) => `<b>Results for «${q}»:</b>`,
    topTitle: "<b>Top projects by stars:</b>",
    about: (projects) => `<b>About me</b>\n\nI build bots, AI tools, Web3 and QA platforms.\nAll projects are open source on GitHub.\n\nStack: Python, TypeScript, Go, Rust, C++, Solidity\nProjects: ${projects} — sites, bots and engineering tools\nChannel: @b2wmain\n\nButtons below are my links.`,
    broadcastPrompt: "Format: /broadcast <text>",
    broadcastDone: (ok, fail) => `Sent: <b>${ok}</b>, failed: <b>${fail}</b>.`,
    broadcastEmpty: "No users to broadcast to."
  }
};

// Подсказки в меню команд Telegram задаются отдельно на каждый язык:
// language_code в setMyCommands покрывает всех пользователей сразу.
export const COMMANDS = {
  ru: [
    { command: "start", description: "Запуск" },
    { command: "projects", description: "Проекты GitHub" },
    { command: "news", description: "Обновления с GitHub" },
    { command: "sites", description: "Сайты проектов" },
    { command: "bots", description: "Telegram-боты" },
    { command: "search", description: "Поиск проектов" },
    { command: "top", description: "Топ по звёздам" },
    { command: "links", description: "Все ссылки" },
    { command: "channels", description: "Telegram-каналы" },
    { command: "about", description: "Обо мне" },
    { command: "feedback", description: "Написать владельцу" },
    { command: "stats", description: "Статистика (владелец)" },
    { command: "myid", description: "Мой ID" },
    { command: "help", description: "Справка" }
  ],
  en: [
    { command: "start", description: "Start" },
    { command: "projects", description: "GitHub projects" },
    { command: "news", description: "GitHub updates" },
    { command: "sites", description: "Project sites" },
    { command: "bots", description: "Telegram bots" },
    { command: "search", description: "Search projects" },
    { command: "top", description: "Top by stars" },
    { command: "links", description: "All links" },
    { command: "channels", description: "Telegram channels" },
    { command: "about", description: "About me" },
    { command: "feedback", description: "Write to the owner" },
    { command: "stats", description: "Statistics (owner)" },
    { command: "myid", description: "My ID" },
    { command: "help", description: "Help" }
  ]
};

// Язык читается на каждое сообщение и кеш живёт в модуле воркера, поэтому у кеша есть
// потолок: иначе в одной изоляции осела бы запись на каждого когда-либо написавшего.
const langCache = new Map();
export const LANG_CACHE_LIMIT = 2000;
let starsCache = null;
let starsFetchedAt = 0;

// Только для тестов: оба кеша живут в памяти модуля, и без сброса проверки, которым
// важно начало TTL, зависели бы от порядка запуска, а не от кода.
export function resetCaches() {
  langCache.clear();
  starsCache = null;
  starsFetchedAt = 0;
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 429 приходит с parameters.retry_after в теле, 503 — с заголовком Retry-After.
// Без подсказки растём от попытки к попытке, чтобы не долбить лимит впритык.
function retryAfterMs(res, body, attempt) {
  const seconds = Number(body?.parameters?.retry_after ?? res.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : API_RETRY_FALLBACK * attempt;
}

async function callApi(token, method, payload) {
  let budget = API_RETRY_BUDGET;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });
    // У 502/503 тело пустое, а решение о повторе зависит именно от статуса.
    const body = await res.json().catch(() => null);
    const retriable = API_RETRY_STATUS.has(res.status) && budget > 0;
    if (retriable && attempt < API_RETRY_ATTEMPTS) {
      const wait = Math.min(retryAfterMs(res, body, attempt), budget);
      budget -= wait;
      console.error(`Telegram API ${method}: HTTP ${res.status}, повтор через ${wait}мс (${attempt})`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }
    if (!res.ok) {
      console.error(`Telegram API ${method}: HTTP ${res.status}${body ? ` ${JSON.stringify(body)}` : ""}`);
      return null;
    }
    if (!body?.ok) {
      console.error(`Telegram API ${method}: ${JSON.stringify(body)}`);
      return null;
    }
    return body.result;
  }
}

async function sendMessage(token, chatId, text, keyboard) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true }
  };
  if (keyboard) payload.reply_markup = { inline_keyboard: keyboard };
  return callApi(token, "sendMessage", payload);
}

async function sendPhoto(token, chatId, photo, caption, keyboard) {
  const payload = { chat_id: chatId, photo, caption, parse_mode: "HTML" };
  if (keyboard) payload.reply_markup = { inline_keyboard: keyboard };
  return callApi(token, "sendPhoto", payload);
}

async function editMessage(token, chatId, messageId, text, keyboard) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true }
  };
  if (keyboard) payload.reply_markup = { inline_keyboard: keyboard };
  return callApi(token, "editMessageText", payload);
}

async function getLang(env, chatId) {
  if (langCache.has(chatId)) return langCache.get(chatId);
  let lang = "ru";
  try {
    const value = await env.BOT_KV.get(`lang:${chatId}`);
    if (value === "en") lang = "en";
  } catch (error) {
    console.error("getLang error:", error);
  }
  langCacheSet(chatId, lang);
  return lang;
}

// Публичный GitHub отвечает 403, когда бюджет (60 запросов в час) на IP исчерпан, а
// на события — 202, пока лента генерируется (тело при этом пустое). Ни то, ни другое
// нельзя отличить от «репозитории молчат», поэтому это ошибка, а не пустой ответ.
async function fetchGithub(url, label) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ssrjkk-bot", Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(8000)
    });
    if (res.status === 202 || !res.ok) {
      console.error(`GitHub ${label}: HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (error) {
    console.error(`GitHub ${label}:`, error);
    return null;
  }
}

async function kvJson(env, key) {
  try {
    const raw = await env.BOT_KV.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error(`KV ${key}:`, error);
    return null;
  }
}

async function getStars(env, ctx) {
  const now = Date.now();
  if (starsCache && now - starsFetchedAt < STARS_TTL * 1000) return starsCache;

  const cached = await kvJson(env, "stars");
  if (cached && now - cached.ts < STARS_TTL * 1000) {
    starsCache = cached.data;
    starsFetchedAt = cached.ts;
    return starsCache;
  }

  const result = {};
  await Promise.allSettled(
    PROJECTS.filter((project) => !project.private).map(async (project) => {
      const body = await fetchGithub(`${GH_API}/${GITHUB_USERNAME}/${project.name}`, project.name);
      // Только число засчитываем: ответ без stargazers_count (редкий 200 от прокси или
      // изменённый API) иначе обнулил бы звёзды, которые уже лежат в каталоге.
      if (body && typeof body.stargazers_count === "number") {
        result[project.name] = { stars: body.stargazers_count };
      }
    })
  );

  starsCache = result;
  starsFetchedAt = now;
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(
      env.BOT_KV.put("stars", JSON.stringify({ ts: now, data: result }), {
        expirationTtl: STARS_TTL
      }).catch((error) => console.error("stars KV put:", error))
    );
  }
  return result;
}

// Публичные события профиля тратят тот же бюджет GitHub (60 запросов в час на IP),
// что и звёзды, поэтому живут в KV: свежие 15 минут, потом ещё сутки как отставшая копия.
async function getNews(env, ctx) {
  const now = Date.now();

  // Кеш только в KV: в памяти воркера он пережил бы смену изоляции и рассинхронизировался
  // с TTL, а тесты на «свежий KV → нет запроса» и «пустой KV → запрос» стали бы порядкозависимыми.
  // Запись могла остаться от другой версии воркера: без проверки на массив одна
  // такая строка ломала бы /news до истечения TTL.
  const cached = await kvJson(env, "news");
  const stored = cached && Array.isArray(cached.data) ? cached.data : null;
  if (stored && now - cached.ts < NEWS_TTL * 1000) return stored;

  const body = await fetchGithub(`${GH_USERS_API}/${GITHUB_USERNAME}/events/public?per_page=30`, "events");
  const seen = new Set();
  const result = (Array.isArray(body) ? body : [])
    .map(describeEvent)
    .filter(Boolean)
    // Ветка, которую гонит автостатус, даёт десяток одинаковых push-строк:
    // каждую уникальную пару «репозиторий — что случилось» показываем один раз.
    .filter((item) => {
      const key = `${item.repo}|${item.what.join("|")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);

  // GitHub может ответить 403 на исчерпанном лимите: пустой ответ не должен стирать
  // то, что уже показали пользователям сутки назад.
  if (!result.length && stored) return stored;

  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(
      env.BOT_KV
        .put("news", JSON.stringify({ ts: now, data: result }), { expirationTtl: NEWS_STALE_TTL })
        .catch((error) => console.error("news KV put:", error))
    );
  }
  return result;
}

// Дескриптор события хранится без привязки к языку: одна запись в KV даёт подписи и для ru, и для en.
// Неаутентифицированный events/public отдаёт в PushEvent только ref/head/before — ни списка коммитов,
// ни размера, поэтому подпись строится по ветке, а пустой push (head == before) не показывается.
function describeEvent(event) {
  const repo = event.repo && event.repo.name;
  if (!repo) return null;
  const payload = event.payload || {};
  const base = { repo: repo.split("/")[1] || repo, url: `https://github.com/${repo}` };

  if (event.type === "PushEvent") {
    const branch = (payload.ref || "").split("/").pop();
    if (!branch || payload.head === payload.before) return null;
    return { ...base, what: ["push", branch] };
  }
  if (event.type === "ReleaseEvent") {
    const tag = (payload.release || {}).tag_name;
    return tag ? { ...base, what: ["release", tag] } : null;
  }
  // Правило одно для всех типов: нечем подписать — нет строки. Иначе читатель
  // получает «создан branch » с пустым местом вместо имени ветки или «pull request
  // opened: » без заголовка. ref_type и заголовок GitHub кладёт всегда, поэтому
  // отсутствие любого из них — это обрывок ответа, а не событие.
  if (event.type === "CreateEvent") {
    return payload.ref && payload.ref_type
      ? { ...base, what: ["create", payload.ref_type, payload.ref] }
      : null;
  }
  if (event.type === "DeleteEvent") {
    return payload.ref && payload.ref_type
      ? { ...base, what: ["delete", payload.ref_type, payload.ref] }
      : null;
  }
  if (event.type === "PullRequestEvent") {
    const title = (payload.pull_request || {}).title;
    return payload.action && title
      ? { ...base, what: ["pull", payload.action, title] }
      : null;
  }
  return null;
}

function newsLine(item, lang) {
  const [kind, first, second] = item.what;
  const what =
    kind === "push"
      ? LANG[lang].newsPush(first)
      : kind === "release"
        ? LANG[lang].newsRelease(first)
        : kind === "create"
          ? LANG[lang].newsCreate(first, second)
          : kind === "delete"
            ? LANG[lang].newsDelete(first, second)
            : LANG[lang].newsPull(first, second);
  return `• <b>${esc(item.repo)}</b> — ${esc(what)}`;
}

// Стек проекта — одно поле lang со списком через запятую. Разбором занимается
// только это место: фасеты и фильтр обязаны видеть одинаковые токены.
function stackTokens(project) {
  return String(project.lang || "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

// Фасеты собираются из каталога, а не из списка в коде: новый проект сам
// появляется в фильтре, и в фильтре не остаётся технологии без карточек.
function stackFacets(limit = STACK_FACETS) {
  const counts = new Map();
  for (const project of PROJECTS) {
    for (const name of stackTokens(project)) {
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name]) => name);
}

function langCacheSet(chatId, lang) {
  if (langCache.size >= LANG_CACHE_LIMIT && !langCache.has(chatId)) {
    langCache.delete(langCache.keys().next().value);
  }
  langCache.set(chatId, lang);
}

function matchesStack(project, stack) {
  const needle = stack.toLowerCase();
  return stackTokens(project).some((token) => token.toLowerCase() === needle);
}

function desc(project, lang) {
  return lang === "en" && project.desc_en ? project.desc_en : project.desc;
}

// Как проект подписан в интерфейсе. Проверка данных требует title у каждого проекта,
// но карточка не должна печатать пустое имя, если поле всё-таки потерялось.
export function displayName(project) {
  return project.title || project.name;
}

// Ключа в stars нет, когда GitHub API не ответил (лимит 60 запросов в час на IP идёт без токена).
// Без возврата к project.stars карточка показала бы 0★ у проекта с реальными звёздами в данных.
function starCountFor(project, stars) {
  const live = stars && stars[project.name];
  if (live) return live.stars || 0;
  return project.stars || 0;
}

export function projectCard(project, stars, lang) {
  const star = starCountFor(project, stars);
  const starCount = star > 0 ? ` ${star}★` : "";
  const links = [];
  if (project.site) links.push(`<a href="${project.site}">${LANG[lang].siteLabel}</a>`);
  if (project.repo && !project.private) links.push(`<a href="${project.repo}">GitHub</a>`);
  if (project.bot) links.push(`<a href="${project.bot}">${LANG[lang].botLabel}</a>`);
  for (const link of project.links || []) links.push(`<a href="${esc(link.url)}">${esc(link.name)}</a>`);
  if (project.private) links.push(LANG[lang].privateLabel);
  return `<b>${esc(displayName(project))}</b> [${esc(project.lang)}]${starCount}\n${esc(desc(project, lang))}\n${links.join(" · ")}`;
}

function sortByStars(projects, stars) {
  return [...projects].sort((a, b) => starCountFor(b, stars) - starCountFor(a, stars));
}

const BARS = ["▁", "▂", "▄", "▆", "█"];

// Дни идут подряд, включая пустые: иначе график за 7 дней показывал бы только
// активные сутки и выдавал бы затишье за рост.
function weekBars(rows) {
  const byDay = new Map(rows.map((row) => [row.d, row.c]));
  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    days.push(new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10));
  }
  const counts = days.map((day) => byDay.get(day) || 0);
  const max = Math.max(...counts, 1);
  return days
    .map(
      (day, index) =>
        `${day.slice(8, 10)}.${day.slice(5, 7)} ${BARS[Math.min(BARS.length - 1, Math.floor((counts[index] / max) * BARS.length))]} ${counts[index]}`
    )
    .join(" · ");
}

function titleOf(name) {
  const project = PROJECTS.find((item) => item.name === name);
  return project ? displayName(project) : name;
}

export function shareProjectUrl(lang, project) {
  const link = `${BOT_URL}?start=p_${project.name}`;
  const text = LANG[lang].shareProjectText(displayName(project), desc(project, lang));
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
}

export function projectDetailKeyboard(lang, project, userId = null) {
  const row = [];
  if (project.site) row.push({ text: `${LANG[lang].siteLabel} ↗`, url: project.site });
  if (project.repo && !project.private) row.push({ text: "GitHub", url: project.repo });
  if (project.bot) row.push({ text: `${LANG[lang].botLabel} ↗`, url: project.bot });
  const rows = [];
  if (row.length) rows.push(row);
  if (project.links?.length) rows.push(project.links.map((link) => ({ text: link.name, url: link.url })));
  // Поделиться можно всегда, а реферальная ссылка имеет смысл только от конкретного
  // пользователя — кнопка «Пригласить» появляется, когда извест id автора карточки.
  const shareRow = [{ text: LANG[lang].shareProject, url: shareProjectUrl(lang, project) }];
  if (userId !== null) shareRow.push({ text: LANG[lang].invite, callback_data: `ref:${project.name}` });
  rows.push(shareRow);
  rows.push([
    { text: LANG[lang].toProjects, callback_data: "page:0" },
    { text: LANG[lang].toMenu, callback_data: "show:menu" }
  ]);
  return rows;
}

async function sendProjectDetail(env, ctx, chatId, name, lang, userId = null) {
  const project = PROJECTS.find((item) => item.name === name);
  if (!project) {
    await sendMessage(env.BOT_TOKEN, chatId, LANG[lang].notFound);
    return;
  }
  const stars = await getStars(env, ctx);
  const caption = projectCard(project, stars, lang);
  const keyboard = projectDetailKeyboard(lang, project, userId);

  if (project.shot) {
    const sent = await sendPhoto(env.BOT_TOKEN, chatId, project.shot, caption, keyboard);
    if (sent) return;
  }

  const text = project.shot
    ? `${caption}\n<a href="${project.shot}">${LANG[lang].shotLabel}</a>`
    : caption;
  await sendMessage(env.BOT_TOKEN, chatId, text, keyboard);
}

async function projectsList(env, ctx, lang, page, stack = null) {
  const stars = await getStars(env, ctx);
  const pool = stack ? PROJECTS.filter((project) => matchesStack(project, stack)) : PROJECTS;
  const pages = Math.max(1, Math.ceil(pool.length / PAGE_SIZE));
  const safe = Math.min(Math.max(page, 0), pages - 1);
  const slice = pool.slice(safe * PAGE_SIZE, safe * PAGE_SIZE + PAGE_SIZE);
  const lines = slice.map((project) => projectCard(project, stars, lang));
  const pageData = (index) => (stack ? `stack:${stack}:${index}` : `page:${index}`);

  const rows = slice.map((project) => [
    {
      text: displayName(project),
      callback_data: `p:${project.name}`
    }
  ]);
  const nav = [];
  if (safe > 0) nav.push({ text: LANG[lang].prev, callback_data: pageData(safe - 1) });
  nav.push({ text: LANG[lang].page(safe + 1, pages), callback_data: "noop" });
  if (safe < pages - 1) nav.push({ text: LANG[lang].next, callback_data: pageData(safe + 1) });
  rows.push(nav);

  const facetRow = stackFacets().map((token) => ({
    text: token === stack ? `✓ ${token}` : token,
    callback_data: `stack:${token}:0`
  }));
  if (facetRow.length) rows.push(facetRow);
  if (stack) rows.push([{ text: LANG[lang].stackAll, callback_data: "page:0" }]);
  rows.push([{ text: LANG[lang].back, callback_data: "show:menu" }]);

  return {
    text: `${stack ? LANG[lang].stackTitle(stack) : LANG[lang].projectsTitle}\n\n${
      lines.length ? lines.join("\n\n") : LANG[lang].stackEmpty(stack)
    }`,
    keyboard: rows,
    page: safe,
    pages
  };
}

async function startText(env, ctx, lang) {
  let sum = 0;
  try {
    const stars = await getStars(env, ctx);
    for (const project of PROJECTS) sum += starCountFor(project, stars);
  } catch {}
  const sites = PROJECTS.filter((project) => project.site).length;
  const bots = PROJECTS.filter((project) => project.bot).length;
  if (lang === "ru") {
    return `Привет! Я бот ssrjkk.\n\nПроектов: ${PROJECTS.length} · Сайтов: ${sites} · Ботов: ${bots} · Звёзд: ${sum}★\n\nКоманды и кнопки ниже — проекты, сайты, боты, топ, поиск и ссылки.`;
  }
  return `Hi! I'm ssrjkk bot.\n\nProjects: ${PROJECTS.length} · Sites: ${sites} · Bots: ${bots} · Stars: ${sum}★\n\nUse commands or the buttons below — projects, sites, bots, top, search and links.`;
}

async function topText(env, ctx, lang) {
  const stars = await getStars(env, ctx);
  const lines = sortByStars(PROJECTS, stars)
    .slice(0, 3)
    .map((project, index) => {
      const count = starCountFor(project, stars);
      return `${index + 1}. <b>${esc(displayName(project))}</b> [${esc(project.lang)}] — ${count}★`;
    });
  return `${LANG[lang].topTitle}\n\n${lines.join("\n")}`;
}

function mainMenu(lang) {
  return [
    [
      { text: LANG[lang].projects, callback_data: "page:0" },
      { text: LANG[lang].top, callback_data: "show:top" }
    ],
    [
      { text: LANG[lang].sites, callback_data: "show:sites" },
      { text: LANG[lang].bots, callback_data: "show:bots" }
    ],
    [
      { text: LANG[lang].links, callback_data: "show:links" },
      { text: LANG[lang].channels, callback_data: "show:channels" }
    ],
    [
      { text: LANG[lang].helpBtn, callback_data: "show:help" },
      { text: LANG[lang].lang, callback_data: "show:lang" }
    ],
    [
      { text: LANG[lang].newsBtn, callback_data: "show:news" },
      { text: LANG[lang].aboutBtn, callback_data: "show:about" }
    ]
  ];
}

function urlKeyboard(lang, items) {
  const rows = items.map((item) => [{ text: item.name, url: item.url }]);
  rows.push([{ text: LANG[lang].back, callback_data: "show:menu" }]);
  return rows;
}

function langKeyboard(lang) {
  return [
    [
      { text: "Русский", callback_data: "lang:ru" },
      { text: "English", callback_data: "lang:en" }
    ],
    [{ text: LANG[lang].back, callback_data: "show:menu" }]
  ];
}

function track(env, ctx, userId, kind, value) {
  if (!userId || !ctx || typeof ctx.waitUntil !== "function") return;
  ctx.waitUntil(
    env.BOT_DB.prepare("INSERT INTO events (user_id, kind, value) VALUES (?, ?, ?)")
      .bind(userId, kind, value ?? null)
      .run()
      .catch((error) => console.error("track error:", error))
  );
}

async function sendSites(env, ctx, chatId, lang) {
  const items = PROJECTS.filter((project) => project.site).map((project) => ({
    name: `${displayName(project)} — ${new URL(project.site).host}`,
    url: project.site
  }));
  await sendMessage(env.BOT_TOKEN, chatId, LANG[lang].sitesTitle, urlKeyboard(lang, items));
}

async function sendBots(env, ctx, chatId, lang) {
  const items = PROJECTS.filter((project) => project.bot).map((project) => ({
    name: `${displayName(project)} — @${new URL(project.bot).pathname.slice(1)}`,
    url: project.bot
  }));
  await sendMessage(env.BOT_TOKEN, chatId, LANG[lang].botsTitle, urlKeyboard(lang, items));
}

async function handleMessage(env, ctx, msg) {
  const token = env.BOT_TOKEN;
  const chatId = msg.chat.id;
  const userId = msg.from ? msg.from.id : null;
  const raw = (msg.text || "").trim();
  track(env, ctx, userId, "msg");

  const [head, ...rest] = raw.split(/\s+/);
  const cmd = (head || "").split("@")[0].toLowerCase();

  if (cmd === "/start") {
    const lang = await getLang(env, chatId);
    const payload = rest[0] || "";
    // t.me/ssrjkk_bot?start=p_raven ведёт сразу на карточку, ?start=ref_123 записывает
    // приглашение от пользователя 123 — иначе рефералы в /stats всегда пустые.
    // Числа, а не произвольная строка: value попадает в /stats владельца, а ссылку
    // ?start=<что угодно> может прислать кто угодно.
    if (payload.startsWith("p_")) {
      const name = payload.slice(2, 64);
      if (PROJECTS.some((project) => project.name === name)) {
        track(env, ctx, userId, "open", name);
        await sendProjectDetail(env, ctx, chatId, name, lang, userId);
        return;
      }
    }
    const ref = /^ref[_=]?(\d{1,20})$/.exec(payload);
    if (ref && ref[1] !== String(userId)) track(env, ctx, userId, "ref", ref[1]);
    await sendMessage(token, chatId, await startText(env, ctx, lang), mainMenu(lang));
    return;
  }

  const lang = await getLang(env, chatId);

  if (cmd === "/projects") {
    track(env, ctx, userId, "cmd", "projects");
    const { text, keyboard } = await projectsList(env, ctx, lang, 0);
    await sendMessage(token, chatId, text, keyboard);
    return;
  }
  if (cmd === "/sites") {
    track(env, ctx, userId, "cmd", "sites");
    await sendSites(env, ctx, chatId, lang);
    return;
  }
  if (cmd === "/bots") {
    track(env, ctx, userId, "cmd", "bots");
    await sendBots(env, ctx, chatId, lang);
    return;
  }
  if (cmd === "/top") {
    track(env, ctx, userId, "cmd", "top");
    await sendMessage(token, chatId, await topText(env, ctx, lang));
    return;
  }
  if (cmd === "/news") {
    track(env, ctx, userId, "cmd", "news");
    await sendNews(env, ctx, chatId, lang);
    return;
  }
  if (cmd === "/feedback") {
    track(env, ctx, userId, "cmd", "feedback");
    await handleFeedback(env, ctx, token, chatId, userId, lang, raw);
    return;
  }
  if (cmd === "/search") {
    track(env, ctx, userId, "cmd", "search");
    const query = rest.join(" ").trim();
    if (!query) {
      await sendMessage(token, chatId, LANG[lang].searchPrompt);
      return;
    }
    track(env, ctx, userId, "search", query.slice(0, 64));
    const needle = query.toLowerCase();
    const stars = await getStars(env, ctx);
    const found = sortByStars(
      PROJECTS.filter(
        (project) =>
          project.name.toLowerCase().includes(needle) ||
          (project.title || "").toLowerCase().includes(needle) ||
          (project.lang || "").toLowerCase().includes(needle) ||
          (project.desc || "").toLowerCase().includes(needle) ||
          (project.desc_en || "").toLowerCase().includes(needle)
      ),
      stars
    ).slice(0, 10);
    if (!found.length) {
      await sendMessage(token, chatId, LANG[lang].searchEmpty(esc(query)));
      return;
    }
    const lines = found.map((project) => projectCard(project, stars, lang));
    await sendMessage(token, chatId, `${LANG[lang].searchTitle(esc(query))}\n\n${lines.join("\n\n")}`);
    return;
  }
  if (cmd === "/links") {
    track(env, ctx, userId, "cmd", "links");
    await sendMessage(token, chatId, LANG[lang].linksTitle, urlKeyboard(lang, LINKS));
    return;
  }
  if (cmd === "/channels") {
    track(env, ctx, userId, "cmd", "channels");
    await sendMessage(token, chatId, LANG[lang].channelsTitle, urlKeyboard(lang, CHANNELS));
    return;
  }
  if (cmd === "/about") {
    track(env, ctx, userId, "cmd", "about");
    await sendMessage(token, chatId, LANG[lang].about(PROJECTS.length), urlKeyboard(lang, LINKS));
    return;
  }
  if (cmd === "/help") {
    track(env, ctx, userId, "cmd", "help");
    await sendMessage(token, chatId, LANG[lang].help);
    return;
  }
  if (cmd === "/stats") {
    track(env, ctx, userId, "cmd", "stats");
    await showStats(env, ctx, chatId, lang);
    return;
  }
  if (cmd === "/myid") {
    await sendMessage(token, chatId, `Your ID: <code>${userId}</code>`);
    return;
  }
  if (cmd === "/broadcast") {
    track(env, ctx, userId, "cmd", "broadcast");
    await handleBroadcast(env, token, chatId, lang, raw);
    return;
  }
  if (cmd.startsWith("/")) track(env, ctx, userId, "cmd", cmd);
  await sendMessage(token, chatId, LANG[lang].unknown + LANG[lang].help);
}

async function newsContent(env, ctx, lang) {
  const items = await getNews(env, ctx);
  const rows = [];
  if (!items.length) {
    return { text: LANG[lang].newsEmpty, rows: [[{ text: LANG[lang].toMenu, callback_data: "show:menu" }]] };
  }
  for (const name of [...new Set(items.map((item) => item.repo))].slice(0, 4)) {
    rows.push([{ text: name, url: items.find((item) => item.repo === name).url }]);
  }
  rows.push([{ text: LANG[lang].toMenu, callback_data: "show:menu" }]);
  return {
    text: `${LANG[lang].newsTitle}\n\n${items.map((item) => newsLine(item, lang)).join("\n")}`,
    rows
  };
}

async function sendNews(env, ctx, chatId, lang) {
  const content = await newsContent(env, ctx, lang);
  await sendMessage(env.BOT_TOKEN, chatId, content.text, content.rows);
}

async function handleFeedback(env, ctx, token, chatId, userId, lang, raw) {
  const note = raw.replace(/^\/feedback(?:@\w+)?/i, "").trim();
  if (!note) {
    await sendMessage(token, chatId, LANG[lang].feedbackPrompt);
    return;
  }
  if (!env.OWNER_ID) {
    await sendMessage(token, chatId, LANG[lang].notConfigured);
    return;
  }
  // Текст пользователя экранируется: он попадает в чат владельца с parse_mode HTML.
  const delivered = await sendMessage(
    token,
    env.OWNER_ID,
    LANG[lang].feedbackNote(esc(note.slice(0, 900)), esc(userId))
  );
  if (delivered) track(env, ctx, userId, "feedback");
  await sendMessage(token, chatId, delivered ? LANG[lang].feedbackDone : LANG[lang].feedbackFailed);
}

async function handleBroadcast(env, token, chatId, lang, raw) {
  const owner = env.OWNER_ID;
  if (!owner) {
    await sendMessage(token, chatId, LANG[lang].notConfigured);
    return;
  }
  if (String(chatId) !== String(owner)) {
    await sendMessage(token, chatId, LANG[lang].notOwner);
    return;
  }
  const text = raw.split(/\s+/).slice(1).join(" ").trim();
  if (!text) {
    await sendMessage(token, chatId, LANG[lang].broadcastPrompt);
    return;
  }
  const rows = await env.BOT_DB.prepare(
    "SELECT DISTINCT user_id FROM events WHERE user_id IS NOT NULL"
  ).all();
  const ids = (rows.results || []).map((row) => row.user_id);
  if (!ids.length) {
    await sendMessage(token, chatId, LANG[lang].broadcastEmpty);
    return;
  }
  let ok = 0;
  let fail = 0;
  for (let index = 0; index < ids.length; index += 10) {
    const chunk = ids.slice(index, index + 10);
    const results = await Promise.allSettled(chunk.map((id) => sendMessage(token, id, text)));
    results.forEach((result) => {
      if (result.status === "fulfilled" && result.value) ok++;
      else fail++;
    });
  }
  await sendMessage(token, chatId, LANG[lang].broadcastDone(ok, fail));
}

async function showStats(env, ctx, chatId, lang) {
  const token = env.BOT_TOKEN;
  const owner = env.OWNER_ID;
  if (!owner) {
    await sendMessage(token, chatId, LANG[lang].notConfigured);
    return;
  }
  if (String(chatId) !== String(owner)) {
    await sendMessage(token, chatId, LANG[lang].notOwner);
    return;
  }
  const db = env.BOT_DB;
  // Одно взвешивание вместо четырёх отдельных запросов: в SQLite условие — это 0/1.
  const totals =
    (await db
      .prepare(
        "SELECT COUNT(DISTINCT user_id) users, SUM(kind = 'msg') msgs, SUM(kind = 'cmd') cmds, " +
          "SUM(kind = 'open') opens, SUM(kind = 'inline') inline_picks, SUM(kind = 'feedback') feedback, " +
          "SUM(kind IN ('msg','cmd') AND ts >= date('now','start of day')) today " +
          "FROM events WHERE user_id IS NOT NULL"
      )
      .first()) || {};

  const grouped = async (kind, limit) => {
    const statement = limit
      ? db
          .prepare("SELECT value, COUNT(*) c FROM events WHERE kind = ? GROUP BY value ORDER BY c DESC LIMIT ?")
          .bind(kind, limit)
      : db
          .prepare("SELECT value, COUNT(*) c FROM events WHERE kind = ? GROUP BY value ORDER BY c DESC")
          .bind(kind);
    const rows = await statement.all();
    return rows.results || [];
  };

  const cmdRows = await grouped("cmd");
  const navRows = await grouped("nav");
  const openRows = await grouped("open", 5);
  const searchRows = await grouped("search", 5);
  const refRows = await grouped("ref", 5);
  const userRows =
    (
      await db
        .prepare(
          "SELECT user_id, COUNT(*) c FROM events WHERE user_id IS NOT NULL GROUP BY user_id ORDER BY c DESC LIMIT 5"
        )
        .all()
    ).results || [];
  const weekRows =
    (
      await db
        .prepare(
          "SELECT date(ts) d, COUNT(*) c FROM events WHERE kind IN ('msg','cmd') AND ts >= date('now','-6 days') GROUP BY d ORDER BY d"
        )
        .all()
    ).results || [];

  const list = (rows, format) => (rows.length ? rows.map(format).join("\n") : LANG[lang].statsEmpty);
  await sendMessage(
    token,
    chatId,
    LANG[lang].stats({
      users: totals.users || 0,
      msgs: totals.msgs || 0,
      today: totals.today || 0,
      cmds: totals.cmds || 0,
      opens: totals.opens || 0,
      inlinePicks: totals.inline_picks || 0,
      feedback: totals.feedback || 0,
      week: weekBars(weekRows),
      cmdList: list(cmdRows, (row) => `  /${esc(row.value)} — ${row.c}`),
      navList: list(navRows, (row) => `  ${esc(row.value)} — ${row.c}`),
      topProjects: list(openRows, (row) => `  ${esc(titleOf(row.value))} — ${row.c}`),
      searchList: list(searchRows, (row) => `  ${esc(row.value)} — ${row.c}`),
      topUsers: list(userRows, (row) => `  <code>${esc(row.user_id)}</code> — ${row.c}`),
      refList: list(refRows, (row) => `  <code>${esc(row.value)}</code> → ${row.c}`)
    })
  );
}

async function handleCallback(env, ctx, callback) {
  const token = env.BOT_TOKEN;
  const chatId = callback.message.chat.id;
  const messageId = callback.message.message_id;
  const userId = callback.from ? callback.from.id : null;
  const payload = callback.data || "";
  const lang = await getLang(env, chatId);

  if (payload === "noop") {
    await callApi(token, "answerCallbackQuery", { callback_query_id: callback.id });
    return;
  }

  if (payload.startsWith("stack:")) {
    const body = payload.slice(6);
    const cut = body.lastIndexOf(":");
    const stack = body.slice(0, cut);
    track(env, ctx, userId, "nav", `stack:${stack}`);
    const { text, keyboard } = await projectsList(
      env,
      ctx,
      lang,
      parseInt(body.slice(cut + 1), 10) || 0,
      stack
    );
    await editMessage(token, chatId, messageId, text, keyboard);
    await callApi(token, "answerCallbackQuery", { callback_query_id: callback.id });
    return;
  }

  if (payload.startsWith("page:")) {
    const { text, keyboard } = await projectsList(
      env,
      ctx,
      lang,
      parseInt(payload.split(":")[1], 10)
    );
    await editMessage(token, chatId, messageId, text, keyboard);
    await callApi(token, "answerCallbackQuery", { callback_query_id: callback.id });
    return;
  }

  if (payload.startsWith("p:") || payload.startsWith("shot:")) {
    const name = payload.slice(payload.indexOf(":") + 1);
    track(env, ctx, userId, "open", name);
    await sendProjectDetail(env, ctx, chatId, name, lang, userId);
    await callApi(token, "answerCallbackQuery", { callback_query_id: callback.id });
    return;
  }

  if (payload.startsWith("ref:")) {
    const link = `${BOT_URL}?start=ref_${userId}`;
    const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(
      LANG[lang].shareText(titleOf(payload.slice(4)))
    )}`;
    await sendMessage(
      token,
      chatId,
      LANG[lang].inviteLink(link),
      [[{ text: LANG[lang].share, url: share }], [{ text: LANG[lang].toMenu, callback_data: "show:menu" }]]
    );
    await callApi(token, "answerCallbackQuery", { callback_query_id: callback.id });
    return;
  }

  if (payload.startsWith("show:")) {
    const what = payload.split(":")[1];
    track(env, ctx, userId, "nav", what);
    let text;
    let keyboard;
    if (what === "menu") {
      text = LANG[lang].menu;
      keyboard = mainMenu(lang);
    } else if (what === "top") {
      text = await topText(env, ctx, lang);
      keyboard = [[{ text: LANG[lang].back, callback_data: "show:menu" }]];
    } else if (what === "news") {
      const content = await newsContent(env, ctx, lang);
      text = content.text;
      keyboard = content.rows;
    } else if (what === "links") {
      text = LANG[lang].linksTitle;
      keyboard = urlKeyboard(lang, LINKS);
    } else if (what === "channels") {
      text = LANG[lang].channelsTitle;
      keyboard = urlKeyboard(lang, CHANNELS);
    } else if (what === "sites") {
      text = LANG[lang].sitesTitle;
      keyboard = urlKeyboard(
        lang,
        PROJECTS.filter((project) => project.site).map((project) => ({
          name: `${displayName(project)} — ${new URL(project.site).host}`,
          url: project.site
        }))
      );
    } else if (what === "bots") {
      text = LANG[lang].botsTitle;
      keyboard = urlKeyboard(
        lang,
        PROJECTS.filter((project) => project.bot).map((project) => ({
          name: `${displayName(project)} — @${new URL(project.bot).pathname.slice(1)}`,
          url: project.bot
        }))
      );
    } else if (what === "about") {
      text = LANG[lang].about(PROJECTS.length);
      keyboard = urlKeyboard(lang, LINKS);
    } else if (what === "help") {
      text = LANG[lang].help;
      keyboard = [[{ text: LANG[lang].back, callback_data: "show:menu" }]];
    } else if (what === "lang") {
      text = LANG[lang].langMenu;
      keyboard = langKeyboard(lang);
    } else {
      text = LANG[lang].menu;
      keyboard = mainMenu(lang);
    }
    await editMessage(token, chatId, messageId, text, keyboard);
    await callApi(token, "answerCallbackQuery", { callback_query_id: callback.id });
    return;
  }

  if (payload.startsWith("lang:")) {
    const next = payload.split(":")[1] === "en" ? "en" : "ru";
    track(env, ctx, userId, "lang", next);
    langCacheSet(chatId, next);
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(
        env.BOT_KV.put(`lang:${chatId}`, next).catch((error) => console.error("lang put:", error))
      );
    }
    // Ответ уже на новом языке: langSet — строка своей таблицы, а не выбор по параметру.
    await editMessage(token, chatId, messageId, LANG[next].langSet, langKeyboard(next));
    await callApi(token, "answerCallbackQuery", { callback_query_id: callback.id });
  }
}

async function handleInline(env, query) {
  const token = env.BOT_TOKEN;
  const needle = (query.query || "").toLowerCase().trim();
  const lang = query.from && query.from.language_code === "en" ? "en" : "ru";
  const stars = await getStars(env, null);
  const results = PROJECTS.filter(
    (project) =>
      !needle ||
      project.name.toLowerCase().includes(needle) ||
      (project.title || "").toLowerCase().includes(needle) ||
      (project.lang || "").toLowerCase().includes(needle) ||
      (project.desc || "").toLowerCase().includes(needle) ||
      (project.desc_en || "").toLowerCase().includes(needle)
  )
    .slice(0, 30)
    // id результата = имя проекта: chosen_inline_result приходит только с id, и так
    // из выборки в чужом чате сразу видно, какой проект показали.
    .map((project) => {
      const buttons = [];
      if (project.site) buttons.push({ text: `${LANG[lang].siteLabel} ↗`, url: project.site });
      if (project.repo && !project.private) buttons.push({ text: "GitHub", url: project.repo });
      if (project.bot) buttons.push({ text: `${LANG[lang].botLabel} ↗`, url: project.bot });
      const rows = [];
      if (buttons.length) rows.push(buttons);
      if (project.links?.length) rows.push(project.links.map((link) => ({ text: link.name, url: link.url })));
      const markup = rows.length ? { inline_keyboard: rows } : undefined;
      const card = projectCard(project, stars, lang);
      if (project.shot) {
        return {
          type: "photo",
          id: project.name,
          photo_url: project.shot,
          thumbnail_url: project.shot,
          title: displayName(project),
          description: desc(project, lang).slice(0, 100),
          caption: card,
          parse_mode: "HTML",
          ...(markup ? { reply_markup: markup } : {})
        };
      }
      return {
        type: "article",
        id: project.name,
        title: displayName(project),
        description: desc(project, lang).slice(0, 100),
        ...(markup ? { reply_markup: markup } : {}),
        input_message_content: {
          message_text: card,
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true }
        }
      };
    });

  await callApi(token, "answerInlineQuery", {
    inline_query_id: query.id,
    results,
    cache_time: 60,
    is_personal: true
  });
}

async function setupWebhook(env, origin) {
  const webhook = await callApi(env.BOT_TOKEN, "setWebhook", {
    url: `${origin}/webhook`,
    drop_pending_updates: true,
    allowed_updates: ["message", "callback_query", "inline_query", "chosen_inline_result"],
    ...(env.WEBHOOK_SECRET ? { secret_token: env.WEBHOOK_SECRET } : {})
  });
  const commands = {};
  for (const language of Object.keys(COMMANDS)) {
    commands[language] = await callApi(env.BOT_TOKEN, "setMyCommands", {
      commands: COMMANDS[language],
      language_code: language
    });
  }
  return { webhook, commands };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }

    if (url.pathname === "/") {
      return new Response(
        JSON.stringify({
          name: "ssrjkk-bot",
          bot: BOT_URL,
          github: `https://github.com/${GITHUB_USERNAME}`,
          hub: data.hub,
          projects: PROJECTS.length,
          sites: PROJECTS.filter((project) => project.site).length,
          bots: PROJECTS.filter((project) => project.bot).length
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.pathname === "/setup") {
      if (!env.SETUP_KEY || url.searchParams.get("key") !== env.SETUP_KEY) {
        return new Response("Forbidden", { status: 403 });
      }
      if (!env.BOT_TOKEN) {
        return new Response("BOT_TOKEN not set", { status: 500 });
      }
      const result = await setupWebhook(env, url.origin);
      return new Response(JSON.stringify(result, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname !== "/webhook" || request.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }
    if (!env.BOT_TOKEN) {
      return new Response("BOT_TOKEN not set", { status: 500 });
    }
    if (
      env.WEBHOOK_SECRET &&
      request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET
    ) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      const update = await request.json();
      if (update.message && update.message.text) {
        await handleMessage(env, ctx, update.message);
      } else if (update.callback_query) {
        await handleCallback(env, ctx, update.callback_query);
      } else if (update.inline_query) {
        await handleInline(env, update.inline_query);
      } else if (update.chosen_inline_result) {
        const chosen = update.chosen_inline_result;
        track(env, ctx, chosen.from ? chosen.from.id : null, "inline", chosen.result_id);
      }
    } catch (error) {
      console.error("Webhook error:", error);
      return new Response("Error", { status: 500 });
    }
    return new Response("OK", { status: 200 });
  }
};
