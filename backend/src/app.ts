import express, { type RequestHandler } from 'express';

import { createErrorHandler, HttpError, toErrorEnvelope } from './errors.js';
import { createHealthRouter, type HealthCheck } from './routes/health.js';

export function createApp(checkHealth: HealthCheck, logger: Pick<Console, 'error'> = console): express.Express {
  const app = express();
  app.disable('x-powered-by');

  const limitJsonBodySize = express.json({ limit: '16kb' });
  app.use('/api/days', requireJsonForBody, limitJsonBodySize);
  app.use('/api/health', createHealthRouter(checkHealth));

  app.use('/api', (_request, response) => {
    const error = new HttpError(404, 'NOT_FOUND', 'API endpoint not found');
    response.status(error.status).json(toErrorEnvelope(error));
  });

  app.use(createErrorHandler(logger));
  return app;
}

export const requireJsonForBody: RequestHandler = (request, _response, next) => {
  if (
    (request.method === 'POST' || request.method === 'PATCH') &&
    request.is('application/json') !== 'application/json'
  ) {
    next(new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
    return;
  }

  next();
};
