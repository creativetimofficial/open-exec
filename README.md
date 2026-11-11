# Open Exec

<p align="center">
  <a href="https://www.creative-tim.com/ui/agent-starters?ref=open-exec_readme#open-exec">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://www.creative-tim.com/ui/agent-starters/open-exec/hero-dark.webp">
      <img src="https://www.creative-tim.com/ui/agent-starters/open-exec/hero-light.webp" alt="Open Exec running its labelled demo" width="100%">
    </picture>
  </a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license"></a>
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js 16"></a>
  <a href="https://github.com/NousResearch/hermes-agent"><img src="https://img.shields.io/badge/runs%20on-lite%20loop%20or%20Hermes%20Agent-blue" alt="Runs on a lite loop or Hermes Agent"></a>
  <a href="https://www.creative-tim.com/?ref=open-exec_readme"><img src="https://img.shields.io/badge/by-Creative%20Tim-orange" alt="By Creative Tim"></a>
</p>

<p align="center">
  <a href="https://www.creative-tim.com/ui/agent-starters?ref=open-exec_readme#open-exec"><b>Live page</b></a> ·
  <a href="https://www.creative-tim.com/ui/agent-starters?ref=open-exec_readme">All agent starters</a> ·
  <a href="https://www.creative-tim.com/ui/hermes?ref=open-exec_readme">Hosted Hermes agents</a> ·
  <a href="https://www.creative-tim.com/ui/build?ref=open-exec_readme">AI App Builder</a> ·
  <a href="https://companyfabric.com/templates/open-exec?ref=open-exec_readme">On CompanyFabric</a> ·
  <a href="https://companyfabric.com/dashboard/keys?ref=open-exec_readme">Get a model key</a>
</p>


An open-source executive assistant for your Gmail and Google Calendar. It triages the inbox, reads the threads that matter, finds free time, drafts replies and puts events on your calendar. Anything it saves waits for your approval first, and nothing is ever sent: replies land in Gmail as drafts, and you press Send.

Every tool call goes through one tool layer that applies the assistant's policy, asks you before anything the policy gates, and writes an audit row first. The policies also decide which Google permissions are requested: deny a tool in `assistant.config.ts` and Connect Google stops asking for its scope.

