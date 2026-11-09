import { z } from 'zod';

// ISO 8601 allows year 0000, but a calendar date starts at year 1.
export const dateSchema = z.iso
  .date({ error: 'Enter a valid date.' })
  .refine((date) => !date.startsWith('0000'), { error: 'Enter a valid date.' });

export const timeSchema = z
  .string({ error: 'Enter a time as HH:MM.' })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Enter a time as HH:MM.' });

const LUNCH_MESSAGE = 'Enter the Lunch break as whole minutes from 0 to 1439.';
export const lunchMinutesSchema = z
  .number({ error: LUNCH_MESSAGE })
  .int({ error: LUNCH_MESSAGE })
  .min(0, { error: LUNCH_MESSAGE })
  .max(1439, { error: LUNCH_MESSAGE });

export const minutesOfDay = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export interface WorkdayTimes {
  clockIn: string;
  clockOut: string | null;
  lunchMinutes: number | null;
}

// Adds the Clock-out and Lunch break rules to any schema producing these fields.
// Reports on `clockOut` ('Clock-out must be after Clock-in.') or on `lunchMinutes`
// ('Lunch break must be shorter than the time between Clock-in and Clock-out.').
export const workdayRules = (fields: WorkdayTimes, context: z.RefinementCtx): void => {
  if (fields.clockOut === null) return;
  const span = minutesOfDay(fields.clockOut) - minutesOfDay(fields.clockIn);
  if (span <= 0) {
    // A non-positive span would also fail the Lunch break rule; one error is enough.
    context.addIssue({
      code: 'custom',
      message: 'Clock-out must be after Clock-in.',
      path: ['clockOut'],
    });
    return;
  }
  if (fields.lunchMinutes !== null && fields.lunchMinutes >= span) {
    context.addIssue({
      code: 'custom',
      message: 'Lunch break must be shorter than the time between Clock-in and Clock-out.',
      path: ['lunchMinutes'],
    });
  }
};

export const createWorkdaySchema = z
  .strictObject({
    date: dateSchema,
    clockIn: timeSchema,
    clockOut: timeSchema.nullable().default(null),
    lunchMinutes: lunchMinutesSchema.nullable().default(null),
    halfDay: z.boolean().default(false),
  })
  .superRefine(workdayRules);

// Cross-field rules are skipped here because a patch alone cannot know the stored values.
export const patchWorkdaySchema = z.strictObject({
  clockIn: timeSchema.optional(),
  clockOut: timeSchema.nullable().optional(),
  lunchMinutes: lunchMinutesSchema.nullable().optional(),
  halfDay: z.boolean().optional(),
});

export const workdayFieldsSchema = z
  .strictObject({
    clockIn: timeSchema,
    clockOut: timeSchema.nullable(),
    lunchMinutes: lunchMinutesSchema.nullable(),
    halfDay: z.boolean(),
  })
  .superRefine(workdayRules);

export type CreateWorkdayRequest = z.input<typeof createWorkdaySchema>;
export type PatchWorkdayRequest = z.infer<typeof patchWorkdaySchema>;

export interface Workday {
  date: string; // YYYY-MM-DD
  clockIn: string; // HH:MM
  clockOut: string | null; // HH:MM
  lunchMinutes: number | null;
  halfDay: boolean;
}

export type ErrorCode =
  'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'UNSUPPORTED_MEDIA_TYPE' | 'INTERNAL_ERROR' | 'DATABASE_UNAVAILABLE';

export interface ErrorEnvelope {
  error: { code: ErrorCode; message: string; field?: string };
}
