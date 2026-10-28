import { canDownload } from '../src/policy/access';
export const shareLabel = canDownload('s') ? 'Share' : 'Hidden';
