# Implementation

The system is implemented in Java 21 with JavaFX for the three user
interfaces and SQLite as the embedded database. This chapter walks through
the implementation decisions that the exam questions are most likely to
probe: the reservation core, the schema, and the cut-off rule.

## Reserving a portion

The heart of the system is one method. `reservePortion` must decrement the
remaining portion count *only if* portions remain and the batch is not
locked, and it must report which of the three outcomes occurred:

```java
public ReservationResult reservePortion(int dishId) {
    final String sql = """
        UPDATE batch
           SET portions_reserved = portions_reserved + 1
         WHERE dish_id = ?
           AND locked = FALSE
           AND portions_reserved < portions_planned
        """;
    try (var connection = connections.open();
         var statement = connection.prepareStatement(sql)) {
        statement.setInt(1, dishId);
        int updated = statement.executeUpdate();
        return updated == 1
            ? ReservationResult.RESERVED
            : describeFailure(connection, dishId);
    } catch (SQLException e) {
        throw new DataAccessException("reservePortion", e);
    }
}
```

The guard lives in the `WHERE` clause, so checking and reserving are one
atomic statement — the database either finds a reservable batch and updates
it, or matches zero rows. `describeFailure` runs a follow-up `SELECT` purely
to produce a precise message (sold out versus locked); by then the outcome is
already decided and the answer is only cosmetic.

## Schema

The schema is five tables; the two that matter for integrity are shown here.

```sql
CREATE TABLE batch (
    dish_id            INTEGER PRIMARY KEY REFERENCES dish(id),
    portions_planned   INTEGER NOT NULL CHECK (portions_planned >= 0),
    portions_reserved  INTEGER NOT NULL DEFAULT 0
        CHECK (portions_reserved <= portions_planned),
    locked             BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE order_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER NOT NULL REFERENCES customer_order(id),
    transition  TEXT    NOT NULL,
    at          TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

The `CHECK` constraint duplicates the `WHERE` guard on purpose. If a future
refactoring ever reintroduces a read-then-write path, the database refuses
the oversell instead of recording it — defence in depth for the one invariant
the project promised never to break.

## Cut-off enforcement

Cut-off is wall-clock policy, so it is enforced in the domain layer, not the
database. `OrderService` rejects orders when `now() >= menuDay.cutOff()`,
and the clock is injected (`java.time.Clock`) rather than called statically —
the testing chapter relies on this to replay the 10:29:59 boundary cases.

## Sizing the pre-order counter

One design question was answered with arithmetic rather than code: can a
single pick-up counter keep its under-30-second promise? Treating the counter
as an M/M/1 queue with arrival rate $\lambda$ and service rate $\mu$, the
expected time in the system is

$$
W = \frac{1}{\mu - \lambda}
$$

The observation week measured a lunch peak of about 120 pre-orders spread
over 40 minutes ($\lambda = 3$ per minute) and a one-tap confirmation taking
12 seconds end to end ($\mu = 5$ per minute), giving $W = 0.5$ minutes — 30
seconds, exactly at the limit. The number told the manager what to expect:
one counter is enough on an average day and not on a busy one, so the second
till's terminal was configured as a fallback pick-up point during Sprint 4.

## Code conventions

Methods follow the small-function discipline from Clean Code [@martin2008]:
the longest method in the domain layer is 24 lines, and every public domain
method names its outcome type (`ReservationResult`, `CutOffDecision`) rather
than returning a bare boolean. Checkstyle runs in CI; the build fails on
warnings, which kept the rule honest through all four sprints.
