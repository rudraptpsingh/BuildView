import { app } from 'electron';
import { readPolicy } from './policyBridge';
app.whenReady().then(() => readPolicy());
