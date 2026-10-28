import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BuildViewStore } from './store.js';
import { RepoScannerService } from './repo-scanner-service.js';

export function createBuildViewMcpServer(store: BuildViewStore) {
  const server = new McpServer({
    name: 'BuildView',
    version: '1.0.0',
  });

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
      const comp = store.defineComponent(args);
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
    'Update the build progress, status, and modified files for an architectural component in real-time as you code',
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
    'Get the execution roadmap: next prioritized layer & component to build, and list of outstanding gaps',
    {},
    async () => {
      const roadmap = store.getRoadmap();
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

  return server;
}
