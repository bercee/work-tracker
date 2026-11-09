import { Router } from 'express';
import { z } from 'zod';
import { createWorkdaySchema, dateSchema, patchWorkdaySchema, workdayFieldsSchema } from '@work-tracker/contracts';

import type { WorkdayDatabase } from '../database/workdayDatabase.js';
import { HttpError } from '../errors.js';

const dayParams = z.object({ date: dateSchema });

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Workday not found', 'date');

export function createDaysRouter(database: WorkdayDatabase): Router {
  const router = Router();

  router.get('/', async (_request, response) => {
    response.status(200).json(await database.list());
  });

  router.post('/', async (request, response) => {
    const input = createWorkdaySchema.parse(request.body);
    const workday = await database.add(input);
    if (!workday) throw new HttpError(409, 'CONFLICT', 'A Workday already exists for this date', 'date');
    response.status(201).json(workday);
  });

  router.patch('/:date', async (request, response) => {
    const { date } = dayParams.parse(request.params);
    const patch = patchWorkdaySchema.parse(request.body);
    const current = await database.get(date);
    if (!current) throw notFound();

    // A patch alone cannot know the stored values, so the rules are checked on the merged result.
    const { clockIn, clockOut, lunchMinutes, halfDay } = current;
    const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    const fields = workdayFieldsSchema.parse({ clockIn, clockOut, lunchMinutes, halfDay, ...defined });

    const workday = await database.update(date, fields);
    if (!workday) throw notFound();
    response.status(200).json(workday);
  });

  router.delete('/:date', async (request, response) => {
    const { date } = dayParams.parse(request.params);
    if (!(await database.delete(date))) throw notFound();
    response.status(204).send();
  });

  return router;
}
