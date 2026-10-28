import { Panel } from '../../src/components/Panel';
import { verifyBuild } from '../../scripts/verify';
export function launch(): string {
  verifyBuild();
  return Panel({ state: 'e2e' });
}
