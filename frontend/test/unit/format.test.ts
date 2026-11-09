import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentTime, formatBalance, formatDate, formatDuration, today } from '../../src/format';

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
