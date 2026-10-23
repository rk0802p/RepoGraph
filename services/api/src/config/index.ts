import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigin: string;
  databaseUrl: string;
  redisUrl: string;
}

export const config: AppConfig = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://repograph:repograph_secret@localhost:5432/repograph_db',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
};
