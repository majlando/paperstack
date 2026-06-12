# Testing

The test strategy follows the course's test pyramid: many fast unit tests on
the domain layer, a smaller ring of repository tests against a real SQLite
file, and a thin top of end-to-end scenarios driven through the service API.
JavaFX controllers are deliberately untested — they delegate immediately to
services, and the group spent its testing budget where the invariants live.

## Unit tests

The domain layer has 118 unit tests. The repositories are replaced by
in-memory fakes implementing the same interfaces — the architecture chapter's
inward-pointing interfaces paying off. The fakes are not mocks: they are
small, real implementations over a `HashMap`, which keeps tests readable and
makes interleaving tests (the concurrency chapter) possible at all.

The cut-off boundary illustrates the style:

```java
@Test
void orderAtOneSecondBeforeCutOffIsAccepted() {
    var clock = FixedClock.at("2026-04-14T10:29:59");
    var service = new OrderService(clock, batches, orders);

    var result = service.placeOrder(STUDENT, FALAFEL);

    assertEquals(ReservationResult.RESERVED, result);
}

@Test
void orderAtCutOffIsRejectedWithTomorrowsMenu() {
    var clock = FixedClock.at("2026-04-14T10:30:00");
    var service = new OrderService(clock, batches, orders);

    var result = service.placeOrder(STUDENT, FALAFEL);

    assertEquals(ReservationResult.AFTER_CUT_OFF, result);
}
```

## Repository tests

Repository tests run against a temporary SQLite file per test class, created
from the production schema script — the same DDL the installer runs, so
schema drift between tests and production is impossible. The suite includes
one test per `CHECK` constraint proving the database actually refuses bad
states, not just that Java avoids them.

## Test results

| Suite | Tests | Failures | Time |
| --- | --- | --- | --- |
| Domain unit tests | 118 | 0 | 1.4 s |
| Repository tests | 36 | 0 | 3.9 s |
| Service end-to-end | 12 | 0 | 2.2 s |
| Interleaving (concurrency) | 9 | 0 | 0.8 s |

Line coverage on the domain layer is 91 %; the uncovered lines are
defensive branches that rethrow checked exceptions. Coverage on controllers
is not measured, per the strategy above.

## What testing found

The suite caught two bugs worth reporting. A cancellation after cut-off
released a portion back into a *locked* batch (the kitchen would have cooked
one too few) — caught by a repository test written from the audit-log
invariant. And the waste report double-counted dishes cancelled and reordered
by the same student — caught while writing the end-to-end scenario for US-09,
before the manager ever saw a wrong number. The third bug, the one testing
did *not* catch on the first attempt, has its own chapter.
