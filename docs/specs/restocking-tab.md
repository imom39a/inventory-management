# Spec: Restocking Tab

**Status:** Implemented (PR #1)

## Problem Statement

A planner can see which inventory items are running low, but there is no way to decide what to restock for a given amount of money, or to act on that decision. They have to work out by hand which items fit in their budget, and nothing records that a restock was requested or when it will arrive. Once something is ordered, nothing stops it from being ordered again before it arrives.

## Solution

Add a Restocking tab. The planner sets an available budget with a slider. The system lists every Restock Candidate (items below 1.5x their Reorder Point) and ticks the Recommendation: the most urgent candidates that fit the budget. The planner can untick lines, or re-tick lines that still fit, then click Place Order. The system creates one Restock Order per warehouse, each stamped with that warehouse's Lead Time and an expected arrival date. Submitted Restock Orders show up in a new section of the Orders tab. Items that already have an open Restock Order stop being recommended.

## User Stories

1. As a planner, I want a Restocking tab in the main navigation, so that I can get to restock planning in one click.
2. As a planner, I want to see every Restock Candidate with its warehouse, category, on-hand quantity, Reorder Point, unit cost, order quantity and line total, so that I understand what each recommendation costs and why.
3. As a planner, I want candidates to include items below 1.5x their Reorder Point, so that I can restock items before they actually run short.
4. As a planner, I want each candidate's order quantity to bring it up to 1.5x its Reorder Point, so that the restock leaves a buffer.
5. As a planner, I want candidates sorted by urgency (lowest on-hand relative to Reorder Point first), so that the most critical items are at the top.
6. As a planner, I want a budget slider that goes from $0 to the cost of restocking every candidate (rounded up to the next $500), so that the range always fits the current data and the top of the slider selects everything.
7. As a planner, I want the slider to move in $500 steps, so that it is easy to land on a round number.
8. As a planner, I want the slider to start at half of its maximum, so that I can immediately see some items included and others left out.
9. As a planner, I want the budget amount shown in currency format next to the slider, so that I know exactly what I have set.
10. As a planner, I want the most urgent candidates that fit the budget ticked automatically, so that I get a sensible starting order.
11. As a planner, I want a candidate that doesn't fit to be skipped while smaller, less urgent ones are still tried, so that the budget is used as fully as possible.
12. As a planner, I want quantities never cut down to squeeze a line in, so that every line on the order is a complete restock.
13. As a planner, I want to untick a recommended line, so that I can leave out items I don't want to restock right now.
14. As a planner, I want to re-tick an unticked line only if it still fits the remaining budget, so that the order can never go over budget.
15. As a planner, I want a running total and the remaining budget to update as I tick and untick lines, so that I always know where I stand.
16. As a planner, I want the Warehouse and Category filters to narrow the candidates, so that I can plan restocking for one site or product line.
17. As a planner, I want the slider's maximum to update when the filters change, with my budget capped to the new maximum if needed, so that the slider never goes beyond what can be spent.
18. As a planner, I want the Time Period and Order Status filters hidden on Restocking (and Reset to clear only the visible filters there), so that controls that don't apply aren't shown.
19. As a planner, I want Place Order disabled when no lines are ticked, so that I can't submit an empty order.
20. As a planner, I want Place Order to create one Restock Order per warehouse, so that each supplier delivery is tracked separately.
21. As a planner, I want each Restock Order to show its Lead Time (San Francisco 5 days, London 10 days, Tokyo 14 days) and expected arrival date, so that I know when stock will arrive.
22. As a planner, I want a confirmation showing the new Restock Order numbers, with a link to the Orders tab, so that I know the order went through and where to find it.
23. As a planner, I want ordered items to disappear from the recommendations, and the amount I just spent deducted from my budget, after I place the order, so that I don't order twice or overspend.
24. As a planner, I want a clear error if the order is rejected (over budget, or an item no longer needs restocking), so that I can fix it and try again.
25. As a planner, I want on-hand inventory to stay the same after ordering, so that the Inventory tab still reflects what is physically in the warehouse.
26. As a planner, I want a "Submitted Restock Orders" section above All Orders in the Orders tab, so that customer Orders and Restock Orders are clearly kept apart.
27. As a planner, I want that section to show order number, warehouse, placed date, items, total cost, Lead Time and expected arrival, so that I can track incoming stock.
28. As a planner, I want that section to follow the Warehouse and Category filters but ignore month and status, so that a new Restock Order is never hidden by unrelated filters.
29. As a planner, I want the Orders tab's existing count cards and All Orders data unchanged, so that customer order reporting stays accurate. (Two display fixes apply to All Orders too: "1 item" instead of "1 items", and "-" instead of "Invalid Date".)
30. As a planner, I want an empty-state message when there are no Restock Candidates or no Restock Orders, so that a blank screen isn't confusing.
31. As a Japanese-speaking planner, I want every new label translated, so that the tab works in my language.

## Implementation Decisions

- **Recommendations source:** inventory, not the demand forecast. Forecast records have no cost, warehouse or category, and most forecast SKUs don't exist in inventory.
- **Restock Candidate rule:** on-hand below 1.5x the Reorder Point (an item exactly at 1.5x has nothing to order), and no open Restock Order for that SKU.
- **After a successful Place Order:** the placed total is deducted from the budget. Recommendations reload and are re-allocated at the reduced budget, so the next batch isn't pre-ticked with money already spent.
- **Slider maximum:** max_budget rounded up to the next $500 step, so every candidate can be selected at the top of the slider.
- **Money:** displayed with cents. The client compares in integer cents and the server uses a small epsilon, so a line costing exactly the remaining budget still fits.
- **Concurrency:** creating Restock Orders is serialized on the server, so concurrent requests can't double-order a SKU or reuse an order number.
- **Quantity rule:** the ceiling of (1.5x Reorder Point minus on-hand). Line total is quantity times unit cost.
- **Urgency:** on-hand divided by Reorder Point, sorted ascending with SKU as the tie-break.
- **Allocation:** greedy by urgency, whole lines only. A line that doesn't fit is skipped and allocation carries on.
- **New backend module:** owns candidate selection, allocation, order building, the in-memory Restock Order store and the per-warehouse Lead Time table. Routes call into it.
- **API contracts:**
  - `GET /api/restocking/recommendations?budget=&warehouse=&category=` returns `{max_budget, budget, recommended_total, candidates[{sku, name, warehouse, category, quantity_on_hand, reorder_point, unit_cost, quantity, line_total, urgency, recommended}]}`. If budget is omitted, it defaults to half of max_budget rounded down to $500.
  - `POST /api/restock-orders` takes `{budget >= 0, skus: non-empty list}` and returns 201 with a list of Restock Orders, one per warehouse. It returns 400 if a SKU is not a current candidate, if SKUs are duplicated, if the recomputed total exceeds the budget, or if a line's warehouse has no configured Lead Time. Rejections are logged.
  - `GET /api/restock-orders?warehouse=&category=` returns Restock Orders newest first. The category filter matches when any line item has that category.
- **Restock Order shape:** id, order_number (`RST-<year>-<4-digit sequence>`), warehouse, status (always "Submitted"), placed_at (ISO timestamp), lead_time_days, expected_arrival (ISO timestamp), items[{sku, name, category, quantity, unit_cost, line_total}], total_cost.
- **Trust boundary:** the server is authoritative. The client sends only the budget and the SKUs; quantities and prices are recomputed on the server.
- **Clock:** server time goes through a single replaceable clock so tests can freeze it.
- **Storage:** Restock Orders are in memory only and lost on restart. Placing one never changes inventory on-hand.
- **Frontend:** a new Restocking view, a route and nav link, three new API client methods, and a new section in the Orders view. The Restocking view uses the shared filters composable (warehouse and category only).
- **Budget on the client:** the first load uses the server's default budget. The frontend owns the slider step ($500), capping the budget when the maximum changes, and taking the spent amount off after an order. After that deduction the budget can fall between $500 steps: the label shows the exact amount, and the next drag snaps it back to a step.
- **Client-side Recommendation:** the client re-runs the same greedy rule locally while the slider moves, so a drag doesn't trigger a request per tick. The server's `recommended` flags and the e2e flow keep the two in agreement.
- **Localization:** all strings are localized in English and Japanese.

## Testing Decisions

- **What a good test does:** it exercises behavior through a public seam and asserts on observable output (HTTP responses, rendered DOM, what the user sees), never on internal helpers.
- **Seam 1: HTTP API.** pytest with FastAPI TestClient (prior art: existing backend tests and their shared client fixture). Covers:
  - candidate rule and threshold edge
  - quantities and urgency order
  - greedy skip-misfit allocation
  - zero and maximum budgets
  - filters, including lowercase category
  - order creation and the split by warehouse
  - Lead Times and arrival dates under a frozen clock
  - order number sequence
  - every 400 case
  - exclusion after ordering, and inventory left unchanged
  - list filtering
  - regression guards proving customer Orders, inventory and dashboard summary responses are identical before and after a Restock Order.
- **Seam 2: Vue views.** Vitest with @vue/test-utils in jsdom, with the API client module mocked. Covers:
  - Restocking: slider default, step and capping; recommended ticks; the untick/re-tick guard; total and remaining budget; submit payload; confirmation; reload; error display; empty state.
  - Orders: the Submitted Restock Orders section rendering and its empty state.
- **Seam 3: browser.** @playwright/test against the running app. Covers the full flow: set the budget, untick a line, place the order, see the confirmation, open Orders, see the Restock Order with Lead Time and expected arrival, and apply a warehouse filter.
- **Test isolation:** a pytest fixture resets the in-memory Restock Order store between tests.
- **Approach:** test-first (red, green, refactor) for every ticket.

## Out of Scope

- Persisting Restock Orders across restarts.
- Restock Order status changes (in transit, arrived), cancellation or editing.
- Receiving stock into inventory.
- Editing line quantities.
- Supplier selection.
- Using demand forecast data in recommendations.
- The existing unused purchase-order model, the dead client calls and the missing purchase-order modal.

## Further Notes

- With today's data there are 8 candidates across all three warehouses, and restocking all of them costs about $58.6K.
- Glossary terms used here (see `GLOSSARY.md`): Order, Restock Order, Reorder Point, Restock Candidate, Recommendation, Lead Time.
- Tests live in `tests/backend/test_restocking.py` (pytest), `client/tests/unit/` (Vitest) and `client/tests/e2e/` (Playwright; it starts its own backend, so port 8001 must be free).