| | **Lite** | **Hermes** |
|---|---|---|
| Start | `pnpm dev` | `docker compose up` |
| Where the agent loop runs | in this Next.js server | in a [Hermes Agent](https://github.com/NousResearch/hermes-agent) container |
| Inbox triage, drafts, free time, events, approvals, audit | yes | yes |
| Memory across conversations (people, preferences) | no | yes |
| Morning brief on a schedule | no | Hermes cron works; this UI does not manage schedules yet |
| Serverless hosting (Vercel) | yes | no |

> **Status: early.** Verified in CI: install, typecheck, unit and contract tests (OAuth state and PKCE, sealed tokens, token refresh and revocation, draft headers, free-time search across time zones, approvals), production build, and Hermes starting with the assistant's tools loaded. The Gmail and Calendar calls are `implemented-untested` against live Google until someone runs them with a real OAuth client.

## Quick start (no Google, no key)

Needs Node.js 22.13+ (24 recommended; the Docker images use 24) and pnpm. From the repository root:

```bash
pnpm install
cp .env.example .env
pnpm dev
```

With no model key it runs a **DEMO** on a built-in sample mailbox (fictional people at example.com): it searches unread mail, reads the thread that matters, finds free time and drafts a reply, which waits for you to approve it. The tools, approval and audit are the real ones. One sample email contains a prompt injection, to show that the assistant reports it instead of obeying it.

Add a model key (same options as [Open Research](https://github.com/creativetimofficial/open-research#choose-a-model): CompanyFabric by default, OpenAI, or a local endpoint) and set `DEMO_DATA=true` to try a live model on the sample mailbox before connecting your own.

## Connect Google

Each deployment uses its **own** Google OAuth client, so your mail goes from Google to your server and nowhere else.

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and enable the **Gmail API** and the **Google Calendar API**.
2. Configure the OAuth consent screen. For yourself or a small team, leave it in **Testing** and add your Google accounts as test users. (A Google Workspace organisation can choose **Internal** instead.)
3. Create an **OAuth client ID** of type **Web application**, with the authorised redirect URI `http://localhost:3000/api/google/callback` (or your `APP_URL` + `/api/google/callback`).
4. Put the client ID and secret in `.env`, plus `TOKEN_KEY=$(openssl rand -hex 32)`, restart, and press **Connect Google** under Setup.

What to know about Google's rules:

- Gmail permissions are **restricted scopes**. An app in Testing works for up to 100 test users with no review, but Google shows an "unverified app" screen, and for External apps in Testing the refresh token expires after **7 days**, after which you connect again. Publishing the app for anyone to use requires Google's verification and, for Gmail, a security assessment.
- Google has no drafts-only permission: `gmail.compose` also allows sending. This app has no send tool, and the tool layer refuses any tool it does not know.
- Requested by default: `gmail.readonly`, `gmail.compose`, `calendar.readonly`, `calendar.events`, plus `openid email` to show which account is connected. Deny `mail.draft` and `calendar.create` and only the read-only scopes are requested.

Tokens are stored in SQLite sealed with AES-256-GCM under `TOKEN_KEY`. Disconnect revokes them at Google and deletes them. If Google revokes access, the app forgets the account and asks you to connect again.

## Run with Hermes

```bash
cp .env.example .env    # model key, HERMES_API_KEY and TOOL_TOKEN (openssl rand -hex 32), Google, TOKEN_KEY
docker compose up --build
```

Hermes runs each turn and calls the assistant's tools back over MCP (`/api/mcp`, bearer `TOOL_TOKEN`), so policies, approvals and the audit log are the same as in lite mode, and Google tokens never reach the Hermes container. Hermes' own terminal, file, browser and web tools are off in `hermes/config.yaml`, and its Google Workspace skill is not used, because its calls would bypass the policies.

## Safety

- **No login by default.** The app is for one person, and once Google is connected, whoever can open it can read the mailbox. The compose file binds it to `127.0.0.1`. Set `APP_PASSWORD` whenever it is reachable from anywhere else.
- **One Google account per deployment.** For a hosted demo that strangers can try, run it with `DEMO_DATA=true` and no Google client: it then works only on the sample mailbox. Every real user runs their own deployment with their own OAuth client.
- Email bodies, calendar text and web pages are passed to the model marked as data. The assistant is told never to follow instructions in them, and the tools that act (drafts, events) need your approval anyway, with the exact recipients, subject and body (or times and attendees) shown on the approval card.
- Event creation sends no invitation emails (`sendUpdates=none`).

## Change the assistant

`assistant.config.ts` holds the instructions, a policy per tool (`allow`, `approve`, or deny by leaving it out) and limits.

| Tool id | What it does | Google scope |
|---|---|---|
| `mail.search` | Gmail search (Gmail query syntax) | gmail.readonly |
| `mail.read` | read a whole thread | gmail.readonly |
| `mail.draft` | save a draft, optionally as a reply in a thread | gmail.compose |
| `calendar.list` | events between two times | calendar.readonly |
| `calendar.find_time` | free windows on weekdays in working hours, in your time zone | calendar.readonly |
| `calendar.create` | create an event, no invitations sent | calendar.events |
| `search.web`, `page.read` | web search and page reading, as in Open Research | none |

## How it is built

```
assistant.config.ts        identity, instructions, tool policies, limits
src/lib/tools.ts           the mail and calendar tools, their Google scopes, free-time search
src/lib/backend.ts         where mail and calendar come from: Google, or the sample mailbox
src/lib/google/            OAuth (PKCE, one-time state, sealed tokens, refresh), Gmail + Calendar REST
src/lib/sample.ts          the sample mailbox and calendar
src/lib/demo.ts            the scripted DEMO turn
src/proxy.ts               the optional APP_PASSWORD gate
packages/kit/                    shared with every starter: tool broker, runtimes, MCP server, search, SQLite
```

## Tests

```bash
pnpm test
```

## License

MIT. See `LICENSE` and `NOTICE`.

Not affiliated with Google, or with any company whose products offer AI assistants.


## More open-source agent starters

Free and MIT, from the same kit: one tool layer, approvals, an audit log, and a labelled demo with no keys. See them all on the [agent starters page](https://www.creative-tim.com/ui/agent-starters?ref=open-exec_readme).

| | |
|---|---|
| [Open Research](https://github.com/creativetimofficial/open-research?ref=open-exec_readme) | Research with numbered citations you can check |
| [Open Coworkers](https://github.com/creativetimofficial/open-coworkers?ref=open-exec_readme) | Specialist AI coworkers with their own permissions and hand-offs |
| [Social Autopilot](https://www.creative-tim.com/ui/agent-starters?ref=open-exec_readme#open-social) (coming soon) | Research, write and schedule posts for your channels |

## More from Creative Tim

Want it without running anything yourself? These are live on [creative-tim.com](https://www.creative-tim.com/?ref=open-exec_readme).

**Build with AI**

| | |
|---|---|
| [AI App Builder](https://www.creative-tim.com/ui/build?ref=open-exec_readme) | Websites, dashboards, slide decks and ads from one prompt. Edit right on the page, deploy in one click. |
| [App examples](https://www.creative-tim.com/ui/examples?ref=open-exec_readme) | Finished apps to remix as your starting point |
| [Discover](https://www.creative-tim.com/ui/discover?ref=open-exec_readme) | Apps other people built, ready to remix |
| [AI Video Studio](https://www.creative-tim.com/ui/build/video-ecomm?ref=open-exec_readme) | One product photo in; product images and a short video out |

**Hosted agents**

| | |
|---|---|
| [Hermes Agent hosting](https://www.creative-tim.com/ui/hermes?ref=open-exec_readme) | A Hermes agent with memory and web tools, running in the cloud |
| [Spawn an AI agent](https://www.creative-tim.com/ui/spawn-agent?ref=open-exec_readme) | Any role you need, in a minute |
| [Hire an AI employee](https://www.creative-tim.com/ui/hire-ai-employee?ref=open-exec_readme) | Ready-made roles that are always on |

**For developers**

| | |
|---|---|
| [Skills.md & Stacks](https://www.creative-tim.com/ui/skills?ref=open-exec_readme) | Skills for Claude Code, Cursor and Codex |
| [Creative Tim UI](https://www.creative-tim.com/ui/blocks?ref=open-exec_readme) | shadcn/ui blocks for your app, v0 and Lovable |
| [Registry and MCP](https://www.creative-tim.com/ui/docs/registry?ref=open-exec_readme) | Install the blocks from coding agents over MCP |
| [Claude Code guide](https://www.creative-tim.com/ui/learn/claude-code?ref=open-exec_readme) | From your first prompt to agents that ship |
| [AI tool comparisons](https://www.creative-tim.com/ui/compare?ref=open-exec_readme) and [cheatsheets](https://www.creative-tim.com/ui/cheatsheet?ref=open-exec_readme) | Pick the right tool, and its shortcuts on one page |
| [CompanyFabric](https://companyfabric.com/?ref=open-exec_readme) | One key for every major model, the default model route for this starter: [get a key](https://companyfabric.com/dashboard/keys?ref=open-exec_readme), [models and pricing](https://companyfabric.com/models?ref=open-exec_readme) |
| [CompanyFabric templates](https://companyfabric.com/templates?ref=open-exec_readme) | This starter and the others, ready to run with your CompanyFabric key |
| [Premium templates](https://www.creative-tim.com/templates/premium?ref=open-exec_readme) | React, Next.js, Vue and HTML templates and dashboards |

Contributing: see [CONTRIBUTING.md](CONTRIBUTING.md). Security: see [SECURITY.md](SECURITY.md).
