# Test protocol

The manual acceptance protocol, run with the canteen manager at the end of
Sprint 4. Automated suites are described in the testing chapter; this
protocol covers what automation cannot judge — readability, handedness, and
whether the numbers make sense to the person responsible for them.

| # | Scenario | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| P-01 | Order before cut-off | Order falafel at 09:50 | Order number shown, tally +1 | Pass |
| P-02 | Order at cut-off | Order at 10:30:00 | Rejected, tomorrow's menu offered | Pass |
| P-03 | Cancel before cut-off | Cancel P-01's order at 10:00 | Portion released, tally −1 | Pass |
| P-04 | Cancel after lock-in | Cancel at 10:45 | Refused with explanation | Pass |
| P-05 | Sell-out message | Order when 0 portions remain | Sold-out message, no order number | Pass |
| P-06 | One-hand pick-up | Confirm pick-up holding a tray | Single tap, no keyboard needed | Pass |
| P-07 | Two-metre readability | Read tally from the prep line | All counts readable | Pass (after font-size fix) |
| P-08 | Waste report sanity | Compare report against the day's count | Numbers match the kitchen's own | Pass |
| P-09 | Oversell audit | Audit-log query after pilot week | Zero orders against locked batches | Pass |

P-07 initially failed: the tally's portion counts were readable but the dish
names were not. The fix (a 40 % larger font and a high-contrast palette) was
demonstrated to the same staff member who reported the failure, which is the
protocol's standard for closing an item.

## Audit-log integrity query

The P-09 check is a single query, run nightly during the pilot:

```sql
SELECT o.id
  FROM customer_order AS o
  JOIN batch AS b ON b.dish_id = o.dish_id
 WHERE b.locked
 GROUP BY b.dish_id
HAVING COUNT(o.id) > MAX(b.portions_planned);
```

An empty result set means no locked batch has more orders than planned
portions. The query returned zero rows on every night of the pilot.
