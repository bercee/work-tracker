export const today = (): string => new Date().toLocaleDateString('en-CA');

export const currentTime = (): string =>
  new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

// Parsed as local midnight: a bare ISO date would be read as UTC and could show the previous day.
export const formatDate = (date: string): string =>
  new Date(`${date}T00:00:00`).toLocaleDateString('hu-HU', { dateStyle: 'medium' });

export const formatShortDate = (date: string, today: string): string =>
  new Date(`${date}T00:00:00`).toLocaleDateString('hu-HU', {
    ...(date.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' as const }),
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });

export const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  return `${hours}:${String(minutes % 60).padStart(2, '0')}`;
};

export const formatBalance = (minutes: number): string => {
  if (minutes === 0) {
    return formatDuration(0);
  }
  return `${minutes > 0 ? '+' : '-'}${formatDuration(Math.abs(minutes))}`;
};
