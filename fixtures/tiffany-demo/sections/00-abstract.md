# Abstract

Tiffany is a keyboard-driven Java desktop application that replaces a licensed,
third-party scanning tool at WebLager A/S, a Danish digitisation company. It
splits scanned pages into documents on barcode detection, tags them with
operator-supplied metadata, exports them under deterministic names, and audits
every action so the downstream archive pipeline has a stable, traceable input.

This report is a condensed walk-through of the project: how it was run as four
one-week sprints by a solo developer, how the three-layer architecture keeps
the data layer replaceable, how the core was implemented and tested, and what
the result means for the operators who use it. It doubles as a tour of
Paperstack — every figure, citation, cross-reference, and equation here was
written in Markdown and exported to this PDF.
