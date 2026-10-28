import { canDownload } from '../../../src/policy/access';
import { shareLabel } from '../../../shared/copy';
export function handleShare(req: Request): Response {
  return new Response(canDownload(req.url) ? shareLabel : 'no');
}
