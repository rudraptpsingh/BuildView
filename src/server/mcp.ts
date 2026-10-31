import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BuildViewStore } from './store.js';
import { RepoScannerService } from './repo-scanner-service.js';
import { planProject } from './project-planner.js';
import { getPlanningContract, getPlanningReadiness, planningInstructions } from './planning-contract.js';

export function createBuildViewMcpServer(store: BuildViewStore) {
  const server = new McpServer({
    name: 'BuildView',
    version: '1.0.0',
  }, { instructions: planningInstructions });

  server.tool(
    'buildview_get_planning_contract',
    'Start here before delivery planning: get the supported JSON schema, concrete-plan template, evidence requirements and agent workflow. The agent supplies requirements; BuildView checks and maps the plan.',
    {},
    async () => ({content:[{type:'text',text:JSON.stringify(getPlanningContract(),null,2)}]})
  );

  server.tool(
    'buildview_plan_project',
    'Automatically map a version-1 JSON roadmap into dependency phases and planned components. Call buildview_get_planning_contract first. Missing concrete acceptance/contracts/evidence fields become explicit planning gaps; cycles and unknown prerequisites fail before replacement. Does not infer prose requirements or prove completion.',
    { repoPath:z.string(), planPath:z.string().default('buildview.plan.json'), replaceExisting:z.boolean().default(false) },
    async args => {
      try {
        const project=planProject(store,args.repoPath,args.planPath,args.replaceExisting);
        return {content:[{type:'text',text:JSON.stringify({projectName:project.name,components:project.components.length,layers:project.layers.length,status:'planned',planningReadiness:getPlanningReadiness(project),next:store.getRoadmap().nextFocus},null,2)}]};
      } catch(error) {
        return {isError:true,content:[{type:'text',text:error instanceof Error ? error.message : String(error)}]};
      }
    }
  );

  // Tool 0: Dynamically Scan, Parse AST, and Map Any Arbitrary Codebase
  server.tool(
    'buildview_scan_repo',
    'Scan ANY repository on disk, parse its AST, detect code waste, and generate live architecture component mapping',
    {
      repoPath: z.string().describe('Absolute or relative directory path of the codebase to scan and visualize (e.g. "." or "/path/to/repo")'),
      projectName: z.string().optional().describe('Optional custom display name for the project'),
      projectDescription: z.string().optional().describe('Optional custom architectural summary'),
    },
    async (args) => {
      try {
        const project = await RepoScannerService.scanRepository(store, args.repoPath, {
          projectName: args.projectName,
          projectDescription: args.projectDescription,
        });

        const totalFiles = project.components.reduce((sum, c) => sum + c.files.length, 0);
        const totalTests = project.components.reduce((sum, c) => sum + (c.testSummary?.totalTests || 0), 0);
        const totalGaps = project.components.reduce((sum, c) => sum + c.gaps.filter((g) => !g.resolved).length, 0);

        return {
          content: [
            {
              type: 'text',
              text: `✅ Successfully scanned and mapped repository "${project.name}":\n` +
                `- Layers: ${project.layers.length}\n` +
                `- Architectural Components: ${project.components.length}\n` +
                `- Source Files Parsed: ${totalFiles}\n` +
                `- Tests Correlated: ${totalTests}\n` +
                `- Active Gaps: ${totalGaps}\n\n` +
                `Visualizer updated in real-time at http://localhost:5173`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Failed to scan repository at "${args.repoPath}": ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 1: Initialize Project & Architecture Layers
  server.tool(
    'buildview_init_project',
    'Initialize or reset a software architecture project with defined execution layers',
    {
      name: z.string().describe('Name of the project (e.g., TaskPulse CLI, AuthService)'),
      description: z.string().describe('High-level architectural summary of what is being built'),
      layers: z
        .array(
          z.object({
            id: z.string().describe('Unique ID of layer, e.g. "layer_0_storage"'),
            name: z.string().describe('Display name, e.g. "Storage & Persistence"'),
            order: z.number().describe('Execution order (0 = foundation, 1 = domain, 2 = interface)'),
            description: z.string().describe('What responsibility this layer holds'),
            color: z.string().optional().describe('Accent color token or hex code'),
          })
        )
        .optional()
        .describe('Ordered architectural layers/phases'),
    },
    async (args) => {
      const project = store.initProject(args.name, args.description, args.layers);
      return {
        content: [
          {
            type: 'text',
            text: `Initialized project "${project.name}" with ${project.layers.length} layers. Visualizer is ready at the web dashboard.`,
          },
        ],
      };
    }
  );

  // Tool 2: Define or Update a Planned Architectural Component
  server.tool(
    'buildview_define_component',
    'Define an architectural component with complete API anatomy, functions, state, caller/callee contracts, and priority',
    {
      id: z.string().describe('Unique component identifier, e.g. "config_manager" or "auth_service"'),
      name: z.string().describe('Human-readable component name, e.g. "Config Manager"'),
      layerId: z.string().describe('ID of the architectural layer this belongs to'),
      description: z.string().describe('Responsibility of this component'),
      color: z.string().default('indigo').describe('Neumorphic accent color (cyan, indigo, emerald, amber, rose, violet)'),
      priority: z.number().default(1).describe('Implementation priority (1 = highest / build first)'),
      status: z
        .enum(['planned', 'in_progress', 'completed', 'gap_detected'])
        .default('planned')
        .describe('Current lifecycle status'),
      progress: z.number().default(0).describe('Current build progress percentage (0 - 100)'),
      anatomy: z
        .object({
          members: z
            .array(
              z.object({
                name: z.string().describe('Member variable / field name'),
                type: z.string().describe('Data type (e.g. string, Map<string, Task>, ConfigSchema)'),
                description: z.string().optional(),
                access: z.enum(['public', 'private', 'protected']).optional(),
              })
            )
            .default([]),
          functions: z
            .array(
              z.object({
                name: z.string().describe('Method / function name'),
                signature: z.string().describe('Function arguments and types, e.g. "(key: string, val: any): void"'),
                description: z.string().optional(),
                returnType: z.string().optional(),
                isAsync: z.boolean().optional(),
              })
            )
            .default([]),
          state: z
            .array(
              z.object({
                name: z.string().describe('State property name, e.g. "isInitialized" or "activeSession"'),
                type: z.string().describe('State type'),
                description: z.string().optional(),
                initialValue: z.string().optional(),
                lifecycle: z.string().optional(),
              })
            )
            .default([]),
          callers: z
            .array(z.string())
            .default([])
            .describe('IDs of components or actors that call this component (e.g., ["cli_router", "user_cli"])'),
          callees: z
            .array(z.string())
            .default([])
            .describe('IDs of components that this component depends on or calls'),
        })
        .default({ members: [], functions: [], state: [], callers: [], callees: [] }),
      files: z
        .array(
          z.object({
            path: z.string().describe('Relative or absolute file path associated with this component'),
            status: z.enum(['planned', 'created', 'modified', 'deleted']).default('planned'),
            linesChanged: z.number().optional(),
            description: z.string().optional(),
          })
        )
        .default([]),
    },
    async (args) => {
      if (args.status === 'completed' || args.progress === 100) {
        return {isError:true,content:[{type:'text',text:'Create components as planned. Use buildview_update_progress with completion evidence after prerequisites and planning gaps are resolved.'}]};
      }
      const existing = store.getProject().components.find(c=>c.id===args.id);
      const comp = store.defineComponent({ ...args, gaps: existing?.gaps || [] });
      return {
        content: [
          {
            type: 'text',
            text: `Registered component "${comp.name}" in layer "${comp.layerId}" (P${comp.priority}, status: ${comp.status}). Anatomy: ${comp.anatomy.members.length} members, ${comp.anatomy.functions.length} functions, ${comp.anatomy.callers.length} callers.`,
          },
        ],
      };
    }
  );

  // Tool 3: Update Component Progress & Files Modified
  server.tool(
    'buildview_update_progress',
    'Update progress/files. completed or 100 requires an evidence-reference note, no open gaps, and all declared prerequisites completed. A note is a claim, not automatic evidence verification.',
    {
      id: z.string().describe('Component ID to update'),
      progress: z.number().min(0).max(100).optional().describe('New progress percentage (0 - 100)'),
      status: z
        .enum(['planned', 'in_progress', 'completed', 'gap_detected'])
        .optional()
        .describe('New component status'),
      files: z
        .array(
          z.object({
            path: z.string(),
            status: z.enum(['planned', 'created', 'modified', 'deleted']),
            linesChanged: z.number().optional(),
            description: z.string().optional(),
          })
        )
        .optional()
        .describe('List of files created/modified for this component'),
      note: z.string().optional().describe('Log note on what was built or changed in this step'),
    },
    async (args) => {
      const current = store.getProject().components.find(c=>c.id===args.id);
      if (!current) return {isError:true,content:[{type:'text',text:`Component ${args.id} not found`}]};
      if (args.status === 'completed' || args.progress === 100) {
        const failures: string[] = [];
        if (!args.note?.trim()) failures.push('Provide a nonempty note referencing actual completion evidence; the note is not automatically verified.');
        const gaps = current.gaps.filter(g=>!g.resolved);
        if (gaps.length) failures.push(`Resolve open gaps first: ${gaps.map(g=>g.id).join(', ')}`);
        const unmet = current.anatomy.callees.filter(id=>store.getProject().components.find(c=>c.id===id)?.status!=='completed');
        if (unmet.length) failures.push(`Complete declared prerequisites first: ${unmet.join(', ')}`);
        if (failures.length) return {isError:true,content:[{type:'text',text:failures.join('\n')}]};
      }
      const comp = store.updateComponentProgress(args);
      if (!comp) {
        return {
          content: [{ type: 'text', text: `Error: Component with ID "${args.id}" not found.` }],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: `Updated "${comp.name}": progress ${comp.progress}%, status "${comp.status}". Total tracked files: ${comp.files.length}.`,
          },
        ],
      };
    }
  );

  // Tool 4: Report an Architectural or Implementation Gap
  server.tool(
    'buildview_report_gap',
    'Flag an architectural, contract, or implementation gap in a component to draw user and agent attention',
    {
      componentId: z.string().describe('ID of the component with the gap'),
      title: z.string().describe('Short headline of the gap (e.g. "Missing atomic file write" or "Unvalidated CLI flag")'),
      description: z.string().describe('Detailed explanation of why this gap exists and what needs to be fixed'),
      severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    },
    async (args) => {
      const gap = store.reportGap(args.componentId, {
        title: args.title,
        description: args.description,
        severity: args.severity,
      });
      if (!gap) {
        return {
          content: [{ type: 'text', text: `Error: Component with ID "${args.componentId}" not found.` }],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: `Gap flagged on component "${args.componentId}": [${args.severity.toUpperCase()}] ${args.title}. Marked in visualizer.`,
          },
        ],
      };
    }
  );

  // Tool 5: Resolve an Identified Gap
  server.tool(
    'buildview_resolve_gap',
    'Mark an architectural gap as resolved after implementing the fix',
    {
      componentId: z.string().describe('ID of the component'),
      gapId: z.string().describe('ID of the gap being resolved'),
      note: z.string().optional().describe('Resolution note on how the gap was closed'),
    },
    async (args) => {
      const ok = store.resolveGap(args.componentId, args.gapId, args.note);
      if (!ok) {
        return {
          content: [{ type: 'text', text: `Error: Gap ID "${args.gapId}" on component "${args.componentId}" not found.` }],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: `Resolved gap "${args.gapId}" on component "${args.componentId}". Visualizer updated.`,
          },
        ],
      };
    }
  );

  // Tool 6: Get Roadmap & Next Prioritized Layer/Component to Build
  server.tool(
    'buildview_get_roadmap',
    'Get prioritized next focus, outstanding gaps, and dependency/planning readiness. Next focus can require planning work; inspect executionReady before implementing.',
    {},
    async () => {
      const roadmap = {...store.getRoadmap(), planningReadiness:getPlanningReadiness(store.getProject())};
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(roadmap, null, 2),
          },
        ],
      };
    }
  );

  // Tool 7: Get Full Architecture Graph
  server.tool(
    'buildview_get_architecture',
    'Get complete architecture state: all layers, components, API anatomy, files, and progress',
    {},
    async () => {
      const project = store.getProject();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(project, null, 2),
          },
        ],
      };
    }
  );

  // Tool 8: Deep Parse Repository AST & Detect Tests & Code Waste
  server.tool(
    'buildview_parse_repo',
    'Deep scans a target repository using the TypeScript AST parser, extracting interfaces, functions, callers/callees, test coverage, and detecting dead/duplicate code for pruning',
    {
      repoPath: z.string().describe('Absolute directory path of the repository to parse'),
    },
    async (args) => {
      const { RepoParser } = await import('./parser/repo-parser.js');
      const { WasteDetector } = await import('./parser/waste-detector.js');

      const scanResult = RepoParser.scanRepository(args.repoPath);
      const wasteResult = WasteDetector.analyzeRepository(scanResult.sourceFiles, scanResult.testFiles);

      const totalSourceFiles = scanResult.sourceFiles.length;
      const totalTestFiles = scanResult.testFiles.length;
      const totalTestCases = scanResult.testFiles.reduce((acc, tf) => acc + (tf.testCases?.length || 0), 0);
      const totalUnusedExports = wasteResult.allUnusedExports.length;
      const totalDuplicates = wasteResult.allDuplicates.length;
      const totalTestZombies = wasteResult.allTestZombies.length;

      return {
        content: [
          {
            type: 'text',
            text: [
              `# Repository Parse & Waste Audit: ${args.repoPath}`,
              `- Source files analyzed: ${totalSourceFiles}`,
              `- Test files analyzed: ${totalTestFiles}`,
              `- Test cases detected: ${totalTestCases}`,
              `- Unused exports (prune candidates): ${totalUnusedExports}`,
              `- Duplicate implementations detected: ${totalDuplicates}`,
              `- Test zombies (only called by tests): ${totalTestZombies}`,
              `- Repository Cleanliness Score: ${wasteResult.repoWaste.cleanlinessScore}% (${wasteResult.repoWaste.recommendation.toUpperCase()})`,
            ].join('\n'),
          },
        ],
      };
    }
  );

  // Tool 9: Get Structured Component Context for Coding Agent Prompts
  server.tool(
    'buildview_get_component_context',
    'Get full prompt-ready architectural specification for a component (API contract, tests to pass, caller/callee links, files, gaps, and waste code to prune)',
    {
      componentId: z.string().describe('Component ID to retrieve context for'),
    },
    async (args) => {
      const project = store.getProject();
      const comp = project.components.find((c) => c.id === args.componentId);
      if (!comp) {
        return {
          content: [{ type: 'text', text: `Error: Component "${args.componentId}" not found.` }],
        };
      }

      const layer = project.layers.find((l) => l.id === comp.layerId);
      const testCasesList = (comp.testFiles || []).flatMap((tf) => tf.testCases.map((tc) => `- [${tf.path}] (${tc.suite}): ${tc.name}`));

      const contextMarkdown = [
        `# Architecture Component: ${comp.name} (\`${comp.id}\`)`,
        `**Layer:** ${layer?.name || comp.layerId} (Priority P${comp.priority})`,
        `**Status:** ${comp.status.toUpperCase()} (${comp.progress}% progress)`,
        `**Description:** ${comp.description}`,
        '',
        '## 1. API Contract & Public Anatomy',
        '### Functions & Methods:',
        ...(comp.anatomy.functions.length > 0
          ? comp.anatomy.functions.map((f) => `- \`${f.name}${f.signature}\`: ${f.description || 'No doc'} (Returns: \`${f.returnType}\`, Async: ${!!f.isAsync})`)
          : ['- None defined.']),
        '',
        '### Members & Fields:',
        ...(comp.anatomy.members.length > 0
          ? comp.anatomy.members.map((m) => `- \`[${m.access || 'public'}] ${m.name}: ${m.type}\`${m.description ? ` - ${m.description}` : ''}`)
          : ['- None defined.']),
        '',
        '### Internal State:',
        ...(comp.anatomy.state.length > 0
          ? comp.anatomy.state.map((s) => `- \`${s.name}: ${s.type}\` (Initial: \`${s.initialValue}\`)`)
          : ['- Stateless.']),
        '',
        '## 2. Test Verification Requirements',
        `**Test Status:** ${comp.testSummary?.status?.toUpperCase() || 'UNTESTED'} (${comp.testSummary?.totalTests || 0} tests across ${comp.testFiles?.length || 0} test files)`,
        ...(testCasesList.length > 0 ? testCasesList : ['- No test cases recorded yet. Coding agent must write tests to satisfy contract.']),
        '',
        '## 3. Dependency Graph Contracts',
        `**Incoming Callers:** ${comp.anatomy.callers.join(', ') || 'None (Entrypoint/Interface)'}`,
        `**Outbound Dependencies (Callees):** ${comp.anatomy.callees.join(', ') || 'None (Leaf)'}`,
        '',
        '## 4. Tracked Implementation Files',
        ...comp.files.map((f) => `- \`${f.path}\` (${f.status.toUpperCase()}) ${f.description || ''}`),
        '',
        '## 5. Active Architectural Gaps',
        ...(comp.gaps.length > 0
          ? comp.gaps.map((g) => `- [${g.severity.toUpperCase()}] ${g.title}: ${g.description} (Resolved: ${g.resolved})`)
          : ['- Zero active gaps reported.']),
        '',
        '## 6. Code Waste & Pruning Action Items',
        `**Cleanliness Score:** ${comp.wasteMetrics?.cleanlinessScore ?? 100}% (${comp.wasteMetrics?.recommendation?.toUpperCase() || 'CLEAN'})`,
        ...(comp.wasteMetrics?.unusedExports && comp.wasteMetrics.unusedExports.length > 0
          ? [
              '### Unused / Dead Exports to Prune:',
              ...comp.wasteMetrics.unusedExports.map((u) => `- [PRUNE] \`${u}\``),
            ]
          : []),
        ...(comp.wasteMetrics?.duplicateFunctions && comp.wasteMetrics.duplicateFunctions.length > 0
          ? [
              '### Duplicate Functions to Consolidate:',
              ...comp.wasteMetrics.duplicateFunctions.map((d) => `- [CONSOLIDATE] \`${d.name}()\` in \`${d.sourceFile}\` (Duplicate of \`${d.duplicateOfFile}\`)`),
            ]
          : []),
        ...(comp.wasteMetrics?.testZombies && comp.wasteMetrics.testZombies.length > 0
          ? [
              '### Test Zombies (Called only by tests, dead in prod):',
              ...comp.wasteMetrics.testZombies.map((z) => `- [INVESTIGATE] \`${z}\``),
            ]
          : []),
      ].join('\n');

      return {
        content: [
          {
            type: 'text',
            text: contextMarkdown,
          },
        ],
      };
    }
  );

  // Tool 10: Generate Executable Test-Driven Development (TDD) Prompt for Coding Agents
  server.tool(
    'buildview_get_tdd_prompt',
    'Generate a rigorous, prompt-ready TDD specification for a component, linking its executable verification test harness, invariants, functions, and waste pruning targets',
    {
      componentId: z.string().describe('Target component ID to generate a TDD implementation prompt for'),
    },
    async (args) => {
      const project = store.getProject();
      const comp = project.components.find((c) => c.id === args.componentId);
      if (!comp) {
        return {
          content: [{ type: 'text', text: `Error: Component "${args.componentId}" not found in project "${project.name}".` }],
        };
      }

      const layer = project.layers.find((l) => l.id === comp.layerId);
      const verifyingHarnesses = project.components.filter(
        (c) =>
          (c.layerId === 'layer_4_tests' || c.layerId === 'layer_verification') &&
          c.anatomy.callees.includes(comp.id)
      );

      const tddPrompt = [
        `# AGENT TDD SPECIFICATION: ${comp.name} (\`${comp.id}\`)`,
        `**Layer:** ${layer?.name || comp.layerId} | **Priority:** P${comp.priority} | **Current Status:** ${comp.status.toUpperCase()}`,
        `**Architectural Responsibility:** ${comp.description}`,
        '',
        '---',
        '## 🧪 PHASE 1: RED (Test Contract Specification & Failing Assertions)',
        `Before writing any production code, establish the automated test suite enforcing ${comp.name}'s contracts.`,
        '',
        verifyingHarnesses.length > 0
          ? `**Linked Verification Harness(es):**\n` +
            verifyingHarnesses.map((vh) => `- \`${vh.name}\` (\`${vh.id}\`): ${vh.files.map((f) => f.path).join(', ')}`).join('\n')
          : `**Target Test File:** \`${comp.files[0] ? comp.files[0].path.replace(/\.(ts|tsx|js|jsx)$/, '.test.$1') : `tests/${comp.id}.test.ts`}\``,
        '',
        '### Contract Assertions to Verify:',
        ...(comp.anatomy.functions.length > 0
          ? comp.anatomy.functions.map(
              (f) =>
                `- [ ] \`${f.name}${f.signature}\`: Must return \`${f.returnType || 'expected result'}\`. Verify edge cases, async behavior (${!!f.isAsync}), and invalid parameter errors.`
            )
          : ['- [ ] Establish initial unit specs enforcing module initialization and exported interface.']),
        '',
        '### Caller / Callee Boundaries:',
        `- **Expected Callers:** ${comp.anatomy.callers.join(', ') || 'Root/Interface entrypoint'}`,
        `- **Allowed Callee Invariants (Do not import outside these):** ${comp.anatomy.callees.join(', ') || 'Self-contained leaf module'}`,
        '',
        '---',
        '## ⚡ PHASE 2: GREEN (Minimal Implementation Satisfying Contract)',
        'Implement the minimum code necessary in the target implementation files to make all test assertions pass.',
        '',
        '### Implementation Files:',
        ...comp.files.map((f) => `- \`${f.path}\` (${f.status}) ${f.description ? `— ${f.description}` : ''}`),
        '',
        '### Public Anatomy to Expose:',
        ...(comp.anatomy.functions.map(
          (f) => `- \`export ${f.isAsync ? 'async ' : ''}function ${f.name}${f.signature}: ${f.returnType || 'any'}\``
        )),
        ...(comp.anatomy.members.map((m) => `- \`[${m.access || 'public'}] ${m.name}: ${m.type}\``)),
        '',
        '---',
        '## 🧹 PHASE 3: REFACTOR & PRUNE (AST Waste Elimination)',
        `**Cleanliness Score:** ${comp.wasteMetrics?.cleanlinessScore ?? 100}%`,
        ...(comp.wasteMetrics?.unusedExports && comp.wasteMetrics.unusedExports.length > 0
          ? [
              '### Dead Exports to Remove / Unexport:',
              ...comp.wasteMetrics.unusedExports.map((u) => `- [PRUNE] \`${u}\``),
            ]
          : ['- No unused exports detected.']),
        ...(comp.wasteMetrics?.duplicateFunctions && comp.wasteMetrics.duplicateFunctions.length > 0
          ? [
              '### Duplicate Code to Consolidate:',
              ...comp.wasteMetrics.duplicateFunctions.map((d) => `- [CONSOLIDATE] \`${d.name}()\` with \`${d.duplicateOfFile}\``),
            ]
          : []),
        '',
        '---',
        '## 🏁 PHASE 4: VERIFY & BROADCAST TELEMETRY',
        '1. Run the test command: `npx vitest run` or project test suite.',
        `2. Call MCP tool \`buildview_record_test_results\` with componentId: "${comp.id}".`,
        `3. Call MCP tool \`buildview_update_component_status\` to mark status: "completed" and progress: 100.`,
      ].join('\n');

      return {
        content: [
          {
            type: 'text',
            text: tddPrompt,
          },
        ],
      };
    }
  );

  // Tool 11: Get Multi-Dimensional Architectural Health Score & Remediation Plan
  server.tool(
    'buildview_get_health_score',
    'Get multi-dimensional Architectural Health Score (Architecture Invariants, Code Cleanliness, Test Verification, Modularity), letter grade, and prioritized remediation actions',
    {
      repoPath: z.string().optional().describe('Optional repository directory to scan and evaluate; defaults to active store project'),
    },
    async (args) => {
      try {
        let project = store.getProject();
        if (args.repoPath) {
          const detailed = await RepoScannerService.scanRepositoryDetailed(store, args.repoPath, { outputPath: false });
          project = detailed.project;
        }

        const score = project.healthScore;
        if (!score) {
          return {
            content: [{ type: 'text', text: 'No health score calculated yet. Scan the repository first using buildview_scan_repo.' }],
          };
        }

        const outputLines = [
          `# 🎖️ Architectural Health Scorecard: ${score.overallScore}/100 [Grade: ${score.grade}]`,
          '',
          `### 1. ${score.dimensions.architecture.name} (Weight 35%): **${score.dimensions.architecture.score}/100**`,
          `> ${score.dimensions.architecture.summary}`,
          ...score.dimensions.architecture.deductions.slice(0, 3).map((d) => `  - [-${d.penalty} pts] ${d.reason}${d.file ? ` (${d.file}:${d.line || 0})` : ''}`),
          '',
          `### 2. ${score.dimensions.cleanliness.name} (Weight 25%): **${score.dimensions.cleanliness.score}/100**`,
          `> ${score.dimensions.cleanliness.summary}`,
          ...score.dimensions.cleanliness.deductions.slice(0, 3).map((d) => `  - [-${d.penalty} pts] ${d.reason}`),
          '',
          `### 3. ${score.dimensions.verification.name} (Weight 25%): **${score.dimensions.verification.score}/100**`,
          `> ${score.dimensions.verification.summary}`,
          ...score.dimensions.verification.deductions.slice(0, 3).map((d) => `  - [-${d.penalty} pts] ${d.reason}`),
          '',
          `### 4. ${score.dimensions.modularity.name} (Weight 15%): **${score.dimensions.modularity.score}/100**`,
          `> ${score.dimensions.modularity.summary}`,
          ...score.dimensions.modularity.deductions.slice(0, 3).map((d) => `  - [-${d.penalty} pts] ${d.reason}`),
          '',
          '---',
          '### 🎯 Highest-ROI Remediation Actions:',
          ...(score.remediationPlan.length > 0
            ? score.remediationPlan.slice(0, 5).map((r, i) => `${i + 1}. [Priority ${r.priority} | +${r.impactScorePoints} pts] **${r.title}**: ${r.description}`)
            : ['- None. Architecture is in pristine health!']),
        ];

        return {
          content: [
            {
              type: 'text',
              text: outputLines.join('\n'),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Failed to compute health score: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 12: Evaluate Agent Run Delta & Regressions
  server.tool(
    'buildview_evaluate_agent_delta',
    'Compare current repository AST against baseline to verify if agent changes improved or regressed architectural health, with exact regressions and token savings',
    {
      repoPath: z.string().describe('Target repository directory to evaluate'),
      baselineConfigPath: z.string().optional().describe('Optional custom config path'),
    },
    async (args) => {
      try {
        const { BenchmarkEvaluator } = await import('./analysis/benchmark-evaluator.js');
        const detailed = await RepoScannerService.scanRepositoryDetailed(store, args.repoPath, { outputPath: false });

        // Simulate evaluation of current project against baseline
        const score = detailed.project.healthScore;
        const evaluation = BenchmarkEvaluator.evaluateAgentRun({
          projectBefore: detailed.project,
          wasteBefore: { ...detailed.waste, allUnusedExports: [] },
          rulesBefore: { ...detailed.rules, violations: [] },
          projectAfter: detailed.project,
          wasteAfter: detailed.waste,
          rulesAfter: detailed.rules,
        });

        const outputMarkdown = [
          `# 🧪 Agent Benchmark & Delta Evaluation: ${evaluation.verdict.toUpperCase()}`,
          `**Current Score:** ${score?.overallScore || 0}/100 [Grade: ${score?.grade || 'N/A'}]`,
          `**Active Regressions / Invariants Violated:** ${evaluation.regressionsIntroduced.length}`,
          ...evaluation.regressionsIntroduced.slice(0, 5).map((r) => `- [${r.severity.toUpperCase()}] ${r.message}`),
          '',
          `**Token Efficiency:** ~${evaluation.tokenSavingsEstimate.tokensSaved.toLocaleString()} tokens saved using BuildView contracts (${evaluation.tokenSavingsEstimate.savingsPercent}% reduction vs reading raw files)`,
        ].join('\n');

        return {
          content: [{ type: 'text', text: outputMarkdown }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Failed to evaluate agent delta: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 13: Get AI Agent Surgical Remediation Card (Token-Budgeted)
  server.tool(
    'buildview_get_remediation_card',
    'Generate a minimal, token-budgeted prompt card (~400 tokens) for an AI coding agent to fix an architectural gap without polluting context with full repo dumps',
    {
      repoPath: z.string().describe('Target repository directory'),
      gapId: z.string().optional().describe('Specific gap ID to remediate, or omit for highest-priority gap'),
      tokenBudget: z.number().optional().describe('Maximum tokens allowed for the generated prompt card (default: 450)'),
    },
    async (args) => {
      try {
        const { AgentRemediationEngine } = await import('./analysis/agent-remediation.js');
        const detailed = await RepoScannerService.scanRepositoryDetailed(store, args.repoPath, { outputPath: false });
        const allGaps = detailed.project.components.flatMap((c) => c.gaps.filter((g) => !g.resolved));

        if (allGaps.length === 0) {
          return {
            content: [{ type: 'text', text: `✅ Codebase is architecture clean! No unresolved gaps detected in ${detailed.project.name}.` }],
          };
        }

        let targetGap = allGaps[0];
        if (args.gapId) {
          const found = allGaps.find((g) => g.id === args.gapId);
          if (found) targetGap = found;
        } else {
          const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
          allGaps.sort((a, b) => (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0));
          targetGap = allGaps[0];
        }

        const card = AgentRemediationEngine.generateCard(targetGap, {
          tokenBudget: args.tokenBudget || 450,
          verificationCmd: 'npx buildview check',
        });

        const text = [
          `# 🤖 Agent Remediation Card [${card.gapId}] (${card.tokenCostEstimate} tokens)`,
          `> Context efficiency: Saved ~${card.tokenSavingsVsRawDump.toLocaleString()} tokens vs reading whole files.\n`,
          card.agentPromptText,
        ].join('\n');

        return {
          content: [{ type: 'text', text }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Failed to generate remediation card: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 14: Check Performance Hotpaths (EST / TTFP Static Linter)
  server.tool(
    'buildview_check_performance',
    'Detect synchronous blocking I/O (fs.readFileSync, execSync, ipcRenderer.sendSync) on UI render and Electron startup hotpaths that spike Event Loop Stall Time (EST) and TTFP',
    {
      repoPath: z.string().describe('Target repository directory to analyze'),
    },
    async (args) => {
      try {
        const { PerformanceLinter } = await import('./analysis/performance-lint.js');
        const detailed = await RepoScannerService.scanRepositoryDetailed(store, args.repoPath, { outputPath: false });
        const perfResult = PerformanceLinter.analyzePerformance(args.repoPath, detailed.project.components);

        const lines: string[] = [
          `# ⚡ Performance Hotpath Audit: ${detailed.project.name}`,
          `**Total Blocking Violations:** ${perfResult.metrics.totalViolations}`,
          `- Sync FS in UI: ${perfResult.metrics.syncFsInUiCount}`,
          `- Sync child_process Exec: ${perfResult.metrics.syncExecCount}`,
          `- Sync IPC (sendSync): ${perfResult.metrics.syncIpcCount}`,
          '',
        ];

        if (perfResult.violations.length === 0) {
          lines.push('✅ Zero blocking synchronous I/O or IPC detected on UI hotpaths.');
        } else {
          lines.push('### Top Violations:');
          for (const v of perfResult.violations.slice(0, 10)) {
            lines.push(`- **[${v.severity.toUpperCase()}]** \`${v.file}:${v.line}\` - ${v.message}`);
            lines.push(`  *Fix:* ${v.remediation}`);
          }
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Failed to run performance audit: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 15: Check Design System Tokens & Testid Reachability
  server.tool(
    'buildview_check_design_tokens',
    'Audit repository UI components for design system token compliance (raw color literals, off-scale heights/type) and data-testid reachability',
    {
      repoPath: z.string().describe('Target repository directory to analyze'),
    },
    async (args) => {
      try {
        const { DesignRulesEngine } = await import('./analysis/design-rules.js');
        const detailed = await RepoScannerService.scanRepositoryDetailed(store, args.repoPath, { outputPath: false });
        const designResult = DesignRulesEngine.analyzeDesignRules(args.repoPath, detailed.project.components);

        const lines: string[] = [
          `# 🎨 Design System & Token Hygiene Audit: ${detailed.project.name}`,
          `**Color Literals:** ${designResult.metrics.totalColorLiterals}`,
          `**Off-Scale Control Heights:** ${designResult.metrics.totalOffScaleHeights}`,
          `**Off-Scale Type Sizes:** ${designResult.metrics.totalOffScaleTypeSizes}`,
          `**Components Missing data-testid:** ${designResult.metrics.totalMissingTestIds}`,
          `**Figma Mapped Components:** ${designResult.metrics.totalFigmaMappedComponents}`,
          '',
        ];

        if (designResult.violations.length === 0) {
          lines.push('✅ All presentation components comply with design tokens and testability standards.');
        } else {
          lines.push('### Top Design Violations:');
          for (const v of designResult.violations.slice(0, 10)) {
            lines.push(`- **[${v.severity.toUpperCase()}]** \`${v.file}\` - ${v.message}`);
          }
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Failed to run design tokens audit: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 16: Audit Electron Process Topology & IPC Channels
  server.tool(
    'buildview_audit_electron',
    'Audit an Electron application process boundaries, IPC channel contract symmetry, preload surface area, and webPreferences security',
    {
      repoPath: z.string().describe('Target Electron repository directory to analyze'),
    },
    async (args) => {
      try {
        const { ElectronAnalyzer } = await import('./analysis/electron-analyzer.js');
        const detailed = await RepoScannerService.scanRepositoryDetailed(store, args.repoPath, { outputPath: false });
        const result = ElectronAnalyzer.analyzeElectronApp(args.repoPath, detailed.project.components);

        if (!result.metrics.isElectronApp) {
          return {
            content: [{ type: 'text', text: `ℹ️ Repository at "${args.repoPath}" is not an Electron application.` }],
          };
        }

        const lines: string[] = [
          `# ⚡ Electron Process & IPC Architecture Audit: ${detailed.project.name}`,
          `**Total IPC Channels Mapped:** ${result.metrics.totalIpcChannels}`,
          `**Preload Exposed Methods:** ${result.metrics.totalPreloadExposedMethods}`,
          `**Preload Files:** ${result.metrics.preloadFiles.length}`,
          `**Main Process Files:** ${result.metrics.mainProcessFiles.length}`,
          '',
          `### Security Invariants:`,
          `- Context Isolation: ${result.metrics.security.contextIsolationExplicit ? '✅ Explicitly enabled' : '⚠️ Not explicitly configured'}`,
          `- Node Integration Disabled: ${result.metrics.security.nodeIntegrationDisabled ? '✅ Explicitly disabled' : '⚠️ Not explicitly configured'}`,
          `- Insecure WebPreferences Violations: ${result.metrics.security.insecurePatterns.length}`,
          '',
        ];

        if (result.metrics.unhandledIpcChannels.length > 0) {
          lines.push(`### Unhandled / Dangling IPC Channels (${result.metrics.unhandledIpcChannels.length}):`);
          for (const ch of result.metrics.unhandledIpcChannels.slice(0, 10)) {
            lines.push(`- \`${ch}\` (invoked in preload, missing static main handler)`);
          }
          if (result.metrics.unhandledIpcChannels.length > 10) {
            lines.push(`  ... and ${result.metrics.unhandledIpcChannels.length - 10} more`);
          }
          lines.push('');
        }

        if (result.gaps.length > 0) {
          lines.push(`### Architectural Gaps:`);
          for (const gap of result.gaps) {
            lines.push(`- **[${gap.severity.toUpperCase()}]** ${gap.title}`);
            lines.push(`  *Remediation:* ${gap.resolutionNote || gap.description}`);
          }
        } else {
          lines.push('✅ No critical Electron process or security gaps detected.');
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Failed to audit Electron application: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 22: Architectural Monotonic Ratchet Check
  server.tool(
    'buildview_check_ratchet',
    'Enforce monotonic architectural debt reduction across design tokens, control heights, type scale, icon scale, arbitrary classes, and blocking I/O',
    {
      repoPath: z.string().describe('Target repository path'),
      mode: z.enum(['enforce', 'update', 'report']).optional().describe('Ratchet mode (default: enforce)'),
      baselineFile: z.string().optional().describe('Custom baseline filename (default: .buildview-baseline.json)'),
    },
    async (args) => {
      try {
        const { RatchetManager } = await import('./analysis/ratchet-manager.js');
        const { DesignRulesEngine } = await import('./analysis/design-rules.js');
        const { PerformanceLinter } = await import('./analysis/performance-lint.js');

        const detailed = await RepoScannerService.scanRepositoryDetailed(store, args.repoPath, { outputPath: false });
        const designRes = DesignRulesEngine.analyzeDesignRules(args.repoPath, detailed.project.components, { enforceTestIds: true });
        const perfRes = PerformanceLinter.analyzePerformance(args.repoPath, detailed.project.components);

        const currentTotals = {
          colorLiterals: designRes.metrics.totalColorLiterals,
          offScaleHeights: designRes.metrics.totalOffScaleHeights,
          offScaleTypeSizes: designRes.metrics.totalOffScaleTypeSizes,
          iconLiterals: designRes.metrics.totalIconLiterals,
          arbitraryClasses: designRes.metrics.totalArbitraryClasses,
          unmergedDynamicClasses: designRes.metrics.totalUnmergedDynamicClasses,
          syncIoCalls: perfRes.metrics.syncFsInUiCount + perfRes.metrics.syncExecCount + perfRes.metrics.syncIpcCount,
          missingTestIds: designRes.metrics.totalMissingTestIds,
        };

        const result = RatchetManager.checkRatchet(args.repoPath, currentTotals, {
          mode: args.mode || 'enforce',
          baselineFile: args.baselineFile,
        });

        const lines: string[] = [
          `# 📊 BuildView Architectural Ratchet: ${detailed.project.name}`,
          `**Status:** ${result.passed ? '✅ PASSED' : '❌ FAILED (REGRESSION)'}`,
          `**Baseline File:** \`${result.baselinePath}\``,
          `**Summary:** ${result.summary}`,
          '',
          '### Debt Metrics Comparison:',
        ];

        for (const d of result.deltas) {
          const icon = d.status === 'regressed' ? '❌' : d.status === 'improved' ? '✨' : '🔹';
          const sign = d.delta > 0 ? `+${d.delta}` : `${d.delta}`;
          lines.push(`- ${icon} **${d.category}**: current ${d.current} | baseline ${d.baseline} | delta: **${sign}**`);
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          isError: !result.passed,
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Failed to check architectural ratchet: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 23: Whole-Repo Reachability & Liveness Audit
  server.tool(
    'buildview_check_reachability',
    'Audit whole-repo DAG reachability to detect unmounted UI components, orphan Electron preload bridge methods, and phantom E2E testids',
    {
      repoPath: z.string().describe('Target repository path'),
      customEntrypoints: z.array(z.string()).optional().describe('Optional custom entrypoints (default: auto-detected main/App/preload)'),
    },
    async (args) => {
      try {
        const { ReachabilityAnalyzer } = await import('./analysis/reachability-analyzer.js');
        const detailed = await RepoScannerService.scanRepositoryDetailed(store, args.repoPath, { outputPath: false });
        const result = detailed.reachability || ReachabilityAnalyzer.analyzeReachability(
          args.repoPath,
          [],
          detailed.fileEdges,
          args.customEntrypoints
        );

        const lines: string[] = [
          `# 🔍 Whole-Repo Reachability & Liveness Audit: ${detailed.project.name}`,
          `**Entrypoints:** ${result.entrypoints.join(', ')}`,
          `**Product Files:** ${result.metrics.totalProductFiles} total, ${result.metrics.totalReachableFiles} reachable`,
          '',
          `### 👻 Unmounted Dead UI Components (${result.metrics.totalUnmountedComponents}):`,
        ];

        for (const u of result.unmountedComponents.slice(0, 10)) {
          lines.push(`- **${u.name}** (\`${u.file}\`) — ${u.linesOfCode} lines, testids: [${u.testids.join(', ')}]`);
        }
        if (result.unmountedComponents.length > 10) {
          lines.push(`  ... and ${result.unmountedComponents.length - 10} more`);
        }

        lines.push('');
        lines.push(`### 🌉 Orphan Preload Bridge APIs (${result.metrics.totalOrphanPreloadMethods}):`);
        for (const o of result.orphanPreloadMethods.slice(0, 10)) {
          lines.push(`- \`window.electronAPI.${o.method}\` — 0 callers in renderer`);
        }
        if (result.orphanPreloadMethods.length > 10) {
          lines.push(`  ... and ${result.orphanPreloadMethods.length - 10} more`);
        }

        lines.push('');
        lines.push(`### 🎯 Phantom E2E TestIDs (${result.metrics.totalPhantomTestIds}):`);
        for (const p of result.phantomTestIds.slice(0, 10)) {
          lines.push(`- \`"${p.testId}"\` queried in \`${p.specFile}\`${p.definedInUnmountedFile ? ` (in unmounted \`${p.definedInUnmountedFile}\`)` : ''}`);
        }
        if (result.phantomTestIds.length > 10) {
          lines.push(`  ... and ${result.phantomTestIds.length - 10} more`);
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Failed to check reachability: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 15: Map Impacted Tests (L1-L6) via Reverse DAG
  server.tool(
    'buildview_test_map',
    'Computes the minimum set of impact tests across architectural lanes (L1-L6) for modified files using reverse DAG reachability.',
    {
      repoPath: z.string().describe('Absolute path to the target repository directory'),
      targetFiles: z.array(z.string()).optional().describe('List of modified or target files to map test impact for'),
    },
    async (args) => {
      try {
        const { TestIntelligenceEngine } = await import('./analysis/test-intelligence.js');
        const detailed = await RepoScannerService.scanRepositoryDetailed(store, args.repoPath, { outputPath: false });
        let targets = args.targetFiles || [];
        if (targets.length === 0) {
          try {
            const { execSync } = await import('child_process');
            const gitOut = execSync('git diff --name-only HEAD~1', { cwd: args.repoPath, encoding: 'utf-8' });
            targets = gitOut.split('\n').map((s) => s.trim()).filter(Boolean);
          } catch {
            targets = detailed.reachability.entrypoints.slice(0, 3);
          }
        }
        if (targets.length === 0) targets = detailed.reachability.entrypoints.slice(0, 3);

        const result = TestIntelligenceEngine.mapImpactedTests(args.repoPath, targets, detailed.parsedFiles, detailed.fileEdges);

        const lines: string[] = [
          `# 🧭 BuildView Reverse-DAG Test Impact Mapper: ${detailed.project.name}`,
          `**Targets (${result.targetFiles.length}):** ${result.targetFiles.join(', ')}`,
          `**Total Impacted Tests:** ${result.impactedTests.length}`,
          '',
          '### 📊 Impacted Tests by Lane:',
        ];

        for (const [lane, files] of Object.entries(result.byLane)) {
          if (files.length > 0) {
            lines.push(`- **[${lane.toUpperCase()}]** (${files.length} test files):`);
            for (const f of files.slice(0, 5)) {
              lines.push(`  - \`${f}\``);
            }
            if (files.length > 5) lines.push(`  ... and ${files.length - 5} more`);
          }
        }

        lines.push('');
        lines.push('### ⚡ Recommended Sub-Second Execution Commands:');
        for (const cmd of result.commands) {
          lines.push(`- **[${cmd.lane}]** ${cmd.description}:`);
          lines.push(`  \`$ ${cmd.command}\``);
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Failed to map test impact: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 16: Auto-Heal & Repair Dead Spec Locators
  server.tool(
    'buildview_repair_specs',
    'Detects unmounted or dead spec selectors and suggests or auto-applies semantic replacements from live surfaces.',
    {
      repoPath: z.string().describe('Absolute path to the target repository directory'),
      autoApply: z.boolean().optional().describe('Whether to rewrite dead selectors in spec files on disk'),
    },
    async (args) => {
      try {
        const { TestIntelligenceEngine } = await import('./analysis/test-intelligence.js');
        const detailed = await RepoScannerService.scanRepositoryDetailed(store, args.repoPath, { outputPath: false });
        const repair = TestIntelligenceEngine.suggestSpecRepairs(args.repoPath, detailed.parsedFiles, detailed.fileEdges, {
          autoApply: args.autoApply,
        });

        const lines: string[] = [
          `# 🩹 BuildView E2E Spec Auto-Repair: ${detailed.project.name}`,
          `**Dead Selectors Found:** ${repair.totalDeadSelectors}`,
          `**Auto-Repaired:** ${repair.repairedCount}`,
          '',
          '### 🎯 Selector Suggestions:',
        ];

        for (const sug of repair.suggestions) {
          lines.push(`- **\`${sug.deadTestId}\`** in \`${sug.specFile}\``);
          if (sug.suggestedLiveTestId) {
            lines.push(`  - 👉 Suggestion: replace with \`${sug.suggestedLiveTestId}\` (confidence: ${(sug.confidence * 100).toFixed(0)}%)`);
            if (sug.patchDiff) {
              lines.push('  ```diff');
              lines.push(sug.patchDiff);
              lines.push('  ```');
            }
          } else {
            lines.push(`  - ⚠️ ${sug.reason}`);
          }
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Failed to repair specs: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}


