export function used(): number {
  return localOnly() + 1;
}

export function localOnly(): number {
  return 41;
}

export function deadFn(): number {
  return 0;
}

export const DEAD_CONST = { localOnly: 1 };
