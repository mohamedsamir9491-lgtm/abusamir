import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (config.isTest ? 'silent' : 'info'),
  redact: ['req.headers.authorization', 'req.headers.cookie', 'password', 'password_hash'],
});
