import type { Workday } from '@work-tracker/contracts';

export type WorkdayFields = Omit<Workday, 'date'>;

export interface WorkdayDatabase {
  /** Newest date first. */
  list(): Promise<Workday[]>;
  get(date: string): Promise<Workday | undefined>;
  /** Resolves to undefined when a Workday already exists for the date. */
  add(input: Workday): Promise<Workday | undefined>;
  /** Replaces every field; resolves to undefined when there is no Workday for the date. */
  update(date: string, fields: WorkdayFields): Promise<Workday | undefined>;
  delete(date: string): Promise<boolean>;
}
