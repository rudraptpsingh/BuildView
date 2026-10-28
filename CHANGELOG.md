# Changelog

## 0.2.0

Fewer false positives on real repositories: tests, tooling, configs and type-only imports no longer count as product dependencies.

### Changed (behaviour)
- Test files and folders (`*.test.*`, `*.spec.*`, `__tests__/`, `test(s)/`, `e2e/`, `cypress/`, fixtures, stories, test runner configs) go to the verification layer; scripts and tool configs go to a new **`layer_tooling`** layer (`ArchitectureClusterer.DEFAULT_UNIVERSAL_LAYERS` now has 6 layers).
- Rules run on resolved file imports of product code only. Test/tooling imports are never checked; product code importing tests is `forbidden_dependency`.
- Cycles are found per strongly connected group of files, reported once each, shortest first, with `file:line` for every hop. Type-only, dynamic-import and test-only loops are ignored. Inside one folder a cycle is `high`, across components `critical`.
- Type-only imports that would break a rule are reported as `type_only_boundary` at the new **`low`** severity (`ArchitectureRuleViolation.severity` now includes `'low'`).
- New rule kinds: `cross_runtime_import` and `shared_depends_on_app`, based on detected runtimes (nested packages, wrangler workers, electron main, UI, shared folders).
- Layer heuristics use folder keywords relative to the runtime root and runtime markers; `electron/`, `workers/` and `scripts/` are no longer "Domain Engines". Layer inversions are only checked between layers from config or folder keywords.
- Package entry points (`main`, `bin`, `exports`, `scripts`), wrangler `main`, tool configs, `.d.ts`, file-routed folders, preload and worker scripts are roots, not orphan files.
- Unused exports carry `usage: 'local_only' | 'dead'`; only dead symbols count toward `deadCodeLines`.
- The CLI prints the dashboard on `--port` / `BUILDVIEW_PORT` (default 3333) instead of a hard-coded 5173, and `check` no longer writes `.buildview/` into the working directory.

### Added
- `buildview.config.json` (or `package.json#buildview`): `layers`, `testGlobs`, `toolingGlobs`, `ignoreGlobs`, `entryPoints`, `runtimes`, `shared`, `allowedEdges`.
- `check --json`, `--fail-on`, `--max-severity`, `--baseline`, `--update-baseline`, `--out`, `--no-write`, `--config`, `--port`.
- `RepoScannerService.scanRepositoryDetailed()` returning the project plus waste, rule and file-graph analysis; `ScanOptions.config`, `configPath`, `outputPath`.
- Optional fields: `GapItem.kind`, `GapItem.evidence`, `ArchitectureComponent.layerSource`, `WasteMetrics.unusedExportDetails`, `ImportDetail.line` / `kind`, `ParsedFileResult.localReferenceCounts`.

### Compatibility
- Existing call signatures still work: `analyzeArchitecture(components, layers)` without the new context argument keeps the component-level analysis (now with deduplicated cycles and test components left out), and `autoClusterRepository` / `analyzeRepository` / `parseFile` take their new arguments as optional trailing parameters.

## 0.1.0

Initial release.
