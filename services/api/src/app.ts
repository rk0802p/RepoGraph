import express, { Express } from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';

export function createApp(): Express {
  const app = express();

  // Basic Middleware
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // Mount API Router
  app.use('/api', apiRouter);

  // 404 Handler
  app.use((_req, res) => {
    res.status(404).json({
      status: 'error',
      statusCode: 404,
      message: 'Resource not found',
    });
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
