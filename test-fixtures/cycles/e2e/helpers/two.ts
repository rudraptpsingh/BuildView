import { one } from './one';
export const two = (): number => (typeof one === 'function' ? 2 : 0);
