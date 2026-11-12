"""
Tests for reports API endpoints (quarterly performance and monthly trends).
"""
import pytest


def _orders(client, query=""):
    response = client.get(f"/api/orders{query}")
    assert response.status_code == 200
    return response.json()


class TestQuarterlyReports:
    """Test suite for /api/reports/quarterly."""

    def test_get_quarterly_reports(self, client):
        """Test getting unfiltered quarterly reports."""
        response = client.get("/api/reports/quarterly")
        assert response.status_code == 200

        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        for q in data:
            for field in ("quarter", "total_orders", "total_revenue", "avg_order_value", "fulfillment_rate"):
                assert field in q
        assert [q["quarter"] for q in data] == sorted(q["quarter"] for q in data)

    def test_quarterly_totals_match_orders(self, client):
        """Test that quarterly totals cover every order."""
        all_orders = _orders(client)
        data = client.get("/api/reports/quarterly").json()

        assert sum(q["total_orders"] for q in data) == len(all_orders)
        assert abs(sum(q["total_revenue"] for q in data) - sum(o["total_value"] for o in all_orders)) < 0.01

    @pytest.mark.parametrize("query,orders_query", [
        ("?warehouse=Tokyo", "?warehouse=Tokyo"),
        ("?category=sensors", "?category=sensors"),
        ("?status=delivered", "?status=delivered"),
        ("?month=2025-01", "?month=2025-01"),
        ("?month=Q2-2025", "?month=Q2-2025"),
        ("?warehouse=London&category=actuators&status=shipped", "?warehouse=London&category=actuators&status=shipped"),
    ])
    def test_get_quarterly_reports_filtered(self, client, query, orders_query):
        """Test that quarterly reports honour the same filters as /api/orders."""
        filtered_orders = _orders(client, orders_query)
        data = client.get(f"/api/reports/quarterly{query}").json()

        assert sum(q["total_orders"] for q in data) == len(filtered_orders)
        assert abs(sum(q["total_revenue"] for q in data) - sum(o["total_value"] for o in filtered_orders)) < 0.01

    def test_quarterly_month_filter_limits_quarters(self, client):
        """Test that a single-month filter yields only that month's quarter."""
        data = client.get("/api/reports/quarterly?month=2025-05").json()
        assert [q["quarter"] for q in data] == ["Q2-2025"]

    def test_quarterly_fulfillment_rate_range(self, client):
        """Test that fulfillment rates are percentages."""
        for q in client.get("/api/reports/quarterly").json():
            assert 0 <= q["fulfillment_rate"] <= 100


class TestMonthlyTrends:
    """Test suite for /api/reports/monthly-trends."""

    def test_get_monthly_trends(self, client):
        """Test getting unfiltered monthly trends."""
        response = client.get("/api/reports/monthly-trends")
        assert response.status_code == 200

        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        for m in data:
            for field in ("month", "order_count", "revenue", "delivered_count"):
                assert field in m
        assert [m["month"] for m in data] == sorted(m["month"] for m in data)

    @pytest.mark.parametrize("query", [
        "?warehouse=San Francisco",
        "?category=controllers",
        "?status=processing",
        "?month=Q3-2025",
        "?warehouse=Tokyo&status=delivered",
    ])
    def test_get_monthly_trends_filtered(self, client, query):
        """Test that monthly trends honour the same filters as /api/orders."""
        filtered_orders = _orders(client, query)
        data = client.get(f"/api/reports/monthly-trends{query}").json()

        assert sum(m["order_count"] for m in data) == len(filtered_orders)
        assert abs(sum(m["revenue"] for m in data) - sum(o["total_value"] for o in filtered_orders)) < 0.01

    def test_monthly_trends_single_month(self, client):
        """Test that a single-month filter returns only that month."""
        data = client.get("/api/reports/monthly-trends?month=2025-03").json()
        assert [m["month"] for m in data] == ["2025-03"]

    def test_monthly_trends_all_filter_is_unfiltered(self, client):
        """Test that 'all' values behave like no filter."""
        unfiltered = client.get("/api/reports/monthly-trends").json()
        all_values = client.get(
            "/api/reports/monthly-trends?warehouse=all&category=all&status=all&month=all"
        ).json()
        assert all_values == unfiltered
