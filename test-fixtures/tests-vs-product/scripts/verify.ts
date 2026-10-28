import { launch } from '../e2e/helpers/app';
export function verifyBuild(): void {
  if (process.env.DEEP) launch();
}
