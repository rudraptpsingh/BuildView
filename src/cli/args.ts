export interface CliArgs {
  command: 'scan' | 'plan' | 'check' | 'remediate' | 'ratchet' | 'reachability' | 'test-map' | 'repair-specs';
  target: string;
  json: boolean;
  out?: string;
  noWrite: boolean;
  config?: string;
  port?: string;
  failOn?: string;
  maxSeverity?: string;
  baseline?: string;
  updateBaseline: boolean;
  mode?: string;
  gapId?: string;
  format?: string;
  budget?: string;
  fixTestids?: boolean;
  apply?: boolean;
  extraPositionals?: string[];
}

const VALUE_FLAGS = new Set([
  '--out',
  '--config',
  '--port',
  '--fail-on',
  '--max-severity',
  '--baseline',
  '--mode',
  '--gap-id',
  '--format',
  '--budget',
]);

export function parseCliArgs(argv: string[]): CliArgs | 'help' {
  const args: CliArgs = { command: 'scan', target: '.', json: false, noWrite: false, updateBaseline: false };
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let value: string | undefined;
    if (a.startsWith('--') && a.includes('=')) {
      value = a.slice(a.indexOf('=') + 1);
      a = a.slice(0, a.indexOf('='));
    }
    if (a === 'help' && positionals.length === 0) return 'help';
    if (a === '--help' || a === '-h') return 'help';
    if (VALUE_FLAGS.has(a)) {
      if (value === undefined) value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new Error(`${a} needs a value`);
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase()) as 'out' | 'config' | 'port' | 'failOn' | 'maxSeverity' | 'baseline' | 'mode';
      args[key] = value;
    } else if (a === '--json') {
      args.json = true;
    } else if (a === '--no-write') {
      args.noWrite = true;
    } else if (a === '--update-baseline') {
      args.updateBaseline = true;
    } else if (a === '--fix-testids') {
      args.fixTestids = true;
    } else if (a === '--apply') {
      args.apply = true;
    } else if (a.startsWith('-')) {
      throw new Error(`Unknown option ${a}`);
    } else {
      positionals.push(a);
    }
  }
  const knownCommands = new Set(['scan', 'check', 'plan', 'remediate', 'ratchet', 'reachability', 'test-map', 'repair-specs']);
  if (knownCommands.has(positionals[0])) {
    args.command = positionals.shift() as CliArgs['command'];
  }
  if (positionals[0]) args.target = positionals[0];
  if (positionals.length > 1) {
    args.extraPositionals = positionals.slice(1);
  }
  if (args.updateBaseline && !args.baseline) throw new Error('--update-baseline needs --baseline <file>');
  return args;
}
