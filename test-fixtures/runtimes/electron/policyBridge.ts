import { canDownload } from '../src/policy/access';
import { shareLabel } from '../shared/copy';
export function readPolicy(): string {
  return canDownload('x') ? shareLabel : '';
}
