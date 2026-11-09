# Only Workdays are stored

A date with no Workday is simply not a working day: it has no Expected hours, no effect on any Balance and raises no warning. We considered storing days off (vacation, holidays, compensation days) so that a missing weekday could be flagged as forgotten, but rejected it as more bookkeeping than a one-person tracker deserves.

## Consequences

A Workday forgotten entirely goes unnoticed, and history recorded this way cannot later be split into days off and forgotten days. Spending accumulated overtime on a day off cannot be represented, so the Balance stays unchanged on such a day. Every Workday expects the same hours regardless of the day of the week; there is no calendar logic.
