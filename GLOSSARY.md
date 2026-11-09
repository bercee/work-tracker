# Work Tracker

A personal tool for tracking one person's working hours per day and how far they are ahead of or behind the hours they were expected to work.

## Language

**Workday**:
The single entry for a date on which work was done. A date without a Workday is not a working day and has no effect on any Balance, whichever day of the week it is.
_Avoid_: Shift, record, entry, day off

**Clock-in**:
The local time at which work started on a Workday. Every Workday has one.
_Avoid_: Shift start, start time

**Clock-out**:
The local time at which work ended on a Workday.
_Avoid_: Shift end, end time

**Lunch break**:
The length of time deducted from the span between Clock-in and Clock-out. It covers any time away during the day, and "no break" is an explicit length of zero.
_Avoid_: Pause, break time

**Half day**:
A Workday on which only half the normal hours are expected.

**Incomplete Workday**:
A Workday still missing its Clock-out or its Lunch break. It counts towards no Balance until completed.
_Avoid_: Open day, unfinished shift

**Worked hours**:
The time between Clock-in and Clock-out, minus the Lunch break.
_Avoid_: Duration, logged time

**Expected hours**:
The hours a person was supposed to work on a Workday: 8, or 4 on a Half day.
_Avoid_: Target, quota

**Balance**:
Worked hours minus Expected hours, summed over the complete Workdays of a period. Positive means overtime, negative means undertime.
_Avoid_: Delta, overtime total
