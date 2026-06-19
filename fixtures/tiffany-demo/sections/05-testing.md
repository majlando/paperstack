# Testing

Testing focused where a bug would be most expensive: the export naming and the
audit trail, because the downstream pipeline trusts both.

## Unit tests

The business layer was tested against the mock DAO, so every test ran in
memory with no database. Line coverage of the business layer is reported as

$$C = \frac{L_\text{covered}}{L_\text{total}} \times 100\%,$$

which reached $87\%$ by the end of sprint 4 — the gap being defensive branches
for malformed scans that are awkward to provoke in a unit test and are covered
instead by the manual test protocol in the appendix.

## A concurrency test that mattered

The first export implementation read the page count, then wrote — a classic
check-then-act race when two operators exported overlapping boxes. The fix
makes the reservation a single guarded `UPDATE`, the shape *Java Concurrency in
Practice* recommends for exactly this hazard [@goetz2006]. A test spins up two
threads that export the same document and asserts that the audit log records
exactly one export, not two — it failed reliably against the old code and
passes against the fix.
