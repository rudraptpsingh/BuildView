import { app } from 'electron';
import { startJobs } from './jobs';
app.whenReady().then(() => startJobs());
