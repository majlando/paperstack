# Discussion

This chapter evaluates the result against the success criteria from the
introduction, reflects on the process, and states the threats to the
validity of the measurements.

## The success criteria revisited

**Demand visibility** was met. With cut-off at 10:30 the kitchen has the
locked tally 90 minutes before peak, and during the two-week pilot the
kitchen adjusted batch sizes on 7 of 10 days — on 3 of those days by more
than ten portions, which is the difference the manager called "a tray of
food."

**Pick-up speed** was met on average and missed at peak, exactly as the
M/M/1 estimate in the implementation chapter predicted. Stopwatch sampling
over five lunches gave a median pick-up of 19 seconds; the worst observed was
71 seconds on the day all three dishes sold out and the fallback counter was
not staffed. The estimate's value was less the number than the conversation
it forced about staffing the second counter.

**Correctness** was met: across 1,240 pilot orders the audit log shows no
oversold batch. The interleaving test suite is the reason the group trusts
this is a property rather than luck.

## Process reflection

Demonstrating in the canteen every sprint was the single best process
decision. The one-handed pick-up requirement, the two-metre readability rule,
and the fallback counter all came out of demos, not interviews — the manager
reacted to what she could touch, not to what we described. The group's main
process failure was Sprint 1's overcommitment; estimating unfamiliar UI work
by analogy to familiar backend work produced numbers that were confidently
wrong. Later sprints estimated UI stories only after a one-hour spike.

## Threats to validity

The pilot ran in May, when sixth-semester students are writing projects and
lunch traffic is below the February peak; the 150-concurrent-sessions target
was validated with synthetic load, not real lunchtime crowds. The waste
numbers compare against the manager's recollection of typical waste, not a
measured baseline — a before-measurement was planned in pre-game and cut for
time, which the group regards as its most consequential scoping mistake.
Finally, all stopwatch sampling was done by group members, who knew the
target; a blinded measurement would carry more weight.

## What we would do differently

With another sprint, the group would add the ready-notification (US-12),
which the pilot survey ranked as the most-wanted missing feature, and would
measure the waste baseline properly. Architecturally the group would keep
everything: the conservative three-layer design never once was the obstacle,
and the boring choice of SQLite gave the project transactions, `CHECK`
constraints, and a zero-step install for free.
