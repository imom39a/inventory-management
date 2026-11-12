"""
Tests for Restocking API endpoints: recommendations and Restock Orders.

Expected values are pinned to server/data/inventory.json. With today's data there are
8 Restock Candidates (on hand below 1.5x Reorder Point) worth $58,575 in total.
"""
import threading
import time
from datetime import datetime

import pytest

import mock_data
import restocking

# Candidates in urgency order (on_hand / reorder_point ascending), with qty and line total.
EXPECTED_CANDIDATES = [
    ("PSU-508", "Tokyo", 75, 13912.5),
    ("TMP-201", "London", 100, 8950.0),
    ("SRV-301", "Tokyo", 30, 13350.0),
    ("SRV-302", "Tokyo", 17, 12325.0),
    ("HMD-202", "London", 25, 3125.0),
    ("PSU-507", "San Francisco", 25, 3125.0),
    ("PSU-505", "London", 35, 2362.5),
    ("STP-304", "Tokyo", 5, 1425.0),
]
MAX_BUDGET = 58575.0
FROZEN_NOW = datetime(2026, 11, 12, 9, 30, 0)


@pytest.fixture
def frozen_clock(monkeypatch):
    """Freeze the restocking clock so placed/arrival timestamps are deterministic."""
    monkeypatch.setattr(restocking, "now", lambda: FROZEN_NOW)
    return FROZEN_NOW


@pytest.fixture
def extra_inventory_item():
    """Temporarily add an inventory item to the in-memory data, removing it afterwards."""
    added = []

    def _add(**overrides):
        item = {
            "id": "test-extra",
            "sku": "TST-999",
            "name": "Test Item",
            "category": "Sensors",
            "warehouse": "London",
            "quantity_on_hand": 150,
            "reorder_point": 100,
            "unit_cost": 10.0,
            "location": "Test",
            "last_updated": "2025-09-30T10:30:00",
        }
        item.update(overrides)
        mock_data.inventory_items.append(item)
        added.append(item)
        return item

    yield _add
    for item in added:
        mock_data.inventory_items.remove(item)


