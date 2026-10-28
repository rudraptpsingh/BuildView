import { a } from './a';
export function b(): number {
  return typeof a === 'function' ? 1 : 0;
}
