# Appendix A — Running Tiffany locally

Tiffany targets Java 21 and JavaFX. The data layer defaults to the in-memory
mock store, so it runs with no database for evaluation.

```sh
# Build and run with the mock data layer
./gradlew run

# Run against MSSQL instead (connection string in application.properties)
./gradlew run --args="--data=mssql"
```

The mock store seeds one profile with two boxes so the scan, split, and export
flows can be exercised immediately. The audit log is written to
`./audit.log`; the manual test protocol in the test chapter walks through the
re-scan idempotency check against it.
