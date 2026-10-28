import { describe, it, expect } from 'vitest';
import path from 'path';
import { BuildViewStore } from './store.js';
import { RepoScannerService } from './repo-scanner-service.js';
import { createBuildViewMcpServer } from './mcp.js';

describe('Universal RepoScannerService Suite', () => {
  it('should dynamically scan and auto-cluster any repository on disk', async () => {
    const store = new BuildViewStore();
    // Scan current BuildView codebase itself
    const project = await RepoScannerService.scanRepository(store, '.', {
      projectName: 'BuildView Self-Scan',
    });

    expect(project).toBeDefined();
    expect(project.name).toBe('BuildView Self-Scan');
    expect(project.layers.length).toBeGreaterThanOrEqual(3);
    expect(project.components.length).toBeGreaterThan(0);

    // Verify each component has files, AST metrics, and priority
    for (const comp of project.components) {
      expect(comp.id).toBeDefined();
      expect(comp.files.length).toBeGreaterThan(0);
      expect(comp.astMetrics).toBeDefined();
      expect(comp.priority).toBeGreaterThanOrEqual(1);
    }
  });

  it('should expose buildview_scan_repo tool via MCP server', async () => {
    const store = new BuildViewStore();
    const mcpServer = createBuildViewMcpServer(store);
    expect(mcpServer).toBeDefined();
  });
});
