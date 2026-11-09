import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import type { TestDatabase } from '../helpers/testDb.js';
import { startTestDatabase } from '../helpers/testDb.js';

const healthy = () => Promise.resolve();

describe('Workdays API', () => {
  let testDatabase: TestDatabase;
  let app: ReturnType<typeof createApp>;
  const logger = { error: vi.fn() };

  beforeAll(async () => {
    testDatabase = await startTestDatabase();
  }, 60_000);

  afterAll(async () => {
    await testDatabase.stop();
  });

  beforeEach(async () => {
    await testDatabase.reset();
    logger.error.mockClear();
    app = createApp(testDatabase.database, healthy, logger);
  });

  const post = (body: unknown) =>
    request(app)
      .post('/api/days')
      .send(body as object);

  const expectError = (response: request.Response, status: number, code: string, field: string | undefined) => {
    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(response.body.error.field).toBe(field);
  };

  describe('GET /api/days', () => {
    it('returns an empty list when there are no Workdays', async () => {
      const response = await request(app).get('/api/days');
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('lists Workdays newest date first, with times as HH:MM and null fields preserved', async () => {
      await post({ date: '2026-11-09', clockIn: '08:00', clockOut: '17:00', lunchMinutes: 60 });
      await post({ date: '2026-11-11', clockIn: '08:05' });
      await post({ date: '2026-11-10', clockIn: '09:30', clockOut: '13:45', lunchMinutes: 0, halfDay: true });

      const response = await request(app).get('/api/days');
      expect(response.body).toEqual([
        { date: '2026-11-11', clockIn: '08:05', clockOut: null, lunchMinutes: null, halfDay: false },
        { date: '2026-11-10', clockIn: '09:30', clockOut: '13:45', lunchMinutes: 0, halfDay: true },
        { date: '2026-11-09', clockIn: '08:00', clockOut: '17:00', lunchMinutes: 60, halfDay: false },
      ]);
    });
  });

  describe('POST /api/days', () => {
    it('creates a Workday from a Clock-in only and applies the defaults', async () => {
      const response = await post({ date: '2026-11-11', clockIn: '08:00' });
      expect(response.status).toBe(201);
      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.body).toEqual({
        date: '2026-11-11',
        clockIn: '08:00',
        clockOut: null,
        lunchMinutes: null,
        halfDay: false,
      });
    });

    it('creates a Workday from a full body', async () => {
      const body = { date: '2026-11-10', clockIn: '08:00', clockOut: '13:00', lunchMinutes: 0, halfDay: true };
      const response = await post(body);
      expect(response.status).toBe(201);
      expect(response.body).toEqual(body);
      expect((await request(app).get('/api/days')).body).toEqual([body]);
    });

    it('answers 409 on field date for a duplicate date and leaves the stored Workday unchanged', async () => {
      const original = { date: '2026-11-09', clockIn: '08:00', clockOut: '17:00', lunchMinutes: 60, halfDay: false };
      await post(original);

      const response = await post({ date: '2026-11-09', clockIn: '10:00' });
      expectError(response, 409, 'CONFLICT', 'date');
      expect((await request(app).get('/api/days')).body).toEqual([original]);
    });

    it('rejects an unknown field', async () => {
      const response = await post({ date: '2026-11-11', clockIn: '08:00', shift: 'early' });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a bad date on field date', async () => {
      expectError(await post({ date: '2026-02-30', clockIn: '08:00' }), 400, 'VALIDATION_ERROR', 'date');
      expectError(await post({ clockIn: '08:00' }), 400, 'VALIDATION_ERROR', 'date');
    });

    it('rejects year 0000 on field date', async () => {
      expectError(await post({ date: '0000-01-01', clockIn: '08:00' }), 400, 'VALIDATION_ERROR', 'date');
    });

    it('rejects a bad time on the field that carries it', async () => {
      expectError(await post({ date: '2026-11-11', clockIn: '8:00' }), 400, 'VALIDATION_ERROR', 'clockIn');
      expectError(await post({ date: '2026-11-11', clockIn: '24:00' }), 400, 'VALIDATION_ERROR', 'clockIn');
      expectError(
        await post({ date: '2026-11-11', clockIn: '08:00', clockOut: '17:60' }),
        400,
        'VALIDATION_ERROR',
        'clockOut',
      );
    });

    it('rejects a non-integer Lunch break on field lunchMinutes', async () => {
      expectError(
        await post({ date: '2026-11-11', clockIn: '08:00', lunchMinutes: 30.5 }),
        400,
        'VALIDATION_ERROR',
        'lunchMinutes',
      );
    });

    it('rejects a Lunch break outside 0 to 1439 on field lunchMinutes', async () => {
      expectError(
        await post({ date: '2026-11-11', clockIn: '08:00', lunchMinutes: -1 }),
        400,
        'VALIDATION_ERROR',
        'lunchMinutes',
      );
      expectError(
        await post({ date: '2026-11-11', clockIn: '08:00', lunchMinutes: 1440 }),
        400,
        'VALIDATION_ERROR',
        'lunchMinutes',
      );
    });

    it('rejects a Clock-out that is not after Clock-in on field clockOut', async () => {
      expectError(
        await post({ date: '2026-11-11', clockIn: '08:00', clockOut: '08:00' }),
        400,
        'VALIDATION_ERROR',
        'clockOut',
      );
      expectError(
        await post({ date: '2026-11-11', clockIn: '17:00', clockOut: '08:00' }),
        400,
        'VALIDATION_ERROR',
        'clockOut',
      );
    });

    it('rejects a Lunch break that is not shorter than the span on field lunchMinutes', async () => {
      expectError(
        await post({ date: '2026-11-11', clockIn: '08:00', clockOut: '09:00', lunchMinutes: 60 }),
        400,
        'VALIDATION_ERROR',
        'lunchMinutes',
      );
    });

    it('accepts a Lunch break with no Clock-out', async () => {
      const response = await post({ date: '2026-11-11', clockIn: '08:00', lunchMinutes: 600 });
      expect(response.status).toBe(201);
      expect(response.body.lunchMinutes).toBe(600);
    });

    it('answers 415 without a JSON content type', async () => {
      const response = await request(app)
        .post('/api/days')
        .set('Content-Type', 'text/plain')
        .send('{"date":"2026-11-11","clockIn":"08:00"}');
      expectError(response, 415, 'UNSUPPORTED_MEDIA_TYPE', undefined);
    });
  });

  describe('PATCH /api/days/:date', () => {
    const date = '2026-11-11';
    const patch = (body: unknown, target = date) =>
      request(app)
        .patch(`/api/days/${target}`)
        .send(body as object);
    const seed = () => post({ date, clockIn: '08:00' });

    it('sets the Lunch break only', async () => {
      await seed();
      const response = await patch({ lunchMinutes: 60 });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ date, clockIn: '08:00', clockOut: null, lunchMinutes: 60, halfDay: false });
    });

    it('sets the Clock-out together with a Lunch break', async () => {
      await seed();
      const response = await patch({ clockOut: '17:00', lunchMinutes: 60 });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ date, clockIn: '08:00', clockOut: '17:00', lunchMinutes: 60, halfDay: false });
      expect((await request(app).get('/api/days')).body).toEqual([response.body]);
    });

    it('toggles Half day', async () => {
      await seed();
      expect((await patch({ halfDay: true })).body.halfDay).toBe(true);
      expect((await patch({ halfDay: false })).body.halfDay).toBe(false);
    });

    it('clears a field when it is set to null', async () => {
      await post({ date: '2026-11-12', clockIn: '08:00', clockOut: '17:00', lunchMinutes: 60 });
      const response = await patch({ clockOut: null, lunchMinutes: null }, '2026-11-12');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        date: '2026-11-12',
        clockIn: '08:00',
        clockOut: null,
        lunchMinutes: null,
        halfDay: false,
      });
    });

    it('answers 400 for a patch that breaks the rules against stored values and changes nothing', async () => {
      await post({ date, clockIn: '08:00', clockOut: '17:00', lunchMinutes: 60 });

      expectError(await patch({ clockIn: '17:30' }), 400, 'VALIDATION_ERROR', 'clockOut');
      expectError(await patch({ lunchMinutes: 540 }), 400, 'VALIDATION_ERROR', 'lunchMinutes');

      expect((await request(app).get('/api/days')).body).toEqual([
        { date, clockIn: '08:00', clockOut: '17:00', lunchMinutes: 60, halfDay: false },
      ]);
    });

    it('rejects a bad value or an unknown field in the patch', async () => {
      await seed();
      expectError(await patch({ clockOut: 'noon' }), 400, 'VALIDATION_ERROR', 'clockOut');
      expect((await patch({ date: '2026-11-12' })).status).toBe(400);
    });

    it('answers 404 on field date when the Workday does not exist', async () => {
      expectError(await patch({ lunchMinutes: 60 }), 404, 'NOT_FOUND', 'date');
    });

    it('answers 400 on field date for a bad date parameter', async () => {
      expectError(await patch({ lunchMinutes: 60 }, 'not-a-date'), 400, 'VALIDATION_ERROR', 'date');
    });

    it('treats an empty body as a no-op that returns the stored Workday', async () => {
      await post({ date, clockIn: '08:00', clockOut: '17:00', lunchMinutes: 60 });
      const response = await patch({});
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ date, clockIn: '08:00', clockOut: '17:00', lunchMinutes: 60, halfDay: false });
    });

    it('answers 415 without a JSON content type', async () => {
      await seed();
      const response = await request(app).patch(`/api/days/${date}`).set('Content-Type', 'text/plain').send('{}');
      expectError(response, 415, 'UNSUPPORTED_MEDIA_TYPE', undefined);
    });
  });

  describe('DELETE /api/days/:date', () => {
    it('answers 204 and the Workday is gone', async () => {
      await post({ date: '2026-11-11', clockIn: '08:00' });
      const response = await request(app).delete('/api/days/2026-11-11');
      expect(response.status).toBe(204);
      expect(response.body).toEqual({});
      expect((await request(app).get('/api/days')).body).toEqual([]);
    });

    it('answers 404 on field date when the Workday does not exist', async () => {
      expectError(await request(app).delete('/api/days/2026-11-11'), 404, 'NOT_FOUND', 'date');
    });

    it('answers 400 on field date for a bad date parameter', async () => {
      expectError(await request(app).delete('/api/days/yesterday'), 400, 'VALIDATION_ERROR', 'date');
    });
  });

  describe('platform behaviour', () => {
    it('answers unknown /api paths with a JSON 404', async () => {
      const response = await request(app).get('/api/nothing');
      expectError(response, 404, 'NOT_FOUND', undefined);
    });

    it('answers 500 and logs when the database fails unexpectedly', async () => {
      const failing = createApp(
        { ...testDatabase.database, list: () => Promise.reject(new Error('boom')) },
        healthy,
        logger,
      );
      const response = await request(failing).get('/api/days');
      expectError(response, 500, 'INTERNAL_ERROR', undefined);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
