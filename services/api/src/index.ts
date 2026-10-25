import { createApp } from './app.js';
import { config, validateConfig } from './config/index.js';

const validation = validateConfig(config);
if (!validation.valid) {
  console.error('[Config Error] Invalid configuration detected:');
  for (const err of validation.errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

if (validation.warnings.length > 0) {
  for (const warn of validation.warnings) {
    console.warn(`[Config Warning] ${warn}`);
  }
}

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 RepoGraph API running on http://localhost:${config.port}`);
  console.log(`📍 Environment: ${config.nodeEnv}`);
  console.log(`📁 Workspace: ${config.repositoryWorkspace}`);
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
