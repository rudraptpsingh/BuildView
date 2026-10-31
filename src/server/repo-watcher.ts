import fs from 'node:fs';
import path from 'node:path';
import { BuildViewStore } from './store.js';
import { matchesAnyGlob, normalizePath } from './analysis/glob.js';
import type { RepositoryFileDelta } from '../shared/types.js';

const ignored = new Set(['.git','.buildview','node_modules','dist','.qa','.cache','__pycache__','.venv','coverage']);
export function isIgnoredWatchPath(relative: string) {
  return normalizePath(relative).split('/').some(part=>ignored.has(part)) || /(?:\.pyc|\.log|\.(?:db|sqlite)-(?:wal|shm))$/.test(relative);
}
function scan(root: string) {
  const snapshot: Record<string,string> = {};
  const walk = (dir:string) => {
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      const absolute=path.join(dir,entry.name), relative=normalizePath(path.relative(root,absolute));
      if(isIgnoredWatchPath(relative) || entry.isSymbolicLink()) continue;
      if(entry.isDirectory()) walk(absolute);
      else if(entry.isFile()) {
        const stat=fs.lstatSync(absolute,{bigint:true});
        if(stat.isFile()) snapshot[relative]=`${stat.size}:${stat.mtimeNs}`;
      }
    }
  };
  walk(root);return snapshot;
}

/** Observes file deltas; never rescans/replaces architecture or infers passing tests. */
export function startRepositoryWatcher(store:BuildViewStore, repoPath:string, debounceMs=180) {
  const root=fs.realpathSync(path.resolve(repoPath));
  let previous=store.getProject().repositoryWatch?.root===root ? store.getProject().repositoryWatch!.snapshot : undefined;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let closed=false;
  const flush = () => {
    if(closed)return;
    let next:Record<string,string>;
    try {next=scan(root);} catch(error) {
      store.recordRepositoryWatchError(root,error instanceof Error?error.message:String(error));return;
    }
    const changes:RepositoryFileDelta[]=[];
    if(previous) for(const file of new Set([...Object.keys(previous),...Object.keys(next)])) {
      if(previous[file]===next[file])continue;
      const components=store.getProject().components.filter(c=>
        matchesAnyGlob(file,c.fileGlobs) || c.files.some(f=>
          normalizePath(path.isAbsolute(f.path)?path.relative(root,f.path):f.path)===file && file!==c.planSource));
      changes.push({path:file,status:!next[file]?'deleted':!previous[file]?'created':'modified',observedAt:new Date().toISOString(),componentIds:components.map(c=>c.id)});
    }
    previous=next;store.recordRepositoryObservation(root,next,changes);
  };
  flush();
  const schedule=(filename:string|null) => {
    if(filename && isIgnoredWatchPath(filename))return;
    if(timer)clearTimeout(timer);
    timer=setTimeout(flush,debounceMs);timer.unref();
  };
  let watcher:fs.FSWatcher|undefined;
  try {
    watcher=fs.watch(root,{recursive:true},(_event,name)=>schedule(name?.toString()||null));
    watcher.on('error',error=>store.recordRepositoryWatchError(root,error.message));
  } catch(error) {
    store.recordRepositoryWatchError(root,`Native watch unavailable; periodic reconciliation active: ${error instanceof Error?error.message:String(error)}`);
  }
  // Reconcile missed native events (and provide a fallback on unsupported platforms).
  const reconciliation=setInterval(flush,5000);reconciliation.unref();
  return {root,flush,close(){if(timer)clearTimeout(timer);clearInterval(reconciliation);watcher?.close();flush();closed=true;}};
}
