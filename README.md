# BuildView

> **AI Software Architecture Visualizer & Real-time Execution Tracker via MCP**

BuildView connects coding agents (Claude, Antigravity, Cursor, Windsurf) via the **Model Context Protocol (MCP)** to visualize planned software architectures, inspect component API anatomy, enforce layer-by-layer build sequencing, track live file deltas, and flag architectural gaps in real time.

---

## Key Capabilities

1. **Precision Blueprint Visualization**
   - Built with an industrial, high-information-density workbench design system (leveraged from [`AgentMonitor`](https://github.com/rudraptpsingh/AgentMonitor) and [`ui-ux-pro-max-skill`](https://github.com/rudraptpsingh/ui-ux-pro-max-skill)).
   - Clean, tactile, high-contrast aesthetic: zero AI neon gradient slop or distracting animations.
   - Restrained semantic status signals (`VERIFIED` emerald, `BUILDING` cobalt, `GAP ALERT` amber, `PLANNED` neutral).

2. **Deep Component Anatomy & Contracts**
   - **Data Members & Properties**: access modifiers (`public`, `private`), types, and descriptions.
   - **Callable API Methods**: signatures, return types, parameter types, async flags, and documentation.
   - **State & Lifecycle**: internal reactive state variables, initial values, and lifecycle phases.
   - **Call Graph & Contracts**: explicit incoming callers ("Who can call this") and outbound dependencies ("What this calls").

3. **Layered Sequencing & AI Roadmap Guidance**
   - Organizes components into architectural layers (e.g., Layer 0: Storage/Protocol → Layer 1: Core Engine → Layer 2: CLI/Interface).
   - The `buildview_get_roadmap` MCP tool guides coding agents to complete foundational layers and highest-priority (`P1`) components before higher-level facades.

4. **Live File Tracking & Hover Peeker**
   - Hover over any component card to preview created and modified files, change counts (`+142`), and commit notes.
   - Click to copy file paths directly to clipboard.

5. **Architectural Gap Auditor & Prune Table**
   - Interactive **Gaps & Prune Inspection Table** with search and filters (`ALL`, `GAPS`, `PRUNE`, `DUPLICATES`, `CLEAN`).
   - Coding agents and developers can flag architectural gaps, missing error handling, and unhandled contracts via `buildview_report_gap`.
   - Visualizer escalates component status to amber alert, prioritizing gap resolution before proceeding to subsequent layers.

6. **AST Code Waste & Dead Code Detection**
   - Scans full repository AST for unused exports, $\ge 90\%$ duplicate function implementations, test zombies, and orphan files.
   - Computes component Cleanliness Scores and provides pruning guidance for coding agents.

7. **Minimalist Circle & Directed Edge DAG Graph**
   - High-density DAG architecture graph with circular nodes, directional Bezier edges, and layer swimlanes.
   - **Focused Inspection Mode**: Spotlights incoming callers (Emerald) and outgoing callees (Blue) on hover/selection while gracefully dimming unrelated nodes.
   - Docked inspector card with 1-click drawer deep-linking.

8. **Universal Production Codebase Architecture Mapping**
   - Auto-clusters any arbitrary repository into 6 layers (foundation, domain, state/IPC, presentation, tests, build tooling), mapping source files, LOC, and correlated test suites. Tests and tooling are kept out of product rules; see [Rules & What `check` Reports](#rules--what-check-reports).

---

## Architecture & Design Tokens (TDD Validated)

All visual tokens (`STATUS_TOKENS`, `SEVERITY_TOKENS`, `LAYER_ACCENTS`) are defined in a single source of truth in [`src/shared/tokens.ts`](src/shared/tokens.ts) and verified through automated tests:

```typescript
// Example: Validating architectural component compliance
const result = TokenEngine.validateCompliance(component);
// { valid: true, errors: [] }
```

### Shared Reusable UI Kit
- [`src/client/src/components/ui/StatusBadge.tsx`](src/client/src/components/ui/StatusBadge.tsx): Canonical status pill (`.pill.blue`, `.pill.green`, `.pill.amber`).
- [`src/client/src/components/ui/SeverityBadge.tsx`](src/client/src/components/ui/SeverityBadge.tsx): Canonical gap severity indicator.
- [`src/client/src/components/ui/ProgressBar.tsx`](src/client/src/components/ui/ProgressBar.tsx): Precision debossed well progress bar.

---

## MCP Tools Reference

BuildView exposes planning/tracking and code-analysis tools for AI coding agents. Start delivery planning with its planning contract:

| MCP Tool | Description |
|---|---|
| `buildview_get_planning_contract` | Get the schema, concrete-plan template, evidence requirements and agent workflow |
| `buildview_plan_project` | Validate an in-repo JSON roadmap and automatically map dependencies into parallel phases; report missing planning details |
| `buildview_init_project` | Initialize or reset an architectural project with ordered build layers |
| `buildview_define_component` | Register a component with API anatomy, callers, callees, and priority |
| `buildview_update_progress` | Update build progress %, lifecycle status, and touched files in real time |
| `buildview_report_gap` | Flag an architectural discrepancy, edge case, or missing contract |
| `buildview_resolve_gap` | Mark an identified gap as resolved after writing code |
| `buildview_get_roadmap` | Returns the next prioritized layer and component for the AI to work on |
| `buildview_get_architecture` | Dumps the full JSON graph of layers, components, and contracts |

---

## NPM CLI & Package Installation

BuildView is available as both an npm CLI command and a programmatic TypeScript library.

### 1. Instant Execution via npx (Zero Setup)

Run directly on any codebase without installing:

```bash
# Scan any repository, generate DAG, detect AST waste & invariants
npx buildview scan /path/to/repo

# Run in CI/CD pipeline to verify clean layer boundaries & circular dependencies (fails on violations)
npx buildview check .

# CI-friendly: JSON report, only high+ gaps fail, existing debt baselined (see "CI Usage")
npx buildview check . --json --fail-on high --baseline buildview-baseline.json
```

### 2. Global / Local Installation

```bash
# Install globally
npm install -g buildview

# Or add as a development dependency
npm install -D buildview
```

### 3. Programmatic Library Usage

```typescript
import { RepoScannerService, BuildViewStore } from 'buildview';

const store = new BuildViewStore();
const project = await RepoScannerService.scanRepository(store, './my-project');

console.log(`Scanned ${project.components.length} components across ${project.layers.length} layers`);
console.log(`Saved architecture artifact to buildview-architecture.json`);
```

---

## Rules & What `check` Reports

BuildView separates **product code** from **tests** and **tooling** before it checks anything:

| Role | Default globs | Checked? |
|---|---|---|
| test | `*.test.*`, `*.spec.*`, `*.stories.*`, `__tests__/`, `__mocks__/`, `__fixtures__/`, `fixtures/`, `test/`, `tests/`, `testing/`, `test-utils/`, `e2e/`, `cypress/`, `playwright.config.*`, `vitest.config.*`, `jest.config.*` | may import anything |
| tooling | root `scripts/` and `tools/`, `scripts/` of a nested package, `*.config.*`, root `build-*.js` | may import anything |
| product | everything else | yes |

Imports are resolved file by file (relative paths, `.js` → `.ts`, `index` files and tsconfig `paths` aliases). The rules then run on **product imports only**:

| Gap kind | Severity | When |
|---|---|---|
| `circular_dependency` | critical across components, high inside one folder | A runtime import cycle between product files. Each cycle is reported once (per strongly connected group of files), shortest first, with `file:line` for every hop. Type-only, `import()` and test-only loops are ignored. |
| `forbidden_dependency` | critical | Product code imports a test file. |
| `cross_runtime_import` | high | A package reaches into another package by path (e.g. a Cloudflare Worker importing `src/`), renderer/UI code imports Electron main-process code, or two runtimes declared in config import each other. |
| `shared_depends_on_app` | high | Code in `shared/` (or `common/`, or config `shared`) imports app code. |
| `layer_inversion` | high | A module imports a module two or more layers above it. Only layers that come from config or from a folder keyword (`db`, `store`, `components`, ...) are trusted for this check. |
| `type_only_boundary` | low | Any of the above, but through `import type` / all-`type` specifiers. Erased at build time; move the type to a shared module. |
| `isolated_component` | medium | A product component with no imports in or out whose files are all orphans. |

Runtimes are detected from nested `package.json` files, `wrangler.*` configs (workers), `electron` imports (main process), React/Vue/Svelte files (UI) and `shared/` / `common/` folders. Main-process code that bundles pure renderer helpers inside one package is not reported.

**Waste** (reported in `--json`, not as gaps):
- Unused exports are split into `export not needed (used only in file)` (low: drop the `export` keyword) and `symbol never referenced anywhere (dead)` (medium: delete it), each with `file:line`.
- Orphan files skip roots: package.json `main`/`module`/`bin`/`exports`/`scripts` targets, wrangler `main`, `index.html` scripts, tool configs, file-routed `app/`, `pages/` and `functions/` folders, `.d.ts`, `preload.*` and `*Worker.*` scripts, and configured `entryPoints`.

---

## Configuration (`buildview.config.json`)

Auto-detection is the default. To declare the architecture yourself, add `buildview.config.json` at the repo root (or a `"buildview"` key in package.json, or pass `--config <file>`). Every key is optional:

```json
{
  "layers": [
    { "id": "core", "name": "Core", "order": 0, "include": ["shared/**", "src/types/**"] },
    { "id": "services", "name": "Services", "order": 1, "include": ["electron/**", "workers/**"] },
    { "id": "ui", "name": "UI", "order": 2, "include": ["src/components/**", "src/v2/**"] }
  ],
  "testGlobs": ["qa/**", "src/testing/**"],
  "toolingGlobs": ["ops/**"],
  "ignoreGlobs": ["legacy/**", "vendor/**"],
  "entryPoints": ["electron/heicWorker.ts", "src/plugins/**"],
  "runtimes": { "main": ["electron/**"], "renderer": ["src/**"], "worker": ["workers/**"] },
  "shared": ["shared/**"],
  "allowedEdges": [
    { "from": "client-web/**", "to": "src/sharePolicy/**", "reason": "policy is shared until it moves to packages/" }
  ]
}
```

| Key | Meaning |
|---|---|
| `layers` | Replaces the default layer taxonomy. A component takes the layer most of its files match. `order` 0 is the foundation. |
| `testGlobs` / `toolingGlobs` | Added to the built-in test / tooling globs. |
| `ignoreGlobs` | Files and folders that are not scanned. |
| `entryPoints` | Roots: never orphans, exports always kept. |
| `runtimes` | Named deployable units. Imports between two declared runtimes are `cross_runtime_import`. |
| `shared` | Code any runtime may import, and which must not import app code. |
| `allowedEdges` | `{ from, to }` glob pairs that are never reported. |

Globs follow `.gitignore` conventions: a pattern without `/` matches at any depth (`*.stories.tsx`, `fixtures`), a leading `/` anchors it to the root, and a folder pattern matches everything inside it.

---

## CI Usage

```bash
# Fail on any gap (default)
npx buildview check .

# Fail only on high and critical gaps
npx buildview check . --fail-on high          # same as --max-severity medium

# Machine-readable report on stdout, artifact outside the repo
npx buildview check . --json --out /tmp/buildview-architecture.json > buildview-report.json

# Adopt BuildView on a repo with existing debt: record today's gaps once ...
npx buildview check . --baseline buildview-baseline.json --update-baseline
# ... commit buildview-baseline.json, then only NEW gaps fail CI
npx buildview check . --baseline buildview-baseline.json --fail-on medium
```

| Option | Meaning |
|---|---|
| `--json` | Print only the JSON report: `passed`, `summary` (counts by severity and kind, unused exports, orphans), `gaps` (id, kind, severity, title, `file:line` evidence, `baselined`) and `waste`. |
| `--fail-on <low\|medium\|high\|critical\|none>` | Lowest severity that fails the check (default `low`). |
| `--max-severity <sev>` | Highest severity tolerated; the alternative spelling of `--fail-on`. |
| `--baseline <file>` | Gaps whose id is in this file do not fail. Ids are stable across line changes. |
| `--update-baseline` | Write the current gaps to the `--baseline` file and exit 0. |
| `--out <file>` / `--no-write` | Write `buildview-architecture.json` elsewhere, or not at all. `check` never writes anything else into the working directory. |
| `--config <file>` | Use this config instead of `buildview.config.json`. |
| `--port <n>` | Dashboard port printed by the CLI (also `BUILDVIEW_PORT`; default `3333`, the BuildView server). |

Exit codes: `0` passed, `1` failing gaps or a scan error, `2` invalid options.

GitHub Actions example:

```yaml
- run: npx buildview check . --json --no-write --baseline buildview-baseline.json --fail-on high > buildview-report.json
- uses: actions/upload-artifact@v4
  if: always()
  with: { name: buildview-report, path: buildview-report.json }
```

---

## Design System & Figma Token Correlation (Optional)

If your project contains a `figbridge.connect.json` design-token or Figma connect mapping:
- BuildView **automatically correlates** Figma components, variant IDs, and design names directly to the corresponding React/TypeScript implementation files.
- The visualizer displays dedicated purple **Figma Design** status pills on each connected component with quick inspection of Figma node IDs.

---

## Local Development & Server Setup

```bash
# Clone and install dependencies
git clone https://github.com/rudraptpsingh/BuildView.git
cd BuildView
npm install

# Run automated test suite (TDD)
npm test

# Build client bundle & TypeScript library
npm run build

# Start live server + Vite frontend
npm run dev
```

- **Web Dashboard (dev)**: `http://localhost:5173` (Vite, proxies `/api` to the server)
- **Built dashboard, Real-Time API & SSE Stream**: `http://localhost:3333` (`/api/events`); set `BUILDVIEW_PORT` to change it

### Shared dashboard + MCP (recommended for live delivery tracking)

After building, start **one** process from the target project directory, or set an explicit state directory:

```bash
BUILDVIEW_STORAGE_DIR=/absolute/project/.buildview BUILDVIEW_PORT=3333 node /path/to/BuildView/bin/buildview.js serve
```

The dashboard is at `http://127.0.0.1:3333`; connect a Streamable HTTP MCP client to `http://127.0.0.1:3333/mcp`. All clients and dashboard share one store, so MCP mutations reach the dashboard immediately and the project survives restart. This is a loopback-only development service with Host/Origin checks, not a public or enterprise server. Keep live `.buildview/` state out of version control and export deliberate reference snapshots separately. Timeline events and progress notes are currently in-memory; retain durable test/receipt artifacts outside the event feed.

An agent should call `buildview_get_planning_contract`, read requirements, write one `buildview.plan.json`, then call `buildview_plan_project`. Each track/gate needs a goal, method, outcome, acceptance tests with expected evidence, input/output/failure integration contracts, reuse boundaries, completion evidence and prerequisite IDs. Legacy `build`/`validate` plans still load but missing concrete fields appear as planning gaps. The planner checks cycles and missing IDs before mutation and starts every component at **planned / 0%**. It does not infer requirements from prose or execute acceptance tests.

Plans may supply explicit architectural `layers` and an item `layerId`; `depends_on` remains the independent execution DAG. Layer order groups the map and breaks priority ties, rather than forcing every lower layer to finish first. Items support `priority` (1–5, default 1), `module`, and structured `inputs`/`outputs` with `name`, `schemaRef`, `description` and optional `required`. The component drawer shows goal/method/outcome, data ports, planned acceptance checks, failure contracts and reuse boundaries separately. Schema references are preserved/displayed, not automatically dereferenced or validated; planned checks are not executed source-test results.

Before implementation, inspect `buildview_get_roadmap` and its `planningReadiness`: independent ready components may run in parallel; unmet prerequisites or open gaps block readiness. MCP completion updates require completed prerequisites, no open gaps and a nonempty evidence-reference note. These are guardrails against obvious progress abuse, not verified test results or multi-agent task locks. Existing code scans and file-based progress are inventory signals, not proof that a future delivery plan is complete. Keep scans separate from the active planned graph because scanning replaces it.

### Automatic repository observation

Set `BUILDVIEW_REPO_PATH=/absolute/project` when starting `buildview serve` (or pass `repoPath` to `startSharedHost`). The host debounces filesystem events and reconciles every five seconds, persists observed create/modify/delete deltas, and publishes them through the same dashboard SSE feed. Restart compares the persisted snapshot, so edits made while stopped are observed too. `.git`, `.buildview`, dependencies/build caches and symlinks are ignored.

Add optional repo-relative `fileGlobs: ["modules/ingest/**"]` to each roadmap track/gate for ownership. Exact declared component file paths also match, but a shared plan reference is not implicit code ownership. Unmapped changes remain visible in activity and `workingTreeChanges`; no architecture scan or graph replacement is triggered. A file change never awards progress or passing tests. Changes owned by a completed component create a `validation_stale` gap; previous numeric progress is retained as history, not fresh release proof. Plan-file edits create plan drift requiring an explicit reviewed refresh; automatic plan reload is intentionally deferred. This is an observation feed (mtime/size), not a git diff, a correctness check or a multi-host synchronisation mechanism.

### Connecting to Claude Desktop / Cursor MCP

For an independent stdio session, add to your `claude_desktop_config.json` (each process has its own in-memory store; use the shared HTTP host above for live dashboard/multi-agent use):

```json
{
  "mcpServers": {
    "buildview": {
      "command": "npx",
      "args": ["-y", "buildview", "mcp"]
    }
  }
}
```

---

## Step-by-Step Simulation

To observe BuildView in action with an automated CLI tool build simulation:

```bash
npm run example:simulate
```

Watch the web visualizer automatically progress through:
1. Initial planning of 3 layers & 6 components.
2. Building Layer 0 (ConfigStore & SQLite).
3. Reporting an architectural gap (Missing SQLite WAL mode & busy handler).
4. Resolving the gap and advancing through Layer 1 (Task Engine) and Layer 2 (CLI Router).
