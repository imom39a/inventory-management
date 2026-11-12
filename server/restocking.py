"""
Restocking domain logic: Restock Candidates, budget allocation, and Restock Orders.

See GLOSSARY.md for the vocabulary used here. Functions take inventory lists as input
(already filtered by the caller where relevant) so this module stays independent of the
FastAPI layer.
"""
import math
import threading
from datetime import datetime, timedelta
from typing import Dict, List, Optional

# Items are restocked once they fall below this multiple of their Reorder Point, and are
# refilled back up to it. Using 1.5x (not 1x) lets planners top up items before they run short.
RESTOCK_TARGET_MULTIPLIER = 1.5

LEAD_TIME_DAYS: Dict[str, int] = {
    "San Francisco": 5,
    "London": 10,
    "Tokyo": 14,
}

# Slider granularity; the default budget is half the maximum, snapped down to this step.
BUDGET_STEP = 500

# In-memory store; like the rest of the app's data, Restock Orders vanish on restart.
restock_orders: list = []

# FastAPI runs sync routes in a threadpool, so two concurrent Place Order requests could both
# pass validation before either is stored (double-ordering a SKU, duplicate order numbers).
# Serialize the whole validate-then-append step.
_orders_lock = threading.Lock()


class RestockValidationError(ValueError):
    """Raised when a requested Restock Order breaks a business rule."""


def now() -> datetime:
    """Single clock for all restocking timestamps so tests can freeze time."""
    return datetime.now()


def _skus_on_open_orders() -> set:
    # Every Restock Order stays "Submitted" (nothing is ever received), so any SKU on any
    # stored order is still on its way and must not be recommended again.
    return {item["sku"] for order in restock_orders for item in order["items"]}


def build_candidates(inventory: List[dict]) -> List[dict]:
    """Restock Candidates from the given inventory, most urgent first."""
    open_skus = _skus_on_open_orders()
    candidates = []
    for item in inventory:
        # Without a positive Reorder Point there is no restock target (and no urgency ratio).
        if item["reorder_point"] <= 0:
            continue
        target = RESTOCK_TARGET_MULTIPLIER * item["reorder_point"]
        # Round up so a fractional shortfall still brings stock to at least the target.
        quantity = math.ceil(target - item["quantity_on_hand"])
        # quantity <= 0 means the item is at or above target: nothing to order.
        if quantity <= 0 or item["sku"] in open_skus:
            continue
        candidates.append({
            "sku": item["sku"],
            "name": item["name"],
            "warehouse": item["warehouse"],
            "category": item["category"],
            "quantity_on_hand": item["quantity_on_hand"],
            "reorder_point": item["reorder_point"],
            "unit_cost": item["unit_cost"],
            "quantity": quantity,
            "line_total": round(quantity * item["unit_cost"], 2),
            # Lower ratio = closer to running out.
            "_urgency_exact": item["quantity_on_hand"] / item["reorder_point"],
        })
    # Sort on the exact ratio (rounding could create false ties); SKU tie-break keeps the
    # order, and therefore the allocation, deterministic.
    candidates.sort(key=lambda c: (c["_urgency_exact"], c["sku"]))
    for c in candidates:
        c["urgency"] = round(c.pop("_urgency_exact"), 4)
    return candidates


def max_budget(candidates: List[dict]) -> float:
    return round(sum(c["line_total"] for c in candidates), 2)


def default_budget(candidates: List[dict]) -> float:
    return math.floor(max_budget(candidates) / 2 / BUDGET_STEP) * BUDGET_STEP


def allocate(candidates: List[dict], budget: float) -> List[dict]:
    """Mark which candidates fit the budget, returning copies with a `recommended` flag.

    Greedy by urgency over whole lines: a line that doesn't fit is skipped rather than
    ending the allocation, so smaller, less urgent lines can still use leftover budget.
    Quantities are never reduced to squeeze a line in.
    """
    remaining = budget
    result = []
    for c in candidates:
        fits = c["line_total"] <= remaining + 1e-9
        if fits:
            remaining -= c["line_total"]
        result.append({**c, "recommended": fits})
    return result


def create_orders(inventory: List[dict], budget: float, skus: List[str]) -> List[dict]:
    """Validate a selection against current candidates and create one Restock Order per warehouse.

    Quantities and prices are recomputed here from inventory; the client only chooses SKUs,
    so a stale or tampered page can't order the wrong amount or exceed the budget.
    """
    if len(set(skus)) != len(skus):
        raise RestockValidationError("Duplicate SKUs in request")

    with _orders_lock:
        return _create_orders_locked(inventory, budget, skus)


def _create_orders_locked(inventory: List[dict], budget: float, skus: List[str]) -> List[dict]:
    by_sku = {c["sku"]: c for c in build_candidates(inventory)}
    invalid = [sku for sku in skus if sku not in by_sku]
    if invalid:
        raise RestockValidationError(
            f"Not current Restock Candidates: {', '.join(invalid)}"
        )

    lines = [by_sku[sku] for sku in skus]
    total = round(sum(line["line_total"] for line in lines), 2)
    if total > budget + 1e-9:
        raise RestockValidationError(f"Total {total:.2f} exceeds budget {budget:.2f}")

    # A Restock Order belongs to exactly one warehouse, since each warehouse has its own
    # Lead Time; group lines by warehouse, keeping the first-seen warehouse order.
    grouped: Dict[str, List[dict]] = {}
    for line in lines:
        grouped.setdefault(line["warehouse"], []).append(line)

    placed_at = now().replace(microsecond=0)
    created = []
    for warehouse, wh_lines in grouped.items():
        sequence = len(restock_orders) + 1
        lead_days = LEAD_TIME_DAYS[warehouse]
        order = {
            "id": f"restock-{sequence}",
            "order_number": f"RST-{placed_at.year}-{sequence:04d}",
            "warehouse": warehouse,
            "status": "Submitted",
            "placed_at": placed_at.isoformat(),
            "lead_time_days": lead_days,
            "expected_arrival": (placed_at + timedelta(days=lead_days)).isoformat(),
            "items": [
                {
                    "sku": line["sku"],
                    "name": line["name"],
                    "category": line["category"],
                    "quantity": line["quantity"],
                    "unit_cost": line["unit_cost"],
                    "line_total": line["line_total"],
                }
                for line in wh_lines
            ],
            "total_cost": round(sum(line["line_total"] for line in wh_lines), 2),
        }
        restock_orders.append(order)
        created.append(order)
    return created


def list_orders(warehouse: Optional[str] = None, category: Optional[str] = None) -> List[dict]:
    """Restock Orders newest first, filtered by warehouse and/or category."""
    results = list(reversed(restock_orders))
    if warehouse and warehouse != "all":
        results = [o for o in results if o["warehouse"] == warehouse]
    if category and category != "all":
        # An order spans several categories, so it matches if any of its lines does.
        results = [
            o for o in results
            if any(i["category"].lower() == category.lower() for i in o["items"])
        ]
    return results
