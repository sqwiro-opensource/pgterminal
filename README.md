# pgui

A PostgreSQL workbench for the sqwiro fleet, with first-class **document links**.

Every sqwiro table carries a generated `_id` column holding `schema_table/id` (for example
`sales_customer/42`). pgui treats any value shaped like `table/id` or `schema_table/id` — in a
grid cell, inside nested `jsonb`, in a SQL string literal — as a link you can follow to the row it
names, and every document can show you what references it, through foreign keys and through
`jsonb` scans.

Built with Electron, React and TypeScript. Several servers and databases stay connected at once;
each server has an overview page (sessions, locks, sizes, slow queries) and the fleet has a
combined one.

## Screenshots and design

The design mockups are self-contained HTML pages. Open the gallery:

```bash
open .claude/designs/index.html
```

The specifications live beside them:

- [`.claude/specs/requirement.html`](.claude/specs/requirement.html) — vision, user stories with
  EARS acceptance criteria, architecture, the full IPC contract, data models, the document-link
  resolver, correctness properties, non-functional requirements and technical decisions.
- [`.claude/specs/plan.html`](.claude/specs/plan.html) — the phased implementation plan.

## Requirements

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | 20 or newer | build tooling, CI |
| bun (or yarn) | 1.1+ | dependency install and scripts |
| Docker | any recent | the integration-test Postgres |

## Development

```bash
bun install
bun run dev
```

### If Electron fails to launch

`bun install` does not run the Electron package's `postinstall`, so `node_modules/electron/dist`
can be left empty. Download the binary explicitly:

```bash
rm -rf node_modules/electron/dist node_modules/electron/path.txt
node node_modules/electron/install.js
```

### If macOS reports the Electron binary as malware

Two separate things cause this, and neither means the download is bad:

1. **Revoked notarization.** Apple revokes the notarization ticket of an Electron build when
   malware is found signed with it. Any copy of that version is then blocked. Electron 31.x is
   affected; this project pins a current major for that reason. Check with:
   `spctl --assess --type execute -vv node_modules/electron/dist/Electron.app`
2. **A half-finished ad-hoc signature.** Electron ships the prebuilt development app
   ad-hoc/linker-signed with no `_CodeSignature` directory, so verification reports
   *"code has no resources but signature indicates they must be present"*.

First confirm the download is the official one by comparing it against the checksum the package
ships (`node_modules/electron/checksums.json`):

```bash
shasum -a 256 ~/Library/Caches/electron/*/electron-v<version>-darwin-arm64.zip
```

Once the checksum matches, complete the ad-hoc signature locally so the bundle verifies:

```bash
codesign --force --deep --sign - node_modules/electron/dist/Electron.app
codesign --verify --strict node_modules/electron/dist/Electron.app   # silence means valid
```

Do not work around this by pointing at another project's Electron
(`ELECTRON_OVERRIDE_DIST_PATH`); that spreads the damaged copy rather than fixing it.

## Testing

Unit tests (pure modules: statement splitter, document-link parser and ranker, SQL builders,
store slices, formatters) need nothing running:

```bash
bun run test:unit
```

Integration tests run against a disposable Postgres 16:

```bash
docker compose -f docker-compose.test.yml up -d   # port 54329, user/pass/db pgui/pgui/pgui_test
bun run test:integration
```

The seed (`tests/integration/seed.sql`) contains:

- `sales.sales_customer` — generated `_id`, `jsonb` `meta` with nested references, NULLs, a name
  containing an apostrophe.
- `sales.sales_order` — a foreign key to the customer, a text `customer_ref`, and `payload` jsonb
  holding references at depth.
- `sales.customer` — a view over the customer table, for link-resolution ranking.
- `auth.auth_user`, `public.users` (uuid primary key), `a.dup` / `b.dup` (ambiguity fixtures).
- `public.big` — one million rows with `numeric(30,10)`, bigints above 2^53 and `jsonb`, for the
  paging, streaming and precision tests.
- `tests/integration/manyTables.sql` — schema `many` with 2,000 tables, for catalog timing.

Everything at once:

```bash
bun run typecheck && bun run test && bun run build
```

## Building and releasing

```bash
bun run build          # compile main, preload and renderer into out/
bun run build:mac      # or build:win / build:linux → dist/
```

Before shipping:

1. **Replace the update URL.** `electron-builder.yml` publishes to
   `https://updates.example.invalid/pgui`, a deliberate placeholder. Point it at the real host.
2. **Code signing.** macOS builds use the hardened runtime with
   `build/entitlements.mac.plist` (JIT and unsigned-memory entitlements only — no camera or
   microphone). Set `CSC_LINK` and `CSC_KEY_PASSWORD`, and set `mac.notarize` to your notarization
   config, to distribute outside your own machine.
3. Auto-update is silent: the app downloads in the background and shows a toast with a **Restart**
   action. There are no modal dialogs. Update checks are skipped in development unless you set
   `PGUI_FORCE_UPDATE_CHECK=1`, which uses `dev-app-update.yml` (a local server on port 8788).

## Architecture

```
src/shared/    types, the IPC contract, and pure logic used by both sides
               (document-link parser/ranker, statement splitter, identifier quoting)
src/main/      connection registry and pools, credential vault, query runner, catalog service,
               DDL and stats services, row fetch/mutation builders, persistence
src/preload/   the only bridge: an allow-listed window.pgui built from the contract
src/renderer/  React UI — shell, tabs, grid, Monaco editor, zustand store
```

**Security posture.** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, a
strict Content-Security-Policy (`script-src 'self'`, no eval, no remote origins), navigation
blocked, external links restricted to http(s), and a single-instance lock. The renderer never sees
the raw `ipcRenderer`: `window.pgui` exposes exactly the channels in `src/shared/ipc.ts`. The
renderer also never builds SQL for writes — identifiers are quoted with `pg-format` and values are
always bound parameters, in the main process.

**Data directory** (`app.getPath('userData')`, e.g. `~/Library/Application Support/pgui`):

| File | Contents |
| --- | --- |
| `connections.json` | connection metadata — never a password |
| `vault.json` | passwords encrypted with Electron `safeStorage` (OS keychain backed) |
| `settings.json` | preferences |
| `workspace.json` | open tabs, active tab, sidebar state |
| `history.json` | query history (capped by count and age) |

If the OS keychain is unavailable (for example a Linux `basic_text` backend), pgui refuses to
write the password to disk and keeps it in memory for the session only.
