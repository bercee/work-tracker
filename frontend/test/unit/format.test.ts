import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentTime, formatBalance, formatDate, formatDuration, formatShortDate, today } from '../../src/format';

describe('clock', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('today is the local date', () => {
    vi.setSystemTime(new Date('2026-11-11T10:30:00'));
    expect(today()).toBe('2026-11-11');
  });

  it('currentTime is zero-padded local HH:MM', () => {
    vi.setSystemTime(new Date('2026-11-11T07:05:59'));
    expect(currentTime()).toBe('07:05');
  });

  it('currentTime uses 24-hour time at midnight and the afternoon', () => {
    vi.setSystemTime(new Date('2026-11-11T00:00:00'));
    expect(currentTime()).toBe('00:00');
    vi.setSystemTime(new Date('2026-11-11T17:45:00'));
    expect(currentTime()).toBe('17:45');
  });
});

describe('formatDate', () => {
  it('formats in Hungarian medium style, from local midnight', () => {
    expect(formatDate('2026-11-11')).toBe('2026. nov. 11.');
  });
});

describe('formatShortDate', () => {
  it('omits the year within the current year and shows the weekday', () => {
    expect(formatShortDate('2026-11-19', '2026-11-19')).toBe('11. 19., Cs');
  });

  it('includes the year when it differs from the current year', () => {
    expect(formatShortDate('2025-12-30', '2026-01-02')).toBe('2025. 12. 30., K');
  });

  it('does not slip a day at the start of a month', () => {
    expect(formatShortDate('2026-03-01', '2026-03-15')).toBe('03. 01., V');
  });
});

describe('formatDuration', () => {
  it.each([
    [465, '7:45'],
    [60, '1:00'],
    [0, '0:00'],
    [5, '0:05'],
  ])('%i -> %s', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});

describe('formatBalance', () => {
  it.each([
    [90, '+1:30'],
    [-270, '-4:30'],
    [-45, '-0:45'],
    [0, '0:00'],
  ])('%i -> %s', (minutes, text) => {
    expect(formatBalance(minutes)).toBe(text);
  });
});
