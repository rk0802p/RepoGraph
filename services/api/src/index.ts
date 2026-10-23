import { createApp } from './app.js';
import { config } from './config/index.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 RepoGraph API running on http://localhost:${config.port}`);
  console.log(`📍 Environment: ${config.nodeEnv}`);
  console.log(`📡 Health Check: http://localhost:${config.port}/api/health`);
  console.log(`======================================================\n`);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\nReceived ${signal}. Gracefully shutting down...`);
  server.close(() => {
    console.log('RepoGraph API server closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
