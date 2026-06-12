# Conclusion

The project set out to answer how a pre-order system can match the canteen's
batch cooking to actual demand without penalising walk-in customers. Kantina
answers it in practice: a deliberately conservative three-layer JavaFX
application over SQLite, in which the day's orders are visible to the kitchen
90 minutes before lunch, pick-up is a single tap at a separate counter, and
the one absolute invariant — no oversold locked batch — is enforced where it
can be enforced atomically, in the database.

Of the three research questions, the first two were answered by process as
much as by code: what the kitchen needs (a per-dish tally, locked at a known
time) and how pick-up must work (one hand, no keyboard) were both discovered
by demonstrating in the canteen rather than specifying in a meeting room. The
third question — correctness under simultaneous orders — was answered the
hard way: the first implementation contained a textbook check-then-act race,
an interleaving test made it reproducible, and the fix moved the invariant
into a guarded atomic update.

The pilot's numbers support the approach: batch adjustments on 7 of 10 days,
a median pick-up of 19 seconds, and a clean audit log across 1,240 orders.
The measurements have stated weaknesses — above all the missing waste
baseline — but the direction is consistent.

For the group, the durable lesson of the project is the relationship between
testing and architecture. The bug that mattered most could not be found by
testing the layers separately, and the test that found it was only writable
because the architecture allowed the database to be faked at an interface.
The boring architecture was not the safe choice instead of the interesting
one; it was what made the interesting work possible.
