export function lazyStart(): Promise<unknown> {
  return import('./lazy2');
}
