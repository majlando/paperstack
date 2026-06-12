# Concurrency

The integrity requirement — never oversell a locked batch — is a concurrency
problem wearing a business rule's clothes. This chapter documents the bug the
first implementation had, how it was found, and why the fix is the guarded
`UPDATE` shown in the implementation chapter.

## The race in version one

The first version of `reservePortion`, from Sprint 1, read the remaining
count, checked it in Java, and then wrote the increment:

```java
// Sprint 1 version — do not copy
int reserved = batchRepository.reservedCount(dishId);
int planned  = batchRepository.plannedCount(dishId);
if (reserved < planned) {
    batchRepository.setReservedCount(dishId, reserved + 1);
    return ReservationResult.RESERVED;
}
return ReservationResult.SOLD_OUT;
```

This is a textbook check-then-act race [@goetz2006]. Two students ordering
the last falafel within a few milliseconds both read `reserved = 39`, both
pass the check, and both write `40` — one of the two increments is lost, the
audit log records 41 placed orders against 40 portions, and somebody's
reserved lunch does not exist.

## Reproducing it

The race never appeared in manual testing — two clicks are slow. It was
reproduced with an interleaving test: a `CountDownLatch` lines up 40 threads
against a batch with one portion left, releases them simultaneously, and
counts the successes.

```java
@Test
void fortyThreadsOneLastPortionExactlyOneWins() throws Exception {
    var batch = batchWithRemaining(1);
    var latch = new CountDownLatch(1);
    var results = race(40, latch, () -> service.placeOrder(STUDENT, FALAFEL));

    latch.countDown(); // release all threads at once

    assertEquals(1, count(results, ReservationResult.RESERVED));
    assertEquals(39, count(results, ReservationResult.SOLD_OUT));
}
```

Against the Sprint 1 code this test failed in 17 of 20 runs, typically with
two to four winners. It now passes 1,000 consecutive runs in CI's nightly
job.

## The fix, and the one rejected

The fix moves the check into the same atomic statement as the act: the
guarded `UPDATE` from the implementation chapter. The database serialises
writers on the row, so "check and reserve" cannot interleave. No Java-side
locking is needed for this path at all.

The rejected alternative was a `synchronized` block around the read-check-
write sequence. It passes the interleaving test, but it serialises *all*
reservations through one JVM monitor — including reservations for different
dishes that cannot conflict — and it silently stops working the day a second
application instance opens the same database. Pushing the invariant into the
data where it lives is both faster and safer [@goetz2006].

## Remaining shared state

The kitchen tally is the only other shared mutable state. It is a JavaFX
`ObservableList` updated via `Platform.runLater`, so all mutation happens on
the FX application thread; order events arrive from service threads through a
single queue. The tally can therefore lag the database by a moment but can
never be torn — an acceptable trade for a display whose purpose is trend, not
truth. The audit log, where truth lives, is append-only and transactional.
