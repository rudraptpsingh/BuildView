import os from 'os';
import path from 'path';
import { BuildViewStore } from '../../store.js';
import { RepoScannerService, DetailedScanResult } from '../../repo-scanner-service.js';

export const FIXTURES_DIR = path.resolve(import.meta.dirname, '../../../../test-fixtures');

/** Scans a fixture repo under test-fixtures/ without writing an artifact. */
export function scanFixture(name: string): Promise<DetailedScanResult> {
  return RepoScannerService.scanRepositoryDetailed(new BuildViewStore(path.join(os.tmpdir(), 'buildview-test-store')), path.join(FIXTURES_DIR, name), {
    outputPath: false,
  });
}

export function gapsOf(result: DetailedScanResult) {
  return result.project.components.flatMap((c) => c.gaps.map((g) => ({ ...g, componentId: c.id, layerId: c.layerId })));
}
