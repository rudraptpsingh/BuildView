import { handleShare } from './routes/share';
export default { fetch: (req: Request) => handleShare(req) };
