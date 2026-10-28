import { c } from '../c';
export function f(): number {
  return typeof c === 'function' ? 2 : 0;
}
