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
| `/projects` | Three project cards per page, each opens a detail view |
| `/sites` | URL buttons for all project sites |
| `/bots` | URL buttons for all Telegram bots |
| `/search <query>` | Search by name, stack or description, RU and EN |
| `/top` | Top three projects by GitHub stars |
| `/links` | GitHub, Telegram, hub and bot catalogue |
| `/channels` | Telegram channels |
| `/about` | Short profile |
| `/stats` | Owner only: users, messages, commands, referrals |
| `/broadcast <text>` | Owner only: send text to every user the bot has seen |
| `/myid` | Chat ID |
| `/help` | Command list |

The bot also answers inline queries: projects with screenshots come back as photo results, the rest as
articles with site, repository and bot buttons.

## Data

[`projects.json`](projects.json) is the only place to edit content. Each entry:

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
from the GitHub API and caches them for an hour. `"private": true` keeps the repository link out of public
cards while the entry stays in the catalogue. A project's `repo` must equal
`https://github.com/ssrjkk/<name>` — the bundle check enforces it.

After editing, rebuild and run the checks from `bot/`:

```bash
npm ci
npm run build
npm run check
npm test
```

`npm run check` verifies the data shape, every URL, the screenshot host, unique project names, that the
bundle contains the current data, the wrangler bindings and secrets, and that no token was committed.

## Local development

Node 20 or newer. All commands run from `bot/` (from the repository root: `cd bot`).

```bash
npm ci
npm run build     # src/worker.js + projects.json -> cloudflare-worker/worker.js
npm test          # node:test suite against the built bundle, Telegram and GitHub are mocked
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

`/setup` calls `setWebhook` with the secret header and uploads the command list. `GET /health` returns `OK`;
`GET /` returns the catalogue size as JSON.

## Structure

Paths relative to the repository root:

```text
bot/src/worker.js                 worker source
bot/projects.json                 project, site, bot and link data
bot/cloudflare-worker/worker.js   built bundle (committed, deployed as is)
bot/cloudflare-worker/wrangler.toml
bot/scripts/check-bundle.mjs      data and bundle checks
bot/tests/worker.test.mjs         node:test suite
```

CI for the bot is `.github/workflows/bot-ci.yml` (build, bundle diff, check, test), scoped to `bot/`.
CodeQL runs through GitHub's default setup for the repository, so there is no committed CodeQL workflow.
The hub's own live-status workflow is separate.

## Русский

[`@ssrjkk_bot`](https://t.me/ssrjkk_bot) — каталог моих проектов, сайтов и ботов в Telegram. Воркер на
Cloudflare Workers лежит в этом репозитории в `bot/`, рядом с хабом. Данные в [`projects.json`](projects.json),
сборка esbuild, состояние в KV и D1.

Команды: `/projects` — карточки проектов со скриншотами и ссылками, `/sites` — все сайты, `/bots` — все
боты, `/search` — поиск по названию, стеку и описанию, `/top` — топ по звёздам, `/links` и `/channels` —
ссылки и каналы, `/stats` — статистика для владельца.

Правка контента: изменить `projects.json`, затем из `bot/`: `npm run build && npm run check && npm test`.
Секреты (`BOT_TOKEN`, `OWNER_ID`, `SETUP_KEY`, `WEBHOOK_SECRET`) задаются через `wrangler secret put` и в
репозиторий не попадают. Деплой: `cd bot && npm run build`, затем `npx wrangler deploy` из
`bot/cloudflare-worker`.

## Author

SSRJKK — [GitHub](https://github.com/ssrjkk) · [Telegram](https://t.me/ssrjkk) ·
[Projects hub](https://ssrjkk.github.io/) · [@ssrjkk_bot](https://t.me/ssrjkk_bot)
