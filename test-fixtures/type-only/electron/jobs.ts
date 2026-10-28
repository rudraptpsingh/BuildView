import { ipcMain } from 'electron';
export interface JobStatus {
  id: string;
  done: boolean;
}
export function startJobs(): void {
  ipcMain.handle('jobs', () => []);
}
export const JOB_LIMIT = 4;
