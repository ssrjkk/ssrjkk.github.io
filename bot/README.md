# ssrjkk bot

Telegram catalogue of my projects, sites and bots: [@ssrjkk_bot](https://t.me/ssrjkk_bot).

The bot is a Cloudflare Worker. Project data lives in [`projects.json`](projects.json), the bundle in
`cloudflare-worker/worker.js` is built from `src/worker.js` with esbuild, and the worker keeps language
preferences, the star cache and anonymous usage events in KV and D1.

- [GitHub profile](https://github.com/ssrjkk)
- [Projects hub](https://ssrjkk.github.io/)
- [Telegram](https://t.me/ssrjkk)

## What it shows

Every project entry can carry a repository, a live site, a Telegram bot and a screenshot. Cards render
whatever is present, so a project without a public site does not get a dead button.

Commands:

| Command | What it does |
| --- | --- |
| `/start` | Menu with projects, sites, bots, links and language switch |
| `/projects` | Three project cards per page, each opens a detail view |
| `/sites` | URL buttons for all project sites |
| `/bots` | URL buttons for all Telegram bots |
| `/search <query>` | Search by name, stack or description, RU and EN |
| `/top` | Top three projects by GitHub stars |
| `/links` | GitHub, Telegram, hub and bot catalogue |
| `/channels` | Telegram channels |
| `/about` | Short profile |
| `/stats` | Owner only: users, messages, commands, referrals |
| `/myid` | Chat ID |
| `/help` | Command list |

The bot also answers inline queries: projects with screenshots come back as photo results, the rest as
articles with site, repository and bot buttons.

## Data

[`projects.json`](projects.json) is the only place to edit content. Each entry:

```json
{
  "name": "shopwatch",
  "title": "Watchop",
  "lang": "JavaScript, Node.js",
  "stars": 0,
  "desc": "Russian description",
  "desc_en": "English description",
  "repo": "https://github.com/ssrjkk/shopwatch",
  "site": "https://ssrjkk.github.io/shopwatch/",
  "bot": "https://t.me/wwwatchshop_bot",
  "shot": "https://raw.githubusercontent.com/ssrjkk/ssrjkk/main/assets/shots/shopwatch.jpg"
}
```

`site`, `bot` and `shot` are optional. Screenshots are served from the profile repository on `main`, which
is reachable by Telegram without a token. `stars` is the fallback value — the worker refreshes real counts
from the GitHub API and caches them for an hour. `"private": true` keeps the repository link out of public
cards while the entry stays in the catalogue.

After editing, rebuild and run the checks:

```bash
npm ci
npm run build
npm run check
npm test
```

`npm run check` verifies the data shape, every URL, the screenshot host, unique project names, that the
bundle contains the current data, the wrangler bindings and secrets, and that no token was committed.

## Local development

Node 20 or newer.

```bash
npm ci
npm run build     # src/worker.js + projects.json -> cloudflare-worker/worker.js
npm test          # 18 tests against the built bundle, Telegram and GitHub are mocked
```

The worker expects four secrets, set with `wrangler secret put` and never committed:

- `BOT_TOKEN` — from [@BotFather](https://t.me/BotFather)
- `OWNER_ID` — Telegram user ID for `/stats` and `/broadcast`, the bot reports it with `/myid`
- `SETUP_KEY` — query key for the one-time `/setup` call
- `WEBHOOK_SECRET` — value Telegram sends in `X-Telegram-Bot-Api-Secret-Token`

Bindings in [`cloudflare-worker/wrangler.toml`](cloudflare-worker/wrangler.toml):

- KV `BOT_KV` — language preferences, star cache
- D1 `BOT_DB` — `events (user_id, kind, value, ts)` for stats, top users and referrals

## Deploy

```bash
npm run build
cd cloudflare-worker
npx wrangler deploy
```

Then point Telegram at the worker once:

```text
https://<worker-host>/setup?key=<SETUP_KEY>
```

`/setup` calls `setWebhook` with the secret header and uploads the command list. `GET /health` returns `OK`;
`GET /` returns the catalogue size as JSON.

## Structure

```text
src/worker.js                 worker source
projects.json                 project, site, bot and link data
cloudflare-worker/worker.js   built bundle (committed, deployed as is)
cloudflare-worker/wrangler.toml
scripts/check-bundle.mjs      data and bundle checks
tests/worker.test.mjs         node:test suite
```

## Русский

[`@ssrjkk_bot`](https://t.me/ssrjkk_bot) — каталог моих проектов, сайтов и ботов в Telegram. Воркер на
Cloudflare Workers, данные в [`projects.json`](projects.json), сборка esbuild, состояние в KV и D1.

Команды: `/projects` — карточки проектов со скриншотами и ссылками, `/sites` — все сайты, `/bots` — все
боты, `/search` — поиск по названию, стеку и описанию, `/top` — топ по звёздам, `/links` и `/channels` —
ссылки и каналы, `/stats` — статистика для владельца.

Правка контента: изменить `projects.json`, затем `npm run build && npm run check && npm test`.
Секреты (`BOT_TOKEN`, `OWNER_ID`, `SETUP_KEY`, `WEBHOOK_SECRET`) задаются через `wrangler secret put` и в
репозиторий не попадают. Деплой: `npm run build`, затем `npx wrangler deploy` из `cloudflare-worker`.

## Author

SSRJKK — [GitHub](https://github.com/ssrjkk) · [Telegram](https://t.me/ssrjkk) ·
[Projects hub](https://ssrjkk.github.io/) · [@ssrjkk_bot](https://t.me/ssrjkk_bot)
