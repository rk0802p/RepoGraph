import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigin: string;
  databaseUrl: string;
  redisUrl: string;
  repositoryWorkspace: string;
}

export const config: AppConfig = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://repograph:repograph_secret@localhost:5432/repograph_db',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  repositoryWorkspace: process.env.REPOSITORY_WORKSPACE
    ? path.resolve(process.env.REPOSITORY_WORKSPACE)
    : path.resolve(process.cwd(), '../..'),
};
