import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_api_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "1/16" in data["units"]


def test_api_grades():
    res = client.get("/api/grades")
    assert res.status_code == 200
    grades = res.json()
    assert len(grades) >= 5
    codes = [g["code"] for g in grades]
    assert "HR-40" in codes
    assert "VE-50" in codes


def test_api_machines():
    res = client.get("/api/machines")
    assert res.status_code == 200
    machines = res.json()
    assert len(machines) >= 3
    types = [m["cut_type"] for m in machines]
    assert "guillotine" in types
    assert "free" in types


def test_api_inventory():
    res_buns = client.get("/api/inventory/buns?grade=HR-40")
    assert res_buns.status_code == 200
    buns = res_buns.json()
    assert len(buns) >= 1
    assert buns[0]["grade"] == "HR-40"

    res_aging = client.get("/api/inventory/remnants/aging")
    assert res_aging.status_code == 200
    aging = res_aging.json()
    assert len(aging) >= 1
    # Check that age calculation and degradation fields are present
    assert "is_degraded" in aging[0]
    assert "effective_dims" in aging[0]


def test_api_optimize_endpoint():
    payload = {
        "job_id": "API-TEST-1",
        "order_id": "SO-TEST",
        "customer": "Test Bedding Corp",
        "grade": "HR-40",
        "machine_id": "saw-g1",
        "parts": [
            {
                "id": "p-1",
                "sku": "Seat-Pad",
                "name": "Foam Seat Pad",
                "grade": "HR-40",
                "length": 24.0,
                "width": 24.0,
                "height": 6.0,
                "quantity": 2,
                "orientation_mode": "rise-locked"
            }
        ]
    }
    res = client.post("/api/optimize", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["solution_type"] == "heuristic solution"
    assert data["total_parts_placed"] == 2
    assert len(data["blocks"]) >= 1


def test_api_optimize_rejects_incompatible_machine():
    payload = {
        "job_id": "API-TEST-INCOMPATIBLE",
        "grade": "HR-40",
        "machine_id": "saw-wj",  # waterjet requires free
        "algorithm_id": "best_fit_decreasing",  # guillotine
        "parts": [
            {
                "id": "p-1",
                "sku": "Seat",
                "name": "Seat",
                "grade": "HR-40",
                "length": 20.0,
                "width": 20.0,
                "height": 5.0,
                "quantity": 1
            }
        ]
    }
    res = client.post("/api/optimize", json=payload)
    assert res.status_code == 400
    assert "not compatible" in res.json()["detail"].lower()


def test_api_optimize_waterjet_clearance_limit_exceeded():
    payload = {
        "job_id": "API-TEST-CLEARANCE",
        "grade": "HR-40",  # HR-40 bun usable height is 38" > 36" (saw-wj limit is 36")
        "machine_id": "saw-wj",
        "algorithm_id": "free_nesting_heuristic",
        "parts": [
            {
                "id": "p-1",
                "sku": "Large-Cushion",
                "name": "Large Cushion",
                "grade": "HR-40",
                "length": 60.0,  # Exceeds remnant length (48"), forcing bun allocation
                "width": 30.0,
                "height": 10.0,
                "quantity": 5
            }
        ]
    }
    res = client.post("/api/optimize", json=payload)
    assert res.status_code == 422
    assert "maximum throat cut height" in res.json()["detail"].lower()
