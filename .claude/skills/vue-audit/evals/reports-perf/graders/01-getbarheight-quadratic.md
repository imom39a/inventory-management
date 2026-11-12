---
type: llm
focus: trace
weight: 1
---

The report identifies that getBarHeight recomputes the max revenue by scanning monthlyData on every call (once per bar per render) and recommends computing the max once (e.g. a computed property).
