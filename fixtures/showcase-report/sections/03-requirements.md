# Requirements

Requirements were gathered from two interviews with the canteen manager, one
lunchtime observation session (45 minutes, counting queue lengths at five-
minute intervals), and an informal survey of 31 students in the atrium.

## Actors

Three actors emerged from the interviews:

- **Student** — orders a dish before cut-off, picks it up at the pre-order
  counter. Wants certainty (the dish is reserved) and speed.
- **Kitchen staff** — watches the tally while prepping, confirms pick-ups
  with one hand. Wants the screen readable from two metres.
- **Canteen manager** — sets the day's menu and the cut-off time, locks
  batches, reads the waste report. Wants numbers she can defend at the
  monthly budget meeting.

## User stories

The full backlog is in Appendix C; the stories that shaped the architecture
are listed here with their MoSCoW priority.

| # | As a… | I want… | So that… | Priority |
| --- | --- | --- | --- | --- |
| US-01 | student | to order today's dish before 10:30 | my lunch is reserved | Must |
| US-02 | student | to cancel my order before cut-off | I am not charged for a dropped plan | Must |
| US-03 | kitchen | a live tally per dish | I can size the batches | Must |
| US-04 | manager | to lock batches at cut-off | late orders cannot exceed what we cook | Must |
| US-07 | kitchen | one-tap pick-up confirmation | I can serve with a tray in one hand | Must |
| US-09 | manager | a daily waste report | I can document the savings | Should |
| US-12 | student | a notification when my order is ready | I do not queue at the counter | Could |
| US-14 | manager | menu templates for recurring weeks | planning Monday takes minutes | Won't (this project) |

## The ordering use case

The central use case, *Place order*, runs as follows: the student
authenticates through the academy's single sign-on, sees today's three dishes
with a remaining-portions count, selects one, and receives an order number.
The flow has two interesting failure branches: the dish sells out between
display and confirmation (handled in the concurrency chapter), and the
cut-off passes while the order form is open (the order is rejected with the
next day's menu offered instead).

## Non-functional requirements

| Requirement | Target | Rationale |
| --- | --- | --- |
| Tally latency | Under 5 s from order to kitchen screen | Batch decisions are made continuously |
| Pick-up interaction | Single tap, no keyboard | Staff have one hand free |
| Availability | Lunch hours, 10:00–13:00 | Outside lunch, e-mail suffices |
| Order integrity | No oversold locked batch, ever | Trust in the system dies the first time a reserved dish is gone |
| Concurrent users | 150 simultaneous ordering sessions | Peak measured in the survey week |

The integrity requirement is deliberately absolute. The survey showed why:
26 of 31 students said they would stop using a pre-order system after a
single broken reservation. Correctness under concurrency is therefore treated
as an architectural requirement, not a test case.