def get_recs(client, **params):
    response = client.get("/api/restocking/recommendations", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def place(client, budget, skus):
    return client.post("/api/restock-orders", json={"budget": budget, "skus": skus})


class TestRestockingRecommendations:
    """Recommendations: candidate rule, quantities, urgency order, budget allocation, filters."""

    def test_recommendations_structure(self, client):
        data = get_recs(client, budget=1000)
        for key in ("max_budget", "budget", "recommended_total", "candidates"):
            assert key in data
        for c in data["candidates"]:
            for key in ("sku", "name", "warehouse", "category", "quantity_on_hand",
                        "reorder_point", "unit_cost", "quantity", "line_total",
                        "urgency", "recommended"):
                assert key in c
            assert isinstance(c["quantity"], int)
            assert isinstance(c["recommended"], bool)

    def test_candidates_are_items_below_1_5x_reorder_point(self, client):
        data = get_recs(client, budget=0)
        assert [c["sku"] for c in data["candidates"]] == [e[0] for e in EXPECTED_CANDIDATES]
        for c in data["candidates"]:
            assert c["quantity_on_hand"] < 1.5 * c["reorder_point"]

    def test_quantity_refills_to_1_5x_reorder_point(self, client):
        data = get_recs(client, budget=0)
        by_sku = {c["sku"]: c for c in data["candidates"]}
        for sku, warehouse, qty, line_total in EXPECTED_CANDIDATES:
            assert by_sku[sku]["warehouse"] == warehouse
            assert by_sku[sku]["quantity"] == qty
            assert abs(by_sku[sku]["line_total"] - line_total) < 0.01

    def test_quantity_rounds_up_fractional_units(self, client, extra_inventory_item):
        # 1.5 * 33 = 49.5 -> need 49.5 - 40 = 9.5 units, which must round up to 10.
        extra_inventory_item(quantity_on_hand=40, reorder_point=33)
        by_sku = {c["sku"]: c for c in get_recs(client, budget=0)["candidates"]}
        assert by_sku["TST-999"]["quantity"] == 10

    def test_item_exactly_at_1_5x_reorder_point_is_not_a_candidate(self, client, extra_inventory_item):
        extra_inventory_item(quantity_on_hand=150, reorder_point=100)
        skus = [c["sku"] for c in get_recs(client, budget=0)["candidates"]]
        assert "TST-999" not in skus

    def test_candidates_sorted_by_urgency(self, client):
        urgencies = [c["urgency"] for c in get_recs(client, budget=0)["candidates"]]
        assert urgencies == sorted(urgencies)

    def test_urgency_ties_broken_by_sku(self, client):
        # HMD-202 and PSU-507 both have urgency 95/80.
        skus = [c["sku"] for c in get_recs(client, budget=0)["candidates"]]
        assert skus.index("HMD-202") < skus.index("PSU-507")

    def test_max_budget_is_cost_of_all_candidates(self, client):
        assert abs(get_recs(client, budget=0)["max_budget"] - MAX_BUDGET) < 0.01

    def test_zero_budget_recommends_nothing(self, client):
        data = get_recs(client, budget=0)
        assert not any(c["recommended"] for c in data["candidates"])
        assert data["recommended_total"] == 0

    def test_budget_at_max_recommends_everything(self, client):
        data = get_recs(client, budget=MAX_BUDGET)
        assert all(c["recommended"] for c in data["candidates"])
        assert abs(data["recommended_total"] - MAX_BUDGET) < 0.01

    def test_greedy_allocation_skips_lines_that_do_not_fit(self, client):
        # 30,000: PSU-508 + TMP-201 fit, both SRV lines are too big and get skipped,
        # then the smaller HMD-202 and PSU-507 still fit (887.50 left, too little for the rest).
        data = get_recs(client, budget=30000)
        recommended = [c["sku"] for c in data["candidates"] if c["recommended"]]
        assert recommended == ["PSU-508", "TMP-201", "HMD-202", "PSU-507"]
        assert abs(data["recommended_total"] - 29112.5) < 0.01

    def test_recommended_total_never_exceeds_budget(self, client):
        for budget in (0, 500, 1500, 10000, 25000, 40000, 58000):
            data = get_recs(client, budget=budget)
            assert data["recommended_total"] <= budget + 0.001

    def test_default_budget_is_half_of_max_rounded_down_to_500(self, client):
        data = get_recs(client)
        assert data["budget"] == 29000

    def test_filter_by_warehouse(self, client):
        data = get_recs(client, budget=0, warehouse="Tokyo")
        assert [c["sku"] for c in data["candidates"]] == ["PSU-508", "SRV-301", "SRV-302", "STP-304"]
        assert abs(data["max_budget"] - (13912.5 + 13350 + 12325 + 1425)) < 0.01

    def test_filter_by_category_case_insensitive(self, client):
        data = get_recs(client, budget=0, category="power supplies")
        assert [c["sku"] for c in data["candidates"]] == ["PSU-508", "PSU-507", "PSU-505"]

    def test_filter_combined(self, client):
        data = get_recs(client, budget=0, warehouse="London", category="Sensors")
        assert [c["sku"] for c in data["candidates"]] == ["TMP-201", "HMD-202"]

    def test_filter_all_is_ignored(self, client):
        data = get_recs(client, budget=0, warehouse="all", category="all")
        assert len(data["candidates"]) == len(EXPECTED_CANDIDATES)

    def test_no_candidates_for_filter_returns_empty(self, client):
        data = get_recs(client, budget=1000, category="Circuit Boards")
        assert data["candidates"] == []
        assert data["max_budget"] == 0
        assert data["recommended_total"] == 0

    def test_negative_budget_rejected(self, client):
        response = client.get("/api/restocking/recommendations", params={"budget": -1})
        assert response.status_code == 422

    def test_infinite_budget_rejected(self, client):
        response = client.get("/api/restocking/recommendations", params={"budget": "inf"})
        assert response.status_code == 422

    def test_budget_exactly_equal_to_line_fits(self, client):
        data = get_recs(client, budget=13912.5)
        assert data["candidates"][0]["sku"] == "PSU-508"
        assert data["candidates"][0]["recommended"] is True

    def test_default_budget_respects_filters(self, client):
        # Tokyo max = 41,012.50 -> half = 20,506.25 -> snapped down to 20,500.
        assert get_recs(client, warehouse="Tokyo")["budget"] == 20500

    def test_zero_reorder_point_item_is_not_a_candidate(self, client, extra_inventory_item):
        extra_inventory_item(quantity_on_hand=0, reorder_point=0)
        skus = [c["sku"] for c in get_recs(client, budget=0)["candidates"]]
        assert "TST-999" not in skus


class TestRestockOrderCreation:
    """Placing Restock Orders: server-side validation, warehouse split, lead times."""

    def test_place_order_splits_by_warehouse(self, client, frozen_clock):
        response = place(client, 30000, ["PSU-508", "TMP-201", "HMD-202", "PSU-507"])
        assert response.status_code == 201, response.text
        orders = response.json()
        assert sorted(o["warehouse"] for o in orders) == ["London", "San Francisco", "Tokyo"]
        by_wh = {o["warehouse"]: o for o in orders}
        assert sorted(i["sku"] for i in by_wh["London"]["items"]) == ["HMD-202", "TMP-201"]
        assert [i["sku"] for i in by_wh["Tokyo"]["items"]] == ["PSU-508"]

    def test_order_structure_and_totals(self, client, frozen_clock):
        orders = place(client, 30000, ["TMP-201", "HMD-202"]).json()
        assert len(orders) == 1
        order = orders[0]
        for key in ("id", "order_number", "warehouse", "status", "placed_at",
                    "lead_time_days", "expected_arrival", "items", "total_cost"):
            assert key in order
        assert order["status"] == "Submitted"
        for item in order["items"]:
            for key in ("sku", "name", "category", "quantity", "unit_cost", "line_total"):
                assert key in item
        assert abs(order["total_cost"] - (8950.0 + 3125.0)) < 0.01

    @pytest.mark.parametrize("sku,warehouse,lead_days,arrival", [
        ("PSU-507", "San Francisco", 5, "2026-11-17T09:30:00"),
        ("TMP-201", "London", 10, "2026-11-22T09:30:00"),
        ("STP-304", "Tokyo", 14, "2026-11-26T09:30:00"),
    ])
    def test_lead_time_per_warehouse(self, client, frozen_clock, sku, warehouse, lead_days, arrival):
        order = place(client, MAX_BUDGET, [sku]).json()[0]
        assert order["warehouse"] == warehouse
        assert order["lead_time_days"] == lead_days
        assert order["placed_at"] == "2026-11-12T09:30:00"
        assert order["expected_arrival"] == arrival

    def test_order_numbers_are_sequential(self, client, frozen_clock):
        first = place(client, MAX_BUDGET, ["PSU-507"]).json()
        second = place(client, MAX_BUDGET, ["TMP-201", "STP-304"]).json()
        numbers = [o["order_number"] for o in first + second]
        assert numbers == ["RST-2026-0001", "RST-2026-0002", "RST-2026-0003"]
        assert len({o["id"] for o in first + second}) == 3

    def test_server_recomputes_quantities(self, client, frozen_clock):
        # The client only sends SKUs; quantity and price come from inventory.
        order = place(client, MAX_BUDGET, ["PSU-508"]).json()[0]
        item = order["items"][0]
        assert item["quantity"] == 75
        assert item["unit_cost"] == 185.5
        assert abs(item["line_total"] - 13912.5) < 0.01

    def test_over_budget_rejected(self, client):
        response = place(client, 10000, ["PSU-508"])
        assert response.status_code == 400
        assert "budget" in response.json()["detail"].lower()
        assert restocking.restock_orders == []

    def test_non_candidate_sku_rejected(self, client):
        # PCB-001 has 450 on hand vs reorder point 200: not a candidate.
        response = place(client, MAX_BUDGET, ["PCB-001"])
        assert response.status_code == 400
        assert "PCB-001" in response.json()["detail"]

    def test_unknown_sku_rejected(self, client):
        response = place(client, MAX_BUDGET, ["NOPE-000"])
        assert response.status_code == 400

    def test_duplicate_skus_rejected(self, client):
        response = place(client, MAX_BUDGET, ["PSU-508", "PSU-508"])
        assert response.status_code == 400

    def test_empty_skus_rejected(self, client):
        response = place(client, MAX_BUDGET, [])
        assert response.status_code == 422

    def test_negative_budget_rejected(self, client):
        response = place(client, -5, ["PSU-508"])
        assert response.status_code == 422

    def test_budget_exactly_equal_to_total_accepted(self, client):
        response = place(client, 8950.0 + 3125.0, ["TMP-201", "HMD-202"])
        assert response.status_code == 201

    def test_concurrent_orders_for_same_sku_create_only_one(self, client, monkeypatch):
        # Widen the race window: slow down candidate building so both requests validate
        # before either appends, unless creation is serialized.
        original = restocking.build_candidates

        def slow_build(inventory):
            result = original(inventory)
            time.sleep(0.05)
            return result

        monkeypatch.setattr(restocking, "build_candidates", slow_build)
        barrier = threading.Barrier(2)
        statuses = []

        def worker():
            barrier.wait()
            statuses.append(place(client, MAX_BUDGET, ["PSU-508"]).status_code)

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert sorted(statuses) == [201, 400]
        assert len(restocking.restock_orders) == 1

    def test_rejected_order_creates_nothing(self, client):
        place(client, MAX_BUDGET, ["PSU-508", "PCB-001"])
        assert restocking.restock_orders == []

    def test_ordered_items_are_no_longer_candidates(self, client):
        place(client, MAX_BUDGET, ["PSU-508", "TMP-201"])
        skus = [c["sku"] for c in get_recs(client, budget=0)["candidates"]]
        assert "PSU-508" not in skus
        assert "TMP-201" not in skus
        assert len(skus) == len(EXPECTED_CANDIDATES) - 2

    def test_reordering_an_open_item_rejected(self, client):
        place(client, MAX_BUDGET, ["PSU-508"])
        response = place(client, MAX_BUDGET, ["PSU-508"])
        assert response.status_code == 400

    def test_inventory_on_hand_unchanged(self, client):
        before = client.get("/api/inventory").json()
        place(client, MAX_BUDGET, [e[0] for e in EXPECTED_CANDIDATES])
        assert client.get("/api/inventory").json() == before


class TestRestockOrderListing:
    """Listing Restock Orders for the Orders tab."""

    def test_list_empty_initially(self, client):
        response = client.get("/api/restock-orders")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_newest_first(self, client, frozen_clock):
        place(client, MAX_BUDGET, ["PSU-507"])
        place(client, MAX_BUDGET, ["TMP-201"])
        numbers = [o["order_number"] for o in client.get("/api/restock-orders").json()]
        assert numbers == ["RST-2026-0002", "RST-2026-0001"]

    def test_list_filter_by_warehouse(self, client):
        place(client, MAX_BUDGET, ["PSU-507", "TMP-201", "STP-304"])
        data = client.get("/api/restock-orders", params={"warehouse": "London"}).json()
        assert [o["warehouse"] for o in data] == ["London"]

    def test_list_filter_by_category_matches_any_line(self, client):
        # The London order holds a Sensors line and a Power Supplies line.
        place(client, MAX_BUDGET, ["TMP-201", "PSU-505", "STP-304"])
        data = client.get("/api/restock-orders", params={"category": "power supplies"}).json()
        assert [o["warehouse"] for o in data] == ["London"]

    def test_list_filter_all_is_ignored(self, client):
        place(client, MAX_BUDGET, ["PSU-507", "TMP-201"])
        data = client.get("/api/restock-orders", params={"warehouse": "all", "category": "all"}).json()
        assert len(data) == 2


class TestRestockingRegression:
    """Placing Restock Orders must not change customer Order, inventory or dashboard data."""

    ENDPOINTS = [
        "/api/orders",
        "/api/orders?warehouse=Tokyo&status=Delivered",
        "/api/inventory",
        "/api/inventory?category=Sensors",
        "/api/dashboard/summary",
        "/api/dashboard/summary?warehouse=London",
        "/api/demand",
        "/api/backlog",
    ]

    def test_existing_endpoints_unchanged_after_restock_order(self, client):
        before = {url: client.get(url).json() for url in self.ENDPOINTS}
        assert place(client, MAX_BUDGET, [e[0] for e in EXPECTED_CANDIDATES]).status_code == 201
        after = {url: client.get(url).json() for url in self.ENDPOINTS}
        assert after == before
