import { a } from './a';
import { c } from './c';
import { t1 } from './t1';
import { lazyStart } from './lazy1';
export const all = [a(), c(), t1, lazyStart()];
