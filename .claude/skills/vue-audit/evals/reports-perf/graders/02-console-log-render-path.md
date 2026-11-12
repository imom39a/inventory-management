---
type: llm
focus: trace
weight: 1
---

The report flags console.log calls inside formatNumber/formatMonth/getBarHeight, which run on every render, as a cost to remove.
