// projects.json
var projects_default = {
  github: "ssrjkk",
  hub: "https://ssrjkk.github.io/",
  projects: [
    {
      name: "shopwatch",
      title: "OneWatch",
      lang: "JavaScript, Node.js",
      stars: 0,
      desc: "Часовой магазин OneWatch: 391 модель, каталог с поиском, фильтры, корзина и оформление. Заказ уходит из deep link в Telegram- или MAX-бота. Каталог выгружается в WooCommerce, OpenCart и PrestaShop.\nСтек: JavaScript, Node.js, Telegram/MAX bots",
      desc_en: "OneWatch store: 391 products, searchable catalog, filters, cart and checkout. Orders go from a deep link into a Telegram or MAX bot. The catalog exports to WooCommerce, OpenCart and PrestaShop.\nStack: JavaScript, Node.js, Telegram/MAX bots",
      repo: "https://github.com/ssrjkk/shopwatch",
      site: "https://ssrjkk.github.io/shopwatch/",
      bot: "https://t.me/wwwatchshop_bot",
      shot: "https://raw.githubusercontent.com/ssrjkk/ssrjkk/main/assets/shots/shopwatch.jpg"
    },
    {
      name: "bothive",
      title: "Bothive",
      lang: "TypeScript",
      stars: 0,
      desc: "Self-hosted оркестрация ботов на восемь платформ: очереди BullMQ, движок скриптов в песочнице, webhooks и метрики Prometheus.\nСтек: TypeScript, Fastify, React, Redis, PostgreSQL",
      desc_en: "Self-hosted bot orchestration for eight platforms: BullMQ queues, sandboxed script engine, webhooks and Prometheus metrics.\nStack: TypeScript, Fastify, React, Redis, PostgreSQL",
      repo: "https://github.com/ssrjkk/bothive",
      site: "https://ssrjkk.github.io/bothive/",
      shot: "https://raw.githubusercontent.com/ssrjkk/ssrjkk/main/assets/shots/bothive.jpg"
    },
    {
      name: "raven",
      title: "Raven",
      lang: "Python, TS, Go, Rust",
      stars: 3,
      desc: "Self-hosted MCP-сервер: 66 инструментов поверх stdio и HTTP, изоляция воркспейса, авторизация по ключам, MIT.\nСтек: Python, FastAPI, MCP, Rust/Go",
      desc_en: "Self-hosted MCP server: 66 tools over stdio and HTTP, workspace confinement, keyed auth, MIT licensed.\nStack: Python, FastAPI, MCP, Rust/Go",
      repo: "https://github.com/ssrjkk/raven",
      site: "https://ssrjkk.github.io/raven/",
      shot: "https://raw.githubusercontent.com/ssrjkk/ssrjkk/main/assets/shots/raven.jpg"
    },
    {
      name: "wake",
      title: "Wake",
      lang: "Python, TS",
      stars: 0,
      desc: "Мультивендорный торговый терминал: перп-рынки Lighter и Arcus, funding, copy trading, Predict и AI-агент. Фронтенд React, бэкенд FastAPI.\nСтек: React, FastAPI, PostgreSQL, Telegram bot",
      desc_en: "Multi-venue trading terminal: Lighter and Arcus perp markets, funding, copy trading, Predict and an AI agent. React frontend, FastAPI backend.\nStack: React, FastAPI, PostgreSQL, Telegram bot",
      repo: "https://github.com/ssrjkk/wake",
      site: "https://wake-7k6.pages.dev",
      bot: "https://t.me/waketrade_bot",
      shot: "https://raw.githubusercontent.com/ssrjkk/ssrjkk/main/assets/shots/wake.jpg"
    },
    {
      name: "tippy-on-base",
      title: "Tippy",
      lang: "Python",
      stars: 0,
      desc: "USDC-экономика в Telegram: чаевые, донат-страницы, рынки предсказаний на LMSR и Mini App на Base. Нулевой газ для пользователей.\nСтек: Python, aiogram, Base/USDC, Mini App",
      desc_en: "USDC economy in Telegram: tips, donation pages, LMSR prediction markets and a Mini App on Base. Zero gas for users.\nStack: Python, aiogram, Base/USDC, Mini App",
      repo: "https://github.com/ssrjkk/tippy-on-base",
      site: "https://tippy-egi.pages.dev",
      bot: "https://t.me/tippy_on_base_bot",
      shot: "https://raw.githubusercontent.com/ssrjkk/ssrjkk/main/assets/shots/tippy.jpg"
    },
    {
      name: "drafter",
      title: "Drafter",
      lang: "TypeScript",
      stars: 1,
      desc: "Браузерный AI QA-ассистент: тест-планы, кейсы, код автотестов и баг-репорты из описания задачи. Девять провайдеров, свой ключ.\nСтек: TypeScript, React, LLM providers",
      desc_en: "Browser-based AI QA assistant: test plans, cases, automation code and bug reports from a task description. Nine providers, bring your own key.\nStack: TypeScript, React, LLM providers",
      repo: "https://github.com/ssrjkk/drafter",
      site: "https://ssrjkk.github.io/drafter/",
      shot: "https://raw.githubusercontent.com/ssrjkk/ssrjkk/main/assets/shots/drafter.jpg"
    },
    {
      name: "ezzoffer",
      title: "EZOffer",
      lang: "TypeScript",
      stars: 0,
      desc: "Автоматизация поиска работы на hh.ru: подбор вакансий, сопроводительные письма, управление резюме и уведомления в Telegram.\nСтек: TypeScript, Next.js, hh.ru API",
      desc_en: "Job search automation for hh.ru: vacancy matching, cover letters, resume management and Telegram notifications.\nStack: TypeScript, Next.js, hh.ru API",
      repo: "https://github.com/ssrjkk/ezzoffer",
      site: "https://ssrjkk.github.io/ezzoffer/",
      shot: "https://raw.githubusercontent.com/ssrjkk/ssrjkk/main/assets/shots/ezzoffer.jpg"
    },
    {
      name: "harvest",
      title: "Harvest",
      lang: "Python",
      stars: 0,
      desc: "QA-стенд для EVM-тестнетов: флот кошельков, сценарии, здоровье сети и отчёты прогонов. Только тестовые сети, плюс Telegram-бот оператора.\nСтек: Python, EVM testnets, Telegram bot",
      desc_en: "QA stand for EVM testnets: wallet fleet, scenarios, network health and run reports. Testnets only, plus an operator Telegram bot.\nStack: Python, EVM testnets, Telegram bot",
      repo: "https://github.com/ssrjkk/harvest",
      site: "https://ssrjkk.github.io/harvest/",
      bot: "https://t.me/harvest_testnet_bot",
      shot: "https://raw.githubusercontent.com/ssrjkk/ssrjkk/main/assets/shots/harvest.jpg"
    },
    {
      name: "shroud",
      title: "Shroud",
      lang: "Rust, Solidity, TS",
      stars: 0,
      desc: "Исследовательский прототип обучения ML на шифрованных данных: fhEVM-контракты, STARK-доказательство вычислений, стриминговые выплаты. Не аудирован.\nСтек: Solidity, TypeScript, Rust, fhEVM",
      desc_en: "Research prototype for ML training over encrypted data: fhEVM contracts, STARK proof of compute, streaming payouts. Not audited.\nStack: Solidity, TypeScript, Rust, fhEVM",
      repo: "https://github.com/ssrjkk/shroud",
      site: "https://ssrjkk.github.io/shroud/",
      shot: "https://raw.githubusercontent.com/ssrjkk/ssrjkk/main/assets/shots/shroud.jpg"
    },
    {
      name: "agent-skills",
      title: "Agent Skills",
      lang: "Python",
      stars: 2,
      desc: "120 двуязычных навыков (EN/RU), 20 IT-роадмапов и 27 гайдов. Публичный registry, поиск через CLI --remote, Python SDK и проверяемая CI-сборка сайта.\nСтек: Python, Agent Skills, SDK/CLI",
      desc_en: "120 bilingual skills (EN/RU), 20 IT roadmaps and 27 guides. Public registry, CLI --remote search, Python SDK and a validated CI site build.\nStack: Python, Agent Skills, SDK/CLI",
      repo: "https://github.com/ssrjkk/agent-skills",
      site: "https://ssrjkk.github.io/agent-skills/",
      links: [
        { name: "Registry JSON", url: "https://ssrjkk.github.io/agent-skills/skills_catalog.json" },
        { name: "Roadmaps", url: "https://ssrjkk.github.io/agent-skills/roadmaps.html" },
        { name: "Guides", url: "https://ssrjkk.github.io/agent-skills/guides.html" }
      ],
      shot: "https://raw.githubusercontent.com/ssrjkk/ssrjkk/main/assets/shots/agent-skills.jpg"
    },
    {
      name: "qualix",
      title: "Qualix",
      lang: "Python",
      stars: 0,
      desc: "QA-платформа автоматизации: 317 тестов на шести уровнях, покрытие 85%+, security hardening, готовность к k8s.\nСтек: Python, FastAPI, pytest, Playwright, Locust",
      desc_en: "QA automation platform: 317 tests across six layers, 85%+ coverage, security hardening, k8s-ready.\nStack: Python, FastAPI, pytest, Playwright, Locust",
      repo: "https://github.com/ssrjkk/qualix"
    },
    {
      name: "qa-arsenal",
      title: "QA Arsenal",
      lang: "Python",
      stars: 0,
      desc: "QA-монорепозиторий: hh.ru API/UI, guap.ru Python/Go и amoCRM. API, UI, нагрузочные, БД- и Kafka-наборы в одном пайплайне.\nСтек: Python, pytest, Playwright, Go, Kafka",
      desc_en: "QA monorepo: hh.ru API/UI, guap.ru Python/Go and amoCRM. API, UI, load, DB and Kafka suites in one pipeline.\nStack: Python, pytest, Playwright, Go, Kafka",
      repo: "https://github.com/ssrjkk/qa-arsenal"
    },
    {
      name: "mobius",
      title: "Mobius",
      lang: "Python",
      stars: 0,
      desc: "Мобильная автоматизация Android и iOS: Appium 2.x + pytest, screen objects, пул устройств, параллельный запуск. 947 тестов, 99% покрытия.\nСтек: Python, Appium 2.x, pytest",
      desc_en: "Mobile automation for Android and iOS: Appium 2.x + pytest, screen objects, device pooling, parallel runs. 947 tests, 99% coverage.\nStack: Python, Appium 2.x, pytest",
      repo: "https://github.com/ssrjkk/mobius"
    },
    {
      name: "noema",
      title: "Noema",
      lang: "Python",
      stars: 0,
      desc: "Нейро-символический инженерный движок: LLM предлагает решения, Z3 проверяет по контрактам, инциденты чинятся через pull-реквесты.\nСтек: Python, Z3, gRPC",
      desc_en: "Neuro-symbolic engineering engine: an LLM proposes solutions, Z3 verifies them against contracts, incidents are fixed through pull requests.\nStack: Python, Z3, gRPC",
      repo: "https://github.com/ssrjkk/noema"
    },
    {
      name: "volley",
      title: "Volley",
      lang: "C++",
      stars: 0,
      desc: "Платформа нагрузочного тестирования HTTP: асинхронное ядро C++20, YAML-сценарии, OAuth2/mTLS/Vault, OTLP и Prometheus, Python SDK.\nСтек: C++20, Boost.Beast, gRPC",
      desc_en: "HTTP load-testing platform: C++20 async core, YAML scenarios, OAuth2/mTLS/Vault, OTLP and Prometheus, Python SDK.\nStack: C++20, Boost.Beast, gRPC",
      repo: "https://github.com/ssrjkk/volley"
    },
    {
      name: "port",
      title: "Port",
      lang: "JavaScript",
      stars: 0,
      desc: "Этот бот: каталог проектов в Telegram на Cloudflare Workers, D1 и KV. Два языка, карточки со скриншотами, статистика владельца и рассылка.\nСтек: JavaScript, Cloudflare Workers, D1, KV",
      desc_en: "This bot: a Telegram project catalogue on Cloudflare Workers, D1 and KV. Two languages, cards with screenshots, owner stats and broadcast.\nStack: JavaScript, Cloudflare Workers, D1, KV",
      repo: "https://github.com/ssrjkk/port",
      bot: "https://t.me/ssrjkk_bot"
    },
    {
      name: "b2w-crypto-tg-bot",
      title: "B2W Crypto",
      lang: "Python",
      stars: 0,
      desc: "Telegram-платформа для криптопортфеля: отслеживание цен, мониторинг рынка и алерты.\nСтек: Python, aiogram, PostgreSQL",
      desc_en: "Telegram crypto platform: portfolio tracking, price monitoring and market alerts.\nStack: Python, aiogram, PostgreSQL",
      repo: "https://github.com/ssrjkk/b2w-crypto-tg-bot"
    },
    {
      name: "tt_bot",
      title: "TT Bot",
      lang: "Python",
      stars: 0,
      desc: "Telegram-бот для университетских лабораторных: сдача работ, отчёты и оценивание.\nСтек: Python, aiogram",
      desc_en: "Telegram bot for university labs: submissions, reports and grading.\nStack: Python, aiogram",
      repo: "https://github.com/ssrjkk/tt_bot"
    },
    {
      name: "twinby-swipe-bot",
      title: "Twinby",
      lang: "Python",
      stars: 0,
      desc: "Telegram-бот со свайпами для поиска контента и автоматизацией Android/iOS/macOS.\nСтек: Python, Telegram",
      desc_en: "Telegram swipe bot for content discovery with Android/iOS/macOS automation.\nStack: Python, Telegram",
      repo: "https://github.com/ssrjkk/twinby-swipe-bot"
    },
    {
      name: "ssrjkk.github.io",
      title: "Projects hub",
      lang: "HTML, CSS",
      stars: 0,
      desc: "Хаб проектов и услуг: живые интерфейсы, ссылки на сайты и ботов, контакты.\nСтек: HTML, CSS, GitHub Pages",
      desc_en: "Project and services hub: live interfaces, links to sites and bots, contacts.\nStack: HTML, CSS, GitHub Pages",
      repo: "https://github.com/ssrjkk/ssrjkk.github.io",
      site: "https://ssrjkk.github.io/",
      shot: "https://raw.githubusercontent.com/ssrjkk/ssrjkk/main/assets/shots/hub.jpg"
    }
  ],
  channels: [
    {
      name: "B2W Main",
      url: "https://t.me/b2wmain"
    },
    {
      name: "B2W Shitpost",
      url: "https://t.me/b2wshitpost"
    }
  ],
  links: [
    {
      name: "GitHub",
      url: "https://github.com/ssrjkk"
    },
    {
      name: "Telegram",
      url: "https://t.me/ssrjkk"
    },
    {
      name: "Projects hub",
      url: "https://ssrjkk.github.io/"
    },
    {
      name: "Bot catalogue",
      url: "https://t.me/ssrjkk_bot"
    }
  ]
};

