import { desc, eq } from 'drizzle-orm';
import type { Workday } from '@work-tracker/contracts';

import type { PostgresConnection } from './postgres.js';
import { workdays } from './schema.js';
import type { WorkdayDatabase, WorkdayFields } from './workdayDatabase.js';

type WorkdayRow = typeof workdays.$inferSelect;

// Postgres returns `time` as HH:MM:SS; the API speaks minute precision only.
const toMinutes = (time: string): string => time.slice(0, 5);

function toWorkday(row: WorkdayRow): Workday {
  return {
    date: row.date,
    clockIn: toMinutes(row.clockIn),
    clockOut: row.clockOut === null ? null : toMinutes(row.clockOut),
    lunchMinutes: row.lunchMinutes,
    halfDay: row.halfDay,
  };
}

export class PostgresWorkdayDatabase implements WorkdayDatabase {
  constructor(private readonly db: PostgresConnection['db']) {}

  async list(): Promise<Workday[]> {
    const rows = await this.db.select().from(workdays).orderBy(desc(workdays.date));
    return rows.map(toWorkday);
  }

  async get(date: string): Promise<Workday | undefined> {
    const [row] = await this.db.select().from(workdays).where(eq(workdays.date, date));
    return row && toWorkday(row);
  }

  async add(input: Workday): Promise<Workday | undefined> {
    const [row] = await this.db.insert(workdays).values(input).onConflictDoNothing().returning();
    return row && toWorkday(row);
  }

  async update(date: string, fields: WorkdayFields): Promise<Workday | undefined> {
    const [row] = await this.db.update(workdays).set(fields).where(eq(workdays.date, date)).returning();
    return row && toWorkday(row);
  }

  async delete(date: string): Promise<boolean> {
    const rows = await this.db.delete(workdays).where(eq(workdays.date, date)).returning({ date: workdays.date });
    return rows.length > 0;
  }
}
