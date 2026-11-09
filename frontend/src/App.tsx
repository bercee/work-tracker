import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Workday } from '@work-tracker/contracts';
import { ApiError, getWorkdays } from './api';
import { summarize } from './balance';
import { BalanceChart } from './components/BalanceChart';
import { BalanceSummary } from './components/BalanceSummary';
import { TodayCard } from './components/TodayCard';
import { Warnings } from './components/Warnings';
import { WorkdayList } from './components/WorkdayList';
import { currentTime, today as currentDate } from './format';

// Often enough that "today so far" stays within a minute and the page notices midnight promptly.
const CLOCK_REFRESH_MS = 30_000;

interface LoadError {
  message: string;
  databaseUnavailable: boolean;
}

const toLoadError = (cause: unknown): LoadError => ({
  message: cause instanceof Error ? cause.message : 'Unable to load Workdays.',
  databaseUnavailable: cause instanceof ApiError && cause.kind === 'database-unavailable',
});

export function App() {
  const [workdays, setWorkdays] = useState<Workday[]>([]);
  const [loadError, setLoadError] = useState<LoadError>();
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(() => ({ today: currentDate(), now: currentTime() }));

  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getWorkdays()
      .then((loaded) => {
        if (!cancelled) setWorkdays(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoadError(toLoadError(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  // Resolves once the new list is in state, so a component can rely on its props being current afterwards.
  const refresh = useCallback(async () => {
    try {
      setWorkdays(await getWorkdays());
      setLoadError(undefined);
    } catch (cause) {
      setLoadError(toLoadError(cause));
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setClock({ today: currentDate(), now: currentTime() });
    }, CLOCK_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const retry = () => {
    setLoading(true);
    setLoadError(undefined);
    setLoadAttempt((attempt) => attempt + 1);
  };

  const summary = useMemo(() => summarize(workdays, clock.today), [workdays, clock.today]);
  const todaysWorkday = workdays.find((workday) => workday.date === clock.today);

  const header = <h1>Work Tracker</h1>;

  if (loading) {
    return (
      <main>
        {header}
        <p aria-live="polite">Loading Workdays…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main>
        {header}
        <div className={loadError.databaseUnavailable ? 'load-error database-warning' : 'load-error'} role="alert">
          {loadError.databaseUnavailable ? (
            <>
              <strong>Database unavailable</strong>
              <p>The database could not be reached, so Workdays cannot be loaded or saved. Try again shortly.</p>
            </>
          ) : (
            <p>{loadError.message}</p>
          )}
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main>
      {header}
      <Warnings incomplete={summary.incompleteBeforeToday} today={clock.today} onChanged={refresh} />
      <BalanceSummary weekMinutes={summary.weekMinutes} overallMinutes={summary.overallMinutes} />
      <TodayCard workday={todaysWorkday} today={clock.today} now={clock.now} onChanged={refresh} />
      <BalanceChart points={summary.chart} />
      <WorkdayList workdays={workdays} today={clock.today} onChanged={refresh} />
    </main>
  );
}
