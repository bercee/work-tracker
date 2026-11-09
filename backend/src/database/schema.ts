import { sql } from 'drizzle-orm';
import { boolean, check, date, integer, pgTable, time } from 'drizzle-orm/pg-core';

// The constraints mirror the shared request rules, so a race between two requests cannot store an invalid Workday.
export const workdays = pgTable(
  'workdays',
  {
    date: date({ mode: 'string' }).primaryKey(),
    clockIn: time('clock_in', { precision: 0 }).notNull(),
    clockOut: time('clock_out', { precision: 0 }),
    lunchMinutes: integer('lunch_minutes'),
    halfDay: boolean('half_day').notNull().default(false),
  },
  (table) => [
    check('workdays_clock_out_after_clock_in', sql`${table.clockOut} IS NULL OR ${table.clockOut} > ${table.clockIn}`),
    check(
      'workdays_lunch_minutes_range',
      sql`${table.lunchMinutes} IS NULL OR ${table.lunchMinutes} BETWEEN 0 AND 1439`,
    ),
    check(
      'workdays_lunch_shorter_than_span',
      sql`${table.clockOut} IS NULL OR ${table.lunchMinutes} IS NULL OR ${table.lunchMinutes} * interval '1 minute' < ${table.clockOut} - ${table.clockIn}`,
    ),
  ],
);
