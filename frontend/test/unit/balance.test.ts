import type { Workday } from '@work-tracker/contracts';
import { describe, expect, it } from 'vitest';
import {
  defaultLunchMinutes,
  expectedMinutes,
  isComplete,
  runningMinutes,
  summarize,
  weekStart,
  workedMinutes,
} from '../../src/balance';

const day = (
  date: string,
  clockIn: string,
  clockOut: string | null,
  lunchMinutes: number | null,
  halfDay = false,
): Workday => ({ date, clockIn, clockOut, lunchMinutes, halfDay });

const TODAY = '2026-11-11';

const nov04 = day('2026-11-04', '08:00', '17:00', null);
const nov05 = day('2026-11-05', '08:00', null, 60);
const nov06 = day('2026-11-06', '08:00', '17:30', 60);
const nov08 = day('2026-11-08', '10:00', '12:00', 0);
const nov09 = day('2026-11-09', '08:00', '17:00', 60);
const nov10 = day('2026-11-10', '08:00', '13:00', 0, true);
const nov11 = day('2026-11-11', '08:00', null, null);
const nov12 = day('2026-11-12', '08:00', '17:00', 60);
const example = [nov04, nov05, nov06, nov08, nov09, nov10, nov11, nov12];

describe('isComplete', () => {
  it.each([
    [nov04, false],
    [nov05, false],
    [nov06, true],
    [nov08, true],
    [nov11, false],
  ])('%j -> %s', (workday, expected) => {
    expect(isComplete(workday)).toBe(expected);
  });
});

describe('expectedMinutes', () => {
  it('is 480 for a full day, including a Sunday', () => {
    expect(expectedMinutes(nov06)).toBe(480);
    expect(expectedMinutes(nov08)).toBe(480);
  });

  it('is 240 on a Half day', () => {
    expect(expectedMinutes(nov10)).toBe(240);
  });
});

describe('workedMinutes', () => {
  it.each([
    [nov04, null],
    [nov05, null],
    [nov06, 510],
    [nov08, 120],
    [nov09, 480],
    [nov10, 300],
    [nov11, null],
  ])('%j -> %s', (workday, expected) => {
    expect(workedMinutes(workday)).toBe(expected);
  });
});

describe('runningMinutes', () => {
  it('counts to now without a Lunch break', () => {
    expect(runningMinutes(day('2026-11-11', '08:00', null, null), '10:30')).toBe(150);
  });

  it('deducts the Lunch break', () => {
    expect(runningMinutes(day('2026-11-11', '08:00', null, 60), '10:30')).toBe(90);
  });

  it('uses the Clock-out instead of now when present', () => {
    expect(runningMinutes(day('2026-11-11', '08:00', '17:00', 60), '18:00')).toBe(480);
  });

  it('never goes below zero', () => {
    expect(runningMinutes(day('2026-11-11', '08:00', null, 60), '08:30')).toBe(0);
  });
});

describe('defaultLunchMinutes', () => {
  it('is 60 on a full day and 0 on a Half day', () => {
    expect(defaultLunchMinutes(false)).toBe(60);
    expect(defaultLunchMinutes(true)).toBe(0);
  });
});

describe('weekStart', () => {
  it.each([
    ['2026-11-08', '2026-11-02'],
    ['2026-11-09', '2026-11-09'],
    ['2026-11-11', '2026-11-09'],
    ['2027-01-01', '2026-12-28'],
  ])('%s -> %s', (date, monday) => {
    expect(weekStart(date)).toBe(monday);
  });
});

describe('summarize', () => {
  it('matches the worked example', () => {
    const summary = summarize(example, TODAY);

    expect(summary.weekMinutes).toBe(60);
    expect(summary.overallMinutes).toBe(-270);
    expect(summary.incompleteBeforeToday.map((w) => w.date)).toEqual(['2026-11-04', '2026-11-05']);
    expect(summary.chart).toEqual([
      { date: '2026-11-06', balanceMinutes: 30 },
      { date: '2026-11-08', balanceMinutes: -330 },
      { date: '2026-11-09', balanceMinutes: -330 },
      { date: '2026-11-10', balanceMinutes: -270 },
    ]);
  });

  it('does not depend on input order', () => {
    expect(summarize([...example].reverse(), TODAY)).toEqual(summarize(example, TODAY));
  });

  it('counts today once it is complete', () => {
    const completed = example.map((w) => (w.date === TODAY ? day(TODAY, '08:00', '17:00', 60) : w));
    const summary = summarize(completed, TODAY);

    expect(summary.weekMinutes).toBe(60);
    expect(summary.overallMinutes).toBe(-270);
    expect(summary.chart.at(-1)).toEqual({ date: TODAY, balanceMinutes: -270 });
    expect(summary.chart).toHaveLength(5);
  });

  it('is all zero for no Workdays', () => {
    expect(summarize([], TODAY)).toEqual({
      weekMinutes: 0,
      overallMinutes: 0,
      incompleteBeforeToday: [],
      chart: [],
    });
  });
});
