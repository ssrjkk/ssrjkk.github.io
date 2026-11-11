/**
 * Проверка воркера port: данные, ссылки и бандл согласованы.
 *
 * В репозитории лежат три вещи:
 *
 *   - projects.json — источник данных;
 *   - src/worker.js — исходник воркера;
 *   - cloudflare-worker/worker.js — собранный esbuild-бандл, который деплоится.
 *
 * Расхождение данных и бандла видно только пользователям бота, поэтому его
 * ловит отдельная проверка. Сборка в CI дополнительно сверяет бандл с
 * исходником через git diff.
 *
 * Что проверяется:
 *
 *   1. projects.json разбирается и имеет ожидаемую форму.
 *   2. У каждого проекта заполнены name, title, lang, desc, desc_en и repo —
 *      в боте они показываются пользователю.
 *   3. Ссылки site/bot/shot/repo — валидные URL; site и bot ведут на https;
 *      скриншоты лежат в профильном репозитории на ветке main (иначе бот
 *      покажет битую картинку после смены ветки).
 *   4. Имена проектов уникальны, repo указывает на профиль из github.
 *   5. Каждый проект, канал и ссылка встречаются в бандле — иначе бандл собран
 *      из старых данных.
 *   6. Привязки из wrangler.toml и обязательные секреты встречаются в бандле.
 *   7. В бандле нет токенов Telegram и приватных ключей.
 *   8. Бандл остаётся модулем воркера и не ссылается на отсутствующий source map.
 *   9. README ссылается только на существующие workflow, а таблица команд
 *      совпадает с обработками в src/worker.js — в обе стороны.
 *  10. Deep-ссылки карточек хаба (index.html) ведут на существующих проектов
 *      каталога и на бота из projects.json.
 *
 * Запуск: node scripts/check-bundle.mjs
 * Выход: 0 — всё в порядке, 1 — есть замечания (они печатаются в stderr).
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "projects.json");
const BUNDLE = join(ROOT, "cloudflare-worker", "worker.js");
const SOURCE = join(ROOT, "src", "worker.js");
const WRANGLER = join(ROOT, "cloudflare-worker", "wrangler.toml");

const problems = [];
const fail = (message) => problems.push(message);
const isUrl = (value, protocol = "https:") => {
  try {
    const url = new URL(value);
    return url.protocol === protocol && !url.username && !url.password;
  } catch {
    return false;
  }
};

// --- 1. Данные -----------------------------------------------------------
let data;
try {
  data = JSON.parse(readFileSync(DATA, "utf8"));
} catch (e) {
  console.error(`projects.json не разбирается: ${e.message}`);
  process.exit(1);
}

for (const key of ["github", "hub", "bot", "projects", "channels", "links"]) {
  if (!(key in data)) fail(`в projects.json нет ключа «${key}»`);
}
if (!Array.isArray(data.projects) || data.projects.length === 0) {
  fail("projects.json: projects должен быть непустым списком");
}
if (!isUrl(data.hub)) fail(`hub не является URL: ${data.hub}`);
if (!isUrl(data.bot) || new URL(data.bot).hostname !== "t.me") {
  fail(`bot должен вести на t.me — по нему строятся реферальные ссылки, а там ${data.bot}`);
}

// --- 2. Поля проектов ----------------------------------------------------
const REQUIRED = ["name", "title", "lang", "desc", "desc_en"];
const names = new Set();
for (const [i, p] of (data.projects || []).entries()) {
  const label = p.name ?? `projects[${i}]`;
  for (const key of REQUIRED) {
    if (typeof p[key] !== "string" || p[key].trim() === "") {
      fail(`${label}: пустое поле «${key}»`);
    }
  }
  if (names.has(p.name)) fail(`${label}: имя проекта повторяется`);
  names.add(p.name);

  if (typeof p.stars !== "number" || p.stars < 0) {
    fail(`${label}: stars должен быть неотрицательным числом`);
  }
  if (p.private !== undefined && typeof p.private !== "boolean") {
    fail(`${label}: private должен быть true или false`);
  }

  // --- 3. Ссылки ---------------------------------------------------------
  if (!isUrl(p.repo)) fail(`${label}: repo не является URL: ${p.repo}`);
  if (p.repo !== `https://github.com/${data.github}/${p.name}`) {
    fail(`${label}: repo должен вести на github.com/${data.github}/${p.name}`);
  }
  for (const key of ["site", "bot"]) {
    if (p[key] === undefined) continue;
    if (!isUrl(p[key])) fail(`${label}: ${key} не является https-URL: ${p[key]}`);
  }
  if (isUrl(p.bot) && new URL(p.bot).hostname !== "t.me") {
    fail(`${label}: bot должен вести на t.me, а не на ${p.bot}`);
  }
  if (isUrl(p.site) && new URL(p.site).hostname.endsWith(".github.io") && !p.site.endsWith("/")) {
    fail(`${label}: site на GitHub Pages должен заканчиваться слэшем: ${p.site}`);
  }
  if (p.shot !== undefined) {
    if (!isUrl(p.shot)) fail(`${label}: shot не является https-URL: ${p.shot}`);
    const expected = `https://raw.githubusercontent.com/${data.github}/${data.github}/main/assets/shots/`;
    if (!p.shot.startsWith(expected)) {
      fail(`${label}: shot должен лежать в ${expected}, а не в ${p.shot}`);
    }
  }
  for (const link of p.links || []) {
    if (typeof link?.name !== "string" || !link.name.trim()) fail(`${label}: пустое имя ссылки документации`);
    if (!isUrl(link?.url)) fail(`${label}: ссылка документации должна быть https-URL без учётных данных`);
  }
}

// --- 4. Каналы и ссылки --------------------------------------------------
for (const [i, ch] of (data.channels || []).entries()) {
  if (typeof ch?.name !== "string" || !ch.name.trim()) fail(`channels[${i}]: пустое имя`);
  if (!isUrl(ch?.url)) fail(`channels[${i}]: url не является https-URL: ${ch?.url}`);
}
for (const [i, link] of (data.links || []).entries()) {
  if (typeof link?.name !== "string" || !link.name.trim()) fail(`links[${i}]: пустое имя`);
  if (!isUrl(link?.url)) fail(`links[${i}]: url не является https-URL: ${link?.url}`);
}

// --- 5. Бандл и данные ---------------------------------------------------
let bundle;
try {
  bundle = readFileSync(BUNDLE, "utf8");
} catch (e) {
  console.error(`бандл не читается: ${e.message}`);
  process.exit(1);
}
if (!existsSync(SOURCE)) fail("нет src/worker.js — бандл не из чего пересобрать");
const SOURCE_TEXT = existsSync(SOURCE) ? readFileSync(SOURCE, "utf8") : "";

for (const p of data.projects || []) {
  if (!bundle.includes(`"${p.name}"`)) {
    fail(`«${p.name}» есть в projects.json, но нет в бандле — бандл устарел`);
    continue;
  }
  if (!bundle.includes(p.desc.slice(0, 40))) {
    fail(`описание проекта «${p.name}» не найдено в бандле — бандл устарел`);
  }
}
for (const item of [...(data.channels || []), ...(data.links || [])]) {
  if (typeof item?.url === "string" && !bundle.includes(item.url)) {
    fail(`ссылка «${item.name}» есть в projects.json, но нет в бандле`);
  }
}

// --- 6. Привязки и секреты ----------------------------------------------
let wrangler = "";
try {
  wrangler = readFileSync(WRANGLER, "utf8");
} catch (e) {
  fail(`wrangler.toml не читается: ${e.message}`);
}
const bindings = [...wrangler.matchAll(/^\s*binding\s*=\s*"([^"]+)"/gm)].map((m) => m[1]);
if (bindings.length === 0) fail("в wrangler.toml не найдено ни одной привязки");
for (const b of bindings) {
  if (!bundle.includes(b)) {
    fail(`привязка «${b}» объявлена в wrangler.toml, но не встречается в бандле`);
  }
}
for (const secret of ["BOT_TOKEN", "OWNER_ID", "SETUP_KEY", "WEBHOOK_SECRET"]) {
  if (!bundle.includes(secret)) {
    fail(`секрет «${secret}» не используется в бандле — проверь конфигурацию воркера`);
  }
}

// --- 7. Секреты в бандле -------------------------------------------------
const secretPatterns = [
  [/\b\d{8,10}:[A-Za-z0-9_-]{35}\b/, "токен Telegram-бота"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "приватный ключ"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, "токен GitHub"],
  [/\b[A-Za-z0-9_-]{40,}\b(?=["']\s*;?\s*$)/m, "длинная строка, похожая на ключ"]
];
for (const [pattern, label] of secretPatterns) {
  if (pattern.test(bundle)) fail(`в бандле найден ${label} — секреты в репозиторий не попадают`);
}

// --- 8. Форма бандла -----------------------------------------------------
if (!/export\s*\{[^}]*\bas\s+default\b[^}]*\}/.test(bundle)) {
  fail("бандл не экспортирует обработчик по умолчанию — это не модуль воркера");
}
const mapMatch = bundle.match(/\/\/# sourceMappingURL=(\S+)/);
if (mapMatch) {
  const mapPath = join(dirname(BUNDLE), mapMatch[1]);
  if (!existsSync(mapPath)) {
    fail(`бандл ссылается на source map «${mapMatch[1]}», которого нет рядом`);
  }
}

// --- 9. Документы не обещают того, чего нет ------------------------------
// README — то, по чему правят бота. Если в нём указан workflow, которого нет,
// или команда, которой нет в исходнике, документ расходится с продом молча.
const README = join(ROOT, "README.md");
if (!existsSync(README)) {
  fail("нет bot/README.md — по нему настраивают воркер");
} else {
  const readme = readFileSync(README, "utf8");
  const workflowsDir = resolve(ROOT, "..", ".github", "workflows");
  if (!existsSync(workflowsDir)) {
    fail(`bot/ лежит в хабе, но каталога с workflow нет: ${workflowsDir}`);
  }
  for (const wf of new Set(readme.match(/\.github\/workflows\/[\w.-]+\.ya?ml/g) || [])) {
    if (!existsSync(resolve(ROOT, "..", wf))) {
      fail(`README ссылается на ${wf}, которого нет в репозитории`);
    }
  }
  const documented = new Set(
    [...readme.matchAll(/^\| `(\/\w+)[^`]*` \|/gm)].map((m) => m[1])
  );
  const implemented = new Set(
    [...SOURCE_TEXT.matchAll(/cmd === "(\/\w+)"/g)].map((m) => m[1])
  );
  for (const cmd of documented) {
    if (!implemented.has(cmd)) fail(`README документирует ${cmd}, но воркер её не обрабатывает`);
  }
  for (const cmd of implemented) {
    if (!documented.has(cmd)) fail(`воркер обрабатывает ${cmd}, но её нет в таблице команд README`);
  }
}

// --- 10. Deep-линки хаба в бота ------------------------------------------
// Карточки хаба ведут в бота по ?start=p_<name>. Ссылка живёт в index.html,
// а имя проекта — в projects.json, поэтому разъезжаются они молча: бот
// покажет меню вместо карточки.
const HUB = resolve(ROOT, "..", "index.html");
if (existsSync(HUB)) {
  const hubHtml = readFileSync(HUB, "utf8");
  const prefix = `${data.bot}?start=p_`;
  const deepLinks = [...hubHtml.matchAll(/href="([^"]*[?&]start=p_[^"]*)"/g)].map((m) => m[1]);
  if (deepLinks.length === 0) {
    fail("в index.html нет ни одной deep-ссылки в бота — карточки хаба не ведут в каталог");
  }
  for (const href of deepLinks) {
    if (!href.startsWith(prefix)) {
      fail(`deep-ссылка «${href}» ведёт не на ${prefix} — имя бота разошлось с projects.json`);
      continue;
    }
    const name = href.slice(prefix.length);
    if (!(data.projects || []).some((p) => p.name === name)) {
      fail(`deep-ссылка «${href}» ведёт на проект «${name}», которого нет в projects.json`);
    }
  }
}

if (problems.length) {
  console.error("Проверка воркера не пройдена:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `Воркер в порядке: ${(data.projects || []).length} проектов, ` +
    `${(data.projects || []).filter((p) => p.site).length} сайтов, ` +
    `${(data.projects || []).filter((p) => p.bot).length} ботов, ` +
    `${bindings.length} привязок, бандл соответствует данным.`
);
