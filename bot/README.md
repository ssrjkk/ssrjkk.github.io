# ssrjkk bot

Telegram catalogue of my projects, sites and bots: [@ssrjkk_bot](https://t.me/ssrjkk_bot).

The bot lives in this repository under `bot/`, next to the [projects hub](https://ssrjkk.github.io/)
it catalogues. It is a Cloudflare Worker. Project data lives in [`projects.json`](projects.json), the
bundle in `cloudflare-worker/worker.js` is built from `src/worker.js` with esbuild, and the worker keeps
language preferences, the star cache and anonymous usage events in KV and D1.

- [Source (bot/)](https://github.com/ssrjkk/ssrjkk.github.io/tree/main/bot)
- [Projects hub](https://ssrjkk.github.io/)
- [GitHub profile](https://github.com/ssrjkk)
- [Telegram](https://t.me/ssrjkk)

## What it shows

Every project entry can carry a repository, a live site, a Telegram bot and a screenshot. Cards render
whatever is present, so a project without a public site does not get a dead button.

Commands:

| Command | What it does |
| --- | --- |
| `/start` | Menu with projects, sites, bots, links and language switch |
| `/projects` | Three project cards per page plus stack facets, each card opens a detail view |
| `/news` | Pushes, releases and pull requests from the public profile feed |
| `/sites` | URL buttons for all project sites |
| `/bots` | URL buttons for all Telegram bots |
| `/search <query>` | Search by name, stack or description, RU and EN |
| `/top` | Top three projects by GitHub stars |
| `/links` | GitHub, Telegram, hub and bot catalogue |
| `/channels` | Telegram channels |
| `/about` | Short profile |
| `/feedback <text>` | Forward the text to the owner |
| `/stats` | Owner only: users, messages, opens, inline picks, week bars, top projects, referrers |
| `/broadcast <text>` | Owner only: send text to every user the bot has seen |
| `/myid` | Chat ID |
| `/help` | Command list |

The bot also answers inline queries: projects with screenshots come back as photo results, the rest as
articles with site, repository and bot buttons.

`/projects` ends with a facet row built from the `lang` field of the catalogue — the six most common stacks,
each filter paging inside itself — so a new technology shows up in the filter without a code change. `/news`
renders pushes, releases, branch and tag creation and deletion, and pull requests from the public profile
event feed, one line per repository and action, and caches the rendered descriptors — not the raw events —
in KV. Events draw from the same 60 requests per hour GitHub budget as the star counts, so an entry stays
readable for a day after its 15 minutes of freshness: a rate limit or a `202` from a feed that is still being
generated cannot blank the section. Unauthenticated event payloads carry no commit list, so a push line names
the branch rather than a commit count. Every detail card has a share button opening `t.me/share/url` with
that project's own `?start=p_` link. `/setup` registers the command menu once per language scope, so Telegram
autocompletes `/news` in Russian or English according to the client language. `/feedback <text>` delivers the
note to the owner chat with the author's ID, HTML-escaped and cut to 900 characters; without `OWNER_ID` it
says it did not send anything.

## Deep links

`https://t.me/ssrjkk_bot?start=p_<name>` opens that project's card directly, and
`?start=ref_<user id>` credits the inviter in `/stats` once and never the invitee. Every card on the
[hub](https://ssrjkk.github.io/) carries a `?start=p_` link, and each detail card in the bot has an invite
button that builds a personal `?start=ref_` link for the reader. `npm run check` fails if a hub link points
at a project the catalogue does not have.

## Data

[`projects.json`](projects.json) is the only place to edit content: `github`, `hub`, `bot` (the catalogue
bot itself, used to build invite links), `projects`, `channels` and `links`. Each project entry:

```json
{
  "name": "wake",
  "title": "Wake",
  "lang": "Python, TS",
  "stars": 0,
  "desc": "Russian description",
  "desc_en": "English description",
  "repo": "https://github.com/ssrjkk/wake",
  "site": "https://wake-7k6.pages.dev",
  "bot": "https://t.me/waketrade_bot",
  "shot": "https://raw.githubusercontent.com/ssrjkk/ssrjkk/main/assets/shots/wake.jpg"
}
```

`site`, `bot` and `shot` are optional. Screenshots are served from the profile repository on `main`, which
is reachable by Telegram without a token. `stars` is the fallback value — the worker refreshes real counts
from the GitHub API and caches them for an hour; when the API answers nothing for a project (rate limit on
an unauthenticated IP) the card keeps `stars` instead of showing 0. `"private": true` keeps the repository
link out of public cards while the entry stays in the catalogue. A project's `repo` must equal
`https://github.com/ssrjkk/<name>` — the bundle check enforces it.

After editing, rebuild and run the checks from `bot/`:

```bash
npm ci
npm run build
npm run check
npm test
```

`npm run check` verifies the data shape, every URL, the screenshot host, unique project names, that the
bundle contains the current data, the wrangler bindings and secrets, that no token was committed, that the
README only documents commands and workflows that exist, and that every `?start=p_` link on the hub opens a
project the catalogue has.

## Local development

Node 20 or newer. All commands run from `bot/` (from the repository root: `cd bot`).

```bash
npm ci
npm run build     # src/worker.js + projects.json -> cloudflare-worker/worker.js
npm test          # node:test suite against the built bundle, Telegram and GitHub are mocked
```

The worker expects four secrets, set with `wrangler secret put` and never committed:

- `BOT_TOKEN` — from [@BotFather](https://t.me/BotFather)
- `OWNER_ID` — Telegram user ID for `/stats`, `/broadcast` and the target of `/feedback`, the bot reports it with `/myid`
- `SETUP_KEY` — query key for the one-time `/setup` call
- `WEBHOOK_SECRET` — value Telegram sends in `X-Telegram-Bot-Api-Secret-Token`

Bindings in [`cloudflare-worker/wrangler.toml`](cloudflare-worker/wrangler.toml):

- KV `BOT_KV` — language preferences, star cache, news cache
- D1 `BOT_DB` — `events (user_id, kind, value, ts)`, where `kind` is `msg`, `cmd`, `search`, `open`
  (a project card), `nav` (a menu section or a `stack:<tech>` filter), `lang`, `inline` (an inline result
  picked in another chat), `feedback` (a note delivered to the owner) and `ref` (who invited this user)

## Deploy

From the repository root:

```bash
cd bot
npm run build
cd cloudflare-worker
npx wrangler deploy
```

Then point Telegram at the worker once:

```text
https://<worker-host>/setup?key=<SETUP_KEY>
```

`/setup` calls `setWebhook` with the secret header and uploads the command list for both language scopes.
`GET /health` returns `OK`; `GET /` returns the catalogue size as JSON.

A reply is not dropped because Telegram was busy: a `429` or a `502`/`503`/`504` is repeated up to three
times, waiting the `parameters.retry_after` the API asks for, with the whole pause capped at three seconds —
a webhook handler that hangs costs more than a lost message. A `500` is never repeated: the send may already
have happened, and a retry would put a duplicate in the chat.

## Live smoke

```bash
npm run smoke     # WORKER_URL overrides the deployed worker it asks
```

Three questions to the production worker: `GET /health` answers `OK`, `GET /` reports the same `projects`,
`sites` and `bots` counts as `projects.json`, and `POST /webhook` without the secret header answers `403`.
A transport error or a 5xx is retried three times, because a new version can still be spreading across the
edge; any other status is an answer, so it is not retried. Every check reports what it saw and any red one
exits non-zero — `.github/workflows/bot-prod-smoke.yml` runs it hourly and on demand. The checks are unit
tested against a mocked worker, including the three ways they are supposed to fail.

## Structure

Paths relative to the repository root:

```text
bot/src/worker.js                 worker source
bot/projects.json                 project, site, bot and link data
bot/cloudflare-worker/worker.js   built bundle (committed, deployed as is)
bot/cloudflare-worker/wrangler.toml
bot/scripts/check-bundle.mjs      data and bundle checks
bot/scripts/smoke-prod.mjs        live checks against the deployed worker
bot/tests/worker.test.mjs         node:test suite
bot/tests/smoke.test.mjs          node:test suite for the smoke checks
```

CI for the bot is `.github/workflows/bot-ci.yml` (build, bundle diff, check, test), scoped to `bot/`, and
`.github/workflows/bot-prod-smoke.yml` (the live smoke above, hourly and on demand).
CodeQL runs through GitHub's default setup for the repository, so there is no committed CodeQL workflow.
The hub's own live-status workflow is separate.

## Русский

[`@ssrjkk_bot`](https://t.me/ssrjkk_bot) — каталог моих проектов, сайтов и ботов в Telegram. Воркер на
Cloudflare Workers лежит в этом репозитории в `bot/`, рядом с хабом. Данные в [`projects.json`](projects.json),
сборка esbuild, состояние в KV и D1.

Команды: `/projects` — карточки проектов со скриншотами и ссылками, внизу строка фасетов по стеку (шесть
самых частых технологий из `projects.lang`, пагинация остаётся внутри фильтра), `/news` — пуши, релизы и
pull request из публичной ленты профиля, по строке на пару «репозиторий — событие»; запись свежа 15 минут
и живёт в KV сутки, поэтому лимит GitHub не обнуляет раздел, `/sites` — все сайты, `/bots` — все боты,
`/search` — поиск по
названию, стеку и описанию, `/top` — топ по звёздам, `/links` и `/channels` — ссылки и каналы,
`/feedback <текст>` — сообщение владельцу (экранируется и режется до 900 символов), `/stats` — статистика для
владельца: пользователи, сообщения, открытия карточек, выборы из inline, отзывы, неделя по дням, топ
проектов и кто кого пригласил. Меню команд регистрируется отдельно для `ru` и `en`, поэтому подсказки Telegram
переведены.

Deep-ссылки: `https://t.me/ssrjkk_bot?start=p_<name>` сразу открывает карточку проекта,
`?start=ref_<user id>` один раз засчитывает пригласившего. С карточек хаба ведут ссылки `?start=p_`,
а в карточке бота есть «Поделиться» с той же ссылкой проекта и «Пригласить» с личной `?start=ref_`.
`npm run check` ловит расхождение: имя проекта в ссылке хаба должно быть в каталоге.

Правка контента: изменить `projects.json`, затем из `bot/`: `npm run build && npm run check && npm test`.
Секреты (`BOT_TOKEN`, `OWNER_ID`, `SETUP_KEY`, `WEBHOOK_SECRET`) задаются через `wrangler secret put` и в
репозиторий не попадают. Деплой: `cd bot && npm run build`, затем `npx wrangler deploy` из
`bot/cloudflare-worker`.

Ответ бота не теряется из-за лимита Telegram: `429` и `502`/`503`/`504` повторяются до трёх раз с паузой из
`parameters.retry_after`, суммарно не дольше трёх секунд — висящий вебхук дороже потерянного сообщения. `500`
не повторяем: под ним сообщение могло уже уйти, а повтор — это дубликат в чате.

Смоук по проду: `npm run smoke` (`WORKER_URL` меняет адрес) задаёт живому воркеру три вопроса — `/health`
отвечает `OK`, `GET /` отдаёт те же счётчики, что и `projects.json`, `POST /webhook` без секрета отвечает
`403`. Сетевой сбой и 5xx повторяются трижды (версия могла ещё не разъехаться по edge), другой статус — это
ответ, его не повторяют. Любая красная проверка выходит кодом 1;
`.github/workflows/bot-prod-smoke.yml` гоняет смоук раз в час и по кнопке, а сами проверки покрыты тестами,
включая три способа, которыми они должны падать.

## Author

SSRJKK — [GitHub](https://github.com/ssrjkk) · [Telegram](https://t.me/ssrjkk) ·
[Projects hub](https://ssrjkk.github.io/) · [@ssrjkk_bot](https://t.me/ssrjkk_bot)
