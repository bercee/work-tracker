import { minutesOfDay, type Workday } from '@work-tracker/contracts';

export interface ChartPoint {
  date: string;
  balanceMinutes: number;
}

export interface BalanceSummary {
  weekMinutes: number;
  overallMinutes: number;
  incompleteBeforeToday: Workday[];
  chart: ChartPoint[];
}

const FULL_DAY_MINUTES = 480;
const HALF_DAY_MINUTES = 240;
const DEFAULT_LUNCH_MINUTES = 60;

export function isComplete(workday: Workday): boolean {
  return workday.clockOut !== null && workday.lunchMinutes !== null;
}

export function expectedMinutes(workday: Workday): number {
  return workday.halfDay ? HALF_DAY_MINUTES : FULL_DAY_MINUTES;
}

export function workedMinutes(workday: Workday): number | null {
  if (workday.clockOut === null || workday.lunchMinutes === null) {
    return null;
  }
  return minutesOfDay(workday.clockOut) - minutesOfDay(workday.clockIn) - workday.lunchMinutes;
}

// Floored at 0 so a Lunch break entered early never shows negative time worked.
export function runningMinutes(workday: Workday, now: string): number {
  const end = minutesOfDay(workday.clockOut ?? now);
  return Math.max(0, end - minutesOfDay(workday.clockIn) - (workday.lunchMinutes ?? 0));
}

export function defaultLunchMinutes(halfDay: boolean): number {
  return halfDay ? 0 : DEFAULT_LUNCH_MINUTES;
}

export function weekStart(date: string): string {
  // Local midnight, so the weekday matches the calendar date without timezone shifts.
  const parsed = new Date(`${date}T00:00:00`);
  const sinceMonday = (parsed.getDay() + 6) % 7;
  parsed.setDate(parsed.getDate() - sinceMonday);
  return parsed.toLocaleDateString('en-CA');
}

// ISO dates sort lexicographically, so string comparison orders them by date.
export function summarize(workdays: readonly Workday[], today: string): BalanceSummary {
  const monday = weekStart(today);
  const upToToday = workdays
    .filter((workday) => workday.date <= today)
    .toSorted((a, b) => a.date.localeCompare(b.date));

  let weekMinutes = 0;
  let overallMinutes = 0;
  const incompleteBeforeToday: Workday[] = [];
  const chart: ChartPoint[] = [];

  for (const workday of upToToday) {
    const worked = workedMinutes(workday);
    if (worked === null) {
      if (workday.date < today) {
        incompleteBeforeToday.push(workday);
      }
      continue;
    }
    const balance = worked - expectedMinutes(workday);
    overallMinutes += balance;
    if (workday.date >= monday) {
      weekMinutes += balance;
    }
    chart.push({ date: workday.date, balanceMinutes: overallMinutes });
  }

  return { weekMinutes, overallMinutes, incompleteBeforeToday, chart };
}
