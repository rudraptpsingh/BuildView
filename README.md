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

8. **Real-World ShotSelect Architecture Mapping**
   - Clustered across 25 components, 1,690 source files, 511,840 LOC, and 1,876 test files (31,523 correlated test cases).

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

BuildView registers 7 tools for AI coding agents:

| MCP Tool | Description |
|---|---|
| `buildview_init_project` | Initialize or reset an architectural project with ordered build layers |
| `buildview_define_component` | Register a component with API anatomy, callers, callees, and priority |
| `buildview_update_progress` | Update build progress %, lifecycle status, and touched files in real time |
| `buildview_report_gap` | Flag an architectural discrepancy, edge case, or missing contract |
| `buildview_resolve_gap` | Mark an identified gap as resolved after writing code |
| `buildview_get_roadmap` | Returns the next prioritized layer and component for the AI to work on |
| `buildview_get_architecture` | Dumps the full JSON graph of layers, components, and contracts |

---

## Installation & Setup

```bash
# Clone and install dependencies
git clone https://github.com/rudraptpsingh/BuildView.git
cd BuildView
npm install

# Run automated test suite (TDD)
npm test

# Build client bundle
npm run build

# Start live server + Vite frontend
npm run dev
```

- **Web Dashboard**: `http://localhost:5173`
- **Real-Time API & SSE Stream**: `http://localhost:3333/api/events`

### Connecting to Claude Desktop / Cursor MCP

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "buildview": {
      "command": "npx",
      "args": ["-y", "tsx", "/Users/rp/Documents/GitHub/BuildView/src/server/mcp-standalone.ts"]
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
