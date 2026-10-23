import { Router } from 'express';
import { healthRouter } from './health.js';
import { repositoriesRouter } from './repositories.js';
import { graphRouter } from './graph.js';
import { searchRouter } from './search.js';
import { analysisRouter } from './analysis.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/repositories', repositoriesRouter);
apiRouter.use('/repositories', graphRouter);
apiRouter.use('/repositories', searchRouter);
apiRouter.use('/repositories', analysisRouter);