// src/worker.js
var GITHUB_USERNAME = projects_default.github;
var PROJECTS = projects_default.projects;
var CHANNELS = projects_default.channels;
var LINKS = projects_default.links;
var API = "https://api.telegram.org";
var GH_API = "https://api.github.com/repos";
var STARS_TTL = 3600;
var PAGE_SIZE = 3;
var LANG = {
  ru: {
    menu: "Главное меню:",
    projectsTitle: "<b>Мои проекты:</b>",
    linksTitle: "Все ссылки:",
    channelsTitle: "Telegram-каналы:",
    sitesTitle: "<b>Сайты проектов:</b>",
    botsTitle: "<b>Telegram-боты:</b>",
    help: "/start - запуск\n/projects - проекты GitHub\n/sites - сайты проектов\n/bots - Telegram-боты\n/search <запрос> - поиск проектов\n/top - топ по звёздам\n/links - ссылки\n/channels - каналы\n/about - обо мне\n/stats - статистика (владелец)\n/myid - мой ID\n/help - справка",
    unknown: "Не знаю такой команды.\n\n",
    page: (cur, total) => `Стр. ${cur}/${total}`,
    prev: "⬅️",
    next: "➡️",
    projects: "📦 Проекты",
    top: "🏆 Топ",
    links: "🔗 Ссылки",
    channels: "📢 Каналы",
    sites: "🌐 Сайты",
    bots: "🤖 Боты",
    helpBtn: "❓ Помощь",
    lang: "🌐 Язык",
    aboutBtn: "👤 Обо мне",
    langMenu: "Выбери язык:",
    langSet: (l) => `Язык: ${l === "ru" ? "🇷🇺 Русский" : "🇬🇧 English"}`,
    back: "🔙 Назад",
    toMenu: "В меню",
    toProjects: "К проектам",
    siteLabel: "Сайт",
    botLabel: "Бот",
    shotLabel: "Скриншот",
    privateLabel: "исходники закрыты",
    notFound: "Проект не найден.",
    notOwner: "Команда доступна только владельцу.",
    notConfigured: "Владелец не настроен (OWNER_ID).",
    statsEmpty: "Пока нет данных.",
    stats: (s) => `📊 <b>Статистика</b>

Пользователей: <b>${s.users}</b>
Сообщений: <b>${s.msgs}</b>
Сегодня: <b>${s.today}</b>
Команд: <b>${s.cmds}</b>

По командам:
${s.cmdList}

Топ пользователей:
${s.topUsers}

Рефералы:
${s.refList}`,
    searchPrompt: "Формат: /search <запрос>\nНапример: /search python",
    searchEmpty: (q) => `По запросу «${q}» ничего не найдено.`,
    searchTitle: (q) => `<b>Результаты по запросу «${q}»:</b>`,
    topTitle: "<b>🏆 Топ проектов по звёздам:</b>",
    about: "👤 <b>Обо мне</b>\n\nРазрабатываю ботов, AI-инструменты, Web3 и QA-платформы.\nВсе проекты — открытый код на GitHub.\n\n🛠 Стек: Python, TypeScript, Go, Rust, C++, Solidity\n📦 Проектов: 20 — сайты, боты и инженерные инструменты\n📢 Каналы: @b2wmain, @b2wshitpost\n\nКнопки ниже — мои ссылки 👇",
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
    help: "/start - start\n/projects - GitHub projects\n/sites - project sites\n/bots - Telegram bots\n/search <query> - search projects\n/top - top by stars\n/links - links\n/channels - channels\n/about - about me\n/stats - stats (owner)\n/myid - my ID\n/help - help",
    unknown: "Unknown command.\n\n",
    page: (cur, total) => `Page ${cur}/${total}`,
    prev: "⬅️",
    next: "➡️",
    projects: "📦 Projects",
    top: "🏆 Top",
    links: "🔗 Links",
    channels: "📢 Channels",
    sites: "🌐 Sites",
    bots: "🤖 Bots",
    helpBtn: "❓ Help",
    lang: "🌐 Language",
    aboutBtn: "👤 About me",
    langMenu: "Choose language:",
    langSet: (l) => `Language: ${l === "ru" ? "🇷🇺 Russian" : "🇬🇧 English"}`,
    back: "🔙 Back",
    toMenu: "Menu",
    toProjects: "Projects",
    siteLabel: "Site",
    botLabel: "Bot",
    shotLabel: "Screenshot",
    privateLabel: "source private",
    notFound: "Project not found.",
    notOwner: "Only the owner can use this command.",
    notConfigured: "Owner is not configured (OWNER_ID).",
    statsEmpty: "No data yet.",
    stats: (s) => `📊 <b>Statistics</b>

Users: <b>${s.users}</b>
Messages: <b>${s.msgs}</b>
Today: <b>${s.today}</b>
Commands: <b>${s.cmds}</b>

By command:
${s.cmdList}

Top users:
${s.topUsers}

Referrals:
${s.refList}`,
    searchPrompt: "Format: /search <query>\nExample: /search python",
    searchEmpty: (q) => `Nothing found for «${q}».`,
    searchTitle: (q) => `<b>Results for «${q}»:</b>`,
    topTitle: "<b>🏆 Top projects by stars:</b>",
    about: "👤 <b>About me</b>\n\nI build bots, AI tools, Web3 and QA platforms.\nAll projects are open source on GitHub.\n\n🛠 Stack: Python, TypeScript, Go, Rust, C++, Solidity\n📦 Projects: 20 — sites, bots and engineering tools\n📢 Channels: @b2wmain, @b2wshitpost\n\nButtons below are my links 👇",
    broadcastPrompt: "Format: /broadcast <text>",
    broadcastDone: (ok, fail) => `Sent: <b>${ok}</b>, failed: <b>${fail}</b>.`,
    broadcastEmpty: "No users to broadcast to."
  }
};
var COMMANDS = [
  { command: "start", description: "Запуск" },
  { command: "projects", description: "Проекты GitHub" },
  { command: "sites", description: "Сайты проектов" },
  { command: "bots", description: "Telegram-боты" },
  { command: "search", description: "Поиск проектов" },
  { command: "top", description: "Топ по звёздам" },
  { command: "links", description: "Все ссылки" },
  { command: "channels", description: "Telegram-каналы" },
  { command: "about", description: "Обо мне" },
  { command: "stats", description: "Статистика" },
  { command: "myid", description: "Мой ID" },
  { command: "help", description: "Справка" }
];
var langCache = /* @__PURE__ */ new Map();
var starsCache = null;
var starsFetchedAt = 0;
function esc(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
async function callApi(token, method, payload) {
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(1e4)
  });
  if (!res.ok) {
    console.error(`Telegram API ${method}: HTTP ${res.status}`);
    return null;
  }
  const body = await res.json();
  if (!body.ok) {
    console.error(`Telegram API ${method}: ${JSON.stringify(body)}`);
    return null;
  }
  return body.result;
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
  langCache.set(chatId, lang);
  return lang;
}
async function getStars(env, ctx) {
  const now = Date.now();
  if (starsCache && now - starsFetchedAt < STARS_TTL * 1e3) return starsCache;
  let cached = null;
  try {
    cached = JSON.parse(await env.BOT_KV.get("stars"));
  } catch (error) {
    console.error("getStars KV error:", error);
  }
  if (cached && now - cached.ts < STARS_TTL * 1e3) {
    starsCache = cached.data;
    starsFetchedAt = cached.ts;
    return starsCache;
  }
  const result = {};
  await Promise.allSettled(
    PROJECTS.filter((project) => !project.private).map(async (project) => {
      try {
        const res = await fetch(`${GH_API}/${GITHUB_USERNAME}/${project.name}`, {
          headers: { "User-Agent": "ssrjkk-bot", Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(8e3)
        });
        if (res.ok) {
          const body = await res.json();
          result[project.name] = { stars: body.stargazers_count ?? 0 };
        }
      } catch (error) {
        console.error(`GitHub fetch ${project.name}:`, error);
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
function desc(project, lang) {
  return lang === "en" && project.desc_en ? project.desc_en : project.desc;
}
function projectCard(project, stars, lang) {
  const star = stars && stars[project.name] ? stars[project.name].stars : 0;
  const starCount = star > 0 ? ` ${star}★` : "";
  const links = [];
  if (project.site) links.push(`<a href="${project.site}">${LANG[lang].siteLabel}</a>`);
  if (project.repo && !project.private) links.push(`<a href="${project.repo}">GitHub</a>`);
  if (project.bot) links.push(`<a href="${project.bot}">${LANG[lang].botLabel}</a>`);
  for (const link of project.links || []) links.push(`<a href="${esc(link.url)}">${esc(link.name)}</a>`);
  if (project.private) links.push(LANG[lang].privateLabel);
  return `<b>${esc(project.title || project.name)}</b> [${esc(project.lang)}]${starCount}
${esc(desc(project, lang))}
${links.join(" · ")}`;
}
function sortByStars(projects, stars) {
  return [...projects].sort(
    (a, b) => (stars[b.name] ? stars[b.name].stars : 0) - (stars[a.name] ? stars[a.name].stars : 0)
  );
}
function projectDetailKeyboard(lang, project) {
  const row = [];
  if (project.site) row.push({ text: `🌐 ${LANG[lang].siteLabel}`, url: project.site });
  if (project.repo && !project.private) row.push({ text: "GitHub", url: project.repo });
  if (project.bot) row.push({ text: `🤖 ${LANG[lang].botLabel}`, url: project.bot });
  const rows = [];
  if (row.length) rows.push(row);
  if (project.links?.length) rows.push(project.links.map((link) => ({ text: link.name, url: link.url })));
  rows.push([
    { text: LANG[lang].toProjects, callback_data: "page:0" },
    { text: LANG[lang].toMenu, callback_data: "show:menu" }
  ]);
  return rows;
}
async function sendProjectDetail(env, ctx, chatId, name, lang) {
  const project = PROJECTS.find((item) => item.name === name);
  if (!project) {
    await sendMessage(env.BOT_TOKEN, chatId, LANG[lang].notFound);
    return;
  }
  const stars = await getStars(env, ctx);
  const caption = projectCard(project, stars, lang);
  const keyboard = projectDetailKeyboard(lang, project);
  if (project.shot) {
    const sent = await sendPhoto(env.BOT_TOKEN, chatId, project.shot, caption, keyboard);
    if (sent) return;
  }
  const text = project.shot ? `${caption}
<a href="${project.shot}">${LANG[lang].shotLabel}</a>` : caption;
  await sendMessage(env.BOT_TOKEN, chatId, text, keyboard);
}
async function projectsList(env, ctx, lang, page) {
  const stars = await getStars(env, ctx);
  const total = PROJECTS.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safe = Math.min(Math.max(page, 0), pages - 1);
  const start = safe * PAGE_SIZE;
  const slice = PROJECTS.slice(start, start + PAGE_SIZE);
  const lines = slice.map((project) => projectCard(project, stars, lang));
  const rows = slice.map((project) => [
    {
      text: `${project.shot ? "📷" : "ℹ️"} ${project.title || project.name}`,
      callback_data: `p:${project.name}`
    }
  ]);
  const nav = [];
  if (safe > 0) nav.push({ text: LANG[lang].prev, callback_data: `page:${safe - 1}` });
  nav.push({ text: LANG[lang].page(safe + 1, pages), callback_data: "noop" });
  if (safe < pages - 1) nav.push({ text: LANG[lang].next, callback_data: `page:${safe + 1}` });
  rows.push(nav);
  rows.push([{ text: LANG[lang].back, callback_data: "show:menu" }]);
  return {
    text: `${LANG[lang].projectsTitle}

${lines.join("\n\n")}`,
    keyboard: rows,
    page: safe,
    pages
  };
}
async function startText(env, ctx, lang) {
  let sum = 0;
  try {
    const stars = await getStars(env, ctx);
    for (const project of PROJECTS) sum += (stars[project.name] ? stars[project.name].stars : 0) || 0;
  } catch {
  }
  const sites = PROJECTS.filter((project) => project.site).length;
  const bots = PROJECTS.filter((project) => project.bot).length;
  if (lang === "ru") {
    return `👋 Привет! Я бот ssrjkk.

📦 Проектов: ${PROJECTS.length} · 🌐 Сайтов: ${sites} · 🤖 Ботов: ${bots} · ⭐ Звёзд: ${sum}

Команды и кнопки ниже — проекты, сайты, боты, топ, поиск и ссылки.`;
  }
  return `👋 Hi! I'm ssrjkk bot.

📦 Projects: ${PROJECTS.length} · 🌐 Sites: ${sites} · 🤖 Bots: ${bots} · ⭐ Stars: ${sum}

Use commands or the buttons below — projects, sites, bots, top, search and links.`;
}
async function topText(env, ctx, lang) {
  const stars = await getStars(env, ctx);
  const medals = ["🥇", "🥈", "🥉"];
  const lines = sortByStars(PROJECTS, stars).slice(0, 3).map((project, index) => {
    const count = stars[project.name] ? stars[project.name].stars : 0;
    return `${medals[index]} <b>${esc(project.title || project.name)}</b> [${esc(project.lang)}] — ${count}★`;
  });
  return `${LANG[lang].topTitle}

${lines.join("\n")}`;
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
    [{ text: LANG[lang].aboutBtn, callback_data: "show:about" }]
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
      { text: "🇷🇺 Русский", callback_data: "lang:ru" },
      { text: "🇬🇧 English", callback_data: "lang:en" }
    ],
    [{ text: LANG[lang].back, callback_data: "show:menu" }]
  ];
}
function track(env, ctx, userId, kind, value) {
  if (!userId || !ctx || typeof ctx.waitUntil !== "function") return;
  ctx.waitUntil(
    env.BOT_DB.prepare("INSERT INTO events (user_id, kind, value) VALUES (?, ?, ?)").bind(userId, kind, value ?? null).run().catch((error) => console.error("track error:", error))
  );
}
async function sendSites(env, ctx, chatId, lang) {
  const items = PROJECTS.filter((project) => project.site).map((project) => ({
    name: `${project.title || project.name} — ${new URL(project.site).host}`,
    url: project.site
  }));
  await sendMessage(env.BOT_TOKEN, chatId, LANG[lang].sitesTitle, urlKeyboard(lang, items));
}
async function sendBots(env, ctx, chatId, lang) {
  const items = PROJECTS.filter((project) => project.bot).map((project) => ({
    name: `${project.title || project.name} — @${new URL(project.bot).pathname.slice(1)}`,
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
    const payload = rest[0];
    const ref = payload ? payload.replace(/^ref=/, "").slice(0, 64) : null;
    if (ref) track(env, ctx, userId, "ref", ref);
    const lang2 = await getLang(env, chatId);
    await sendMessage(token, chatId, await startText(env, ctx, lang2), mainMenu(lang2));
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
  if (cmd === "/search") {
    track(env, ctx, userId, "cmd", "search");
    const query = rest.join(" ").trim();
    if (!query) {
      await sendMessage(token, chatId, LANG[lang].searchPrompt);
      return;
    }
    const needle = query.toLowerCase();
    const stars = await getStars(env, ctx);
    const found = sortByStars(
      PROJECTS.filter(
        (project) => project.name.toLowerCase().includes(needle) || (project.title || "").toLowerCase().includes(needle) || (project.lang || "").toLowerCase().includes(needle) || (project.desc || "").toLowerCase().includes(needle) || (project.desc_en || "").toLowerCase().includes(needle)
      ),
      stars
    ).slice(0, 10);
    if (!found.length) {
      await sendMessage(token, chatId, LANG[lang].searchEmpty(esc(query)));
      return;
    }
    const lines = found.map((project) => projectCard(project, stars, lang));
    await sendMessage(token, chatId, `${LANG[lang].searchTitle(esc(query))}

${lines.join("\n\n")}`);
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
    await sendMessage(token, chatId, LANG[lang].about, urlKeyboard(lang, LINKS));
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
  const users = await env.BOT_DB.prepare(
    "SELECT COUNT(DISTINCT user_id) c FROM events WHERE kind = 'msg'"
  ).first();
  const msgs = await env.BOT_DB.prepare(
    "SELECT COUNT(*) c FROM events WHERE kind = 'msg'"
  ).first();
  const today = await env.BOT_DB.prepare(
    "SELECT COUNT(*) c FROM events WHERE kind = 'msg' AND ts >= date('now', 'start of day')"
  ).first();
  const cmdRows = await env.BOT_DB.prepare(
    "SELECT value, COUNT(*) c FROM events WHERE kind = 'cmd' GROUP BY value ORDER BY c DESC"
  ).all();
  const userRows = await env.BOT_DB.prepare(
    "SELECT user_id, COUNT(*) c FROM events WHERE kind = 'msg' GROUP BY user_id ORDER BY c DESC LIMIT 5"
  ).all();
  const refRows = await env.BOT_DB.prepare(
    "SELECT value, COUNT(*) c FROM events WHERE kind = 'ref' GROUP BY value ORDER BY c DESC"
  ).all();
  const cmdList = cmdRows.results.length ? cmdRows.results.map((row) => `  /${esc(row.value)} — ${row.c}`).join("\n") : LANG[lang].statsEmpty;
  const topUsers = userRows.results.length ? userRows.results.map((row) => `  <code>${esc(row.user_id)}</code> — ${row.c}`).join("\n") : LANG[lang].statsEmpty;
  const refList = refRows.results.length ? refRows.results.map((row) => `  ${esc(row.value)} — ${row.c}`).join("\n") : LANG[lang].statsEmpty;
  await sendMessage(
    token,
    chatId,
    LANG[lang].stats({
      users: users ? users.c : 0,
      msgs: msgs ? msgs.c : 0,
      today: today ? today.c : 0,
      cmds: cmdRows.results.reduce((sum, row) => sum + row.c, 0),
      cmdList,
      topUsers,
      refList
    })
  );
}
async function handleCallback(env, ctx, callback) {
  const token = env.BOT_TOKEN;
  const chatId = callback.message.chat.id;
  const messageId = callback.message.message_id;
  const payload = callback.data || "";
  const lang = await getLang(env, chatId);
  if (payload === "noop") {
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
    await sendProjectDetail(env, ctx, chatId, name, lang);
    await callApi(token, "answerCallbackQuery", { callback_query_id: callback.id });
    return;
  }
  if (payload.startsWith("show:")) {
    const what = payload.split(":")[1];
    let text;
    let keyboard;
    if (what === "menu") {
      text = LANG[lang].menu;
      keyboard = mainMenu(lang);
    } else if (what === "top") {
      text = await topText(env, ctx, lang);
      keyboard = [[{ text: LANG[lang].back, callback_data: "show:menu" }]];
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
          name: `${project.title || project.name} — ${new URL(project.site).host}`,
          url: project.site
        }))
      );
    } else if (what === "bots") {
      text = LANG[lang].botsTitle;
      keyboard = urlKeyboard(
        lang,
        PROJECTS.filter((project) => project.bot).map((project) => ({
          name: `${project.title || project.name} — @${new URL(project.bot).pathname.slice(1)}`,
          url: project.bot
        }))
      );
    } else if (what === "about") {
      text = LANG[lang].about;
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
    langCache.set(chatId, next);
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(
        env.BOT_KV.put(`lang:${chatId}`, next).catch((error) => console.error("lang put:", error))
      );
    }
    await editMessage(token, chatId, messageId, LANG[next].langSet(next), langKeyboard(next));
    await callApi(token, "answerCallbackQuery", { callback_query_id: callback.id });
  }
}
async function handleInline(env, query) {
  const token = env.BOT_TOKEN;
  const needle = (query.query || "").toLowerCase().trim();
  const lang = query.from && query.from.language_code === "en" ? "en" : "ru";
  const stars = await getStars(env, null);
  const results = PROJECTS.filter(
    (project) => !needle || project.name.toLowerCase().includes(needle) || (project.title || "").toLowerCase().includes(needle) || (project.lang || "").toLowerCase().includes(needle) || (project.desc || "").toLowerCase().includes(needle) || (project.desc_en || "").toLowerCase().includes(needle)
  ).slice(0, 30).map((project, index) => {
    const buttons = [];
    if (project.site) buttons.push({ text: `🌐 ${LANG[lang].siteLabel}`, url: project.site });
    if (project.repo && !project.private) buttons.push({ text: "GitHub", url: project.repo });
    if (project.bot) buttons.push({ text: `🤖 ${LANG[lang].botLabel}`, url: project.bot });
    const rows = [];
    if (buttons.length) rows.push(buttons);
    if (project.links?.length) rows.push(project.links.map((link) => ({ text: link.name, url: link.url })));
    const markup = rows.length ? { inline_keyboard: rows } : void 0;
    const card = projectCard(project, stars, lang);
    if (project.shot) {
      return {
        type: "photo",
        id: String(index),
        photo_url: project.shot,
        thumbnail_url: project.shot,
        title: project.title || project.name,
        description: desc(project, lang).slice(0, 100),
        caption: card,
        parse_mode: "HTML",
        ...markup ? { reply_markup: markup } : {}
      };
    }
    return {
      type: "article",
      id: String(index),
      title: project.title || project.name,
      description: desc(project, lang).slice(0, 100),
      ...markup ? { reply_markup: markup } : {},
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
    allowed_updates: ["message", "callback_query", "inline_query"],
    ...env.WEBHOOK_SECRET ? { secret_token: env.WEBHOOK_SECRET } : {}
  });
  const commands = await callApi(env.BOT_TOKEN, "setMyCommands", { commands: COMMANDS });
  return { webhook, commands };
}
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }
    if (url.pathname === "/") {
      return new Response(
        JSON.stringify({
          name: "ssrjkk-bot",
          bot: "https://t.me/ssrjkk_bot",
          github: `https://github.com/${GITHUB_USERNAME}`,
          hub: projects_default.hub,
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
    if (env.WEBHOOK_SECRET && request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
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
      }
    } catch (error) {
      console.error("Webhook error:", error);
      return new Response("Error", { status: 500 });
    }
    return new Response("OK", { status: 200 });
  }
};
export {
  worker_default as default,
  projectCard,
  projectDetailKeyboard
};
