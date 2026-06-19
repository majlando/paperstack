# Implementation

This chapter highlights the two decisions that most affect the operator:
deterministic export names and a single-pass barcode split.

## Deterministic export names

The downstream archive joins on the export folder name, so the name must be a
pure function of the document's identity — never a timestamp or a counter that
shifts on a re-scan. Each document exports to `{profileName}_{externalId}/`,
and within it each page is `p$n$.png` for page index $n$. Re-scanning the same
box produces byte-for-byte the same paths, so a re-run is idempotent.

```java
String folder = profile.name() + "_" + document.externalId();
Path target = exportRoot.resolve(folder);
for (File file : document.files()) {
    Path page = target.resolve("p" + file.page() + ".png");
    Files.copy(file.scan(), page, REPLACE_EXISTING);
}
auditService.record(EXPORT, document.id(), operator);
```

Naming functions like this read best when the intent is in the name, not a
comment — the guidance from *Clean Code* that the team leaned on most
[@martin2008].

## Barcode split

Splitting happens in one pass over the scanned pages. A page with a recognised
barcode opens a new document; pages without one append to the document that is
open:

| Page barcode | Action                          |
| ------------ | ------------------------------- |
| present      | close the open document, open a new one |
| absent       | append the page to the open document |
| unreadable   | append, and flag for operator review |

Keeping the rule in one table — and one method — meant the concurrency fix in
the next chapter touched a single place, not a branch scattered across the UI.
