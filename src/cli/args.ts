export interface CliArgs {
  command: 'scan' | 'plan' | 'check';
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
}

const VALUE_FLAGS = new Set(['--out', '--config', '--port', '--fail-on', '--max-severity', '--baseline']);

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
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase()) as 'out' | 'config' | 'port' | 'failOn' | 'maxSeverity' | 'baseline';
      args[key] = value;
    } else if (a === '--json') {
      args.json = true;
    } else if (a === '--no-write') {
      args.noWrite = true;
    } else if (a === '--update-baseline') {
      args.updateBaseline = true;
    } else if (a.startsWith('-')) {
      throw new Error(`Unknown option ${a}`);
    } else {
      positionals.push(a);
    }
  }
  if (positionals[0] === 'scan' || positionals[0] === 'check' || positionals[0] === 'plan') {
    args.command = positionals.shift() as CliArgs['command'];
  }
  if (positionals[0]) args.target = positionals[0];
  if (args.updateBaseline && !args.baseline) throw new Error('--update-baseline needs --baseline <file>');
  return args;
}
