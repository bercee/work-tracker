import { Router } from 'express';

import { HttpError, toErrorEnvelope } from '../errors.js';

export type HealthCheck = () => Promise<void>;

export function createHealthRouter(checkHealth: HealthCheck): Router {
  const router = Router();

  router.get('/', async (_request, response) => {
    try {
      await checkHealth();
      response.status(200).json({ status: 'ok' });
    } catch {
      // The probe only runs SELECT 1, so any failure means the database is unavailable.
      const error = new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable');
      response.status(error.status).json({ status: 'unavailable', ...toErrorEnvelope(error) });
    }
  });

  return router;
}
