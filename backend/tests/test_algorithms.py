import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.domain.models import OptimizationRequest, PartItem, MachineProfile, MachineCutType, BunStock, SkinTrimConfig, CutType
from app.optimizer.registry import algorithm_registry
from app.optimizer.validator import validate_optimization_result

client = TestClient(app)

SAMPLE_PARTS = [
    {
        "id": "part-1",
        "sku": "Cushion A",
        "name": "Sofa Seat Cushion A",
        "grade": "HR-40",
        "length": 24.0,
        "width": 24.0,
        "height": 6.0,
        "quantity": 12,
        "orientation_mode": "rise-locked",
        "color_hex": "#ef4444"
    },
    {
        "id": "part-2",
        "sku": "Cube C",
        "name": "Modular Corner Cube C",
        "grade": "HR-40",
        "length": 12.0,
        "width": 12.0,
        "height": 12.0,
        "quantity": 16,
        "orientation_mode": "any",
        "color_hex": "#10b981"
    },
    {
        "id": "part-3",
        "sku": "Bolster B",
        "name": "Cylindrical Core Bolster B",
        "grade": "HR-40",
        "length": 36.0,
        "width": 8.0,
        "height": 8.0,
        "quantity": 8,
        "orientation_mode": "free-in-plane",
        "color_hex": "#06b6d4"
    }
]


def test_get_algorithms_endpoint():
    res = client.get("/api/algorithms")
    assert res.status_code == 200
    algos = res.json()
    assert len(algos) >= 4
    ids = [a["id"] for a in algos]
    assert "best_fit_decreasing" in ids
    assert "first_fit_decreasing" in ids
    assert "simulated_annealing" in ids
    assert "free_nesting_heuristic" in ids
    for a in algos:
        assert a["name"] != ""
        assert a["description"] != ""
        assert a["speed_tag"] != ""
        assert len(a["supported_cut_types"]) > 0


@pytest.mark.parametrize("algo_id", ["best_fit_decreasing", "first_fit_decreasing", "simulated_annealing"])
def test_algorithm_validator_and_volume_reconciliation(algo_id):
    payload = {
        "job_id": f"TEST-{algo_id.upper()}",
        "grade": "HR-40",
        "machine_id": "saw-g2",
        "algorithm_id": algo_id,
        "time_budget_seconds": 1.0,
        "seed": 42,
        "parts": SAMPLE_PARTS
    }
    res = client.post("/api/optimize", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["algorithm_id"] == algo_id
    assert data["solution_type"] == "heuristic solution"
    assert data["total_parts_placed"] == 36
    assert data["runtime_ms"] >= 0.0

    # Validation must pass
    val = data["validation"]
    assert val["is_valid"] is True, f"Validation failed for {algo_id}: {val['errors']}"
    assert len(val["errors"]) == 0

    # Volume reconciliation identity
    rec = val["volume_reconciliation"]
    total_usable = rec["total_usable_volume"]
    accounted = (
        rec["total_parts_volume"] +
        rec["total_remnants_volume"] +
        rec["total_kerf_volume"] +
        rec["total_scrap_volume"]
    )
    # Conservation within 2.0 cu in tolerance across all blocks
    assert abs(total_usable - accounted) <= 2.0


def test_waterjet_free_nesting_success_and_volume_reconciliation():
    # Use HR-30 (bun height 38", usable 36" <= 36" throat limit)
    hr30_parts = [
        dict(p, grade="HR-30") for p in SAMPLE_PARTS
    ]
    payload = {
        "job_id": "TEST-WJ-FREE",
        "grade": "HR-30",
        "machine_id": "saw-wj",
        "algorithm_id": "free_nesting_heuristic",
        "parts": hr30_parts
    }
    res = client.post("/api/optimize", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["algorithm_id"] == "free_nesting_heuristic"
    assert data["total_parts_placed"] == 36
    assert data["machine"]["cut_type"] == "free"

    # Validation must pass
    val = data["validation"]
    assert val["is_valid"] is True, f"Waterjet validation failed: {val['errors']}"
    assert len(val["errors"]) == 0

    # Volume reconciliation holds
    rec = val["volume_reconciliation"]
    total_usable = rec["total_usable_volume"]
    accounted = (
        rec["total_parts_volume"] +
        rec["total_remnants_volume"] +
        rec["total_kerf_volume"] +
        rec["total_scrap_volume"]
    )
    assert abs(total_usable - accounted) <= 2.0

    # Verify contour cut steps have target_part_id and correct type
    cuts = data["blocks"][0]["cuts"]
    contour_cuts = [c for c in cuts if c["cut_type"] == "contour_path"]
    assert len(contour_cuts) > 0
    for c in contour_cuts:
        assert c["target_part_id"] is not None


def test_waterjet_throat_height_clearance_limit_error():
    # HR-40 nominal height 40", usable 38" > saw-wj max_cut_height 36"
    payload = {
        "job_id": "TEST-WJ-CLEARANCE-FAIL",
        "grade": "HR-40",
        "machine_id": "saw-wj",
        "algorithm_id": "free_nesting_heuristic",
        "parts": SAMPLE_PARTS
    }
    res = client.post("/api/optimize", json=payload)
    assert res.status_code == 422
    assert "maximum throat cut height" in res.json()["detail"].lower()


def test_simulated_annealing_reproducibility():
    payload1 = {
        "job_id": "SA-REPRO-1",
        "grade": "HR-40",
        "machine_id": "saw-g2",
        "algorithm_id": "simulated_annealing",
        "time_budget_seconds": 0.5,
        "seed": 12345,
        "parts": SAMPLE_PARTS
    }
    payload2 = {
        "job_id": "SA-REPRO-2",
        "grade": "HR-40",
        "machine_id": "saw-g2",
        "algorithm_id": "simulated_annealing",
        "time_budget_seconds": 0.5,
        "seed": 12345,
        "parts": SAMPLE_PARTS
    }

    res1 = client.post("/api/optimize", json=payload1).json()
    res2 = client.post("/api/optimize", json=payload2).json()

    assert res1["net_utilization_pct"] == res2["net_utilization_pct"]
    assert res1["blocks_used_count"] == res2["blocks_used_count"]
    assert res1["total_cuts_count"] == res2["total_cuts_count"]
    assert res1["total_parts_volume"] == res2["total_parts_volume"]


def test_compare_all_algorithms():
    payload = {
        "job_id": "COMPARE-TEST",
        "grade": "HR-40",
        "machine_id": "saw-g2",
        "seed": 42,
        "time_budget_seconds": 0.5,
        "parts": SAMPLE_PARTS
    }
    res = client.post("/api/optimize/compare", json=payload)
    assert res.status_code == 200
    results = res.json()

    assert len(results) >= 3
    algo_ids = [r["algorithm_id"] for r in results]
    assert "best_fit_decreasing" in algo_ids
    assert "first_fit_decreasing" in algo_ids
    assert "simulated_annealing" in algo_ids

    # Exactly one algorithm must be marked is_best
    best_results = [r for r in results if r["is_best"] is True]
    assert len(best_results) == 1

    # Verify best-selection rule: the marked one must have highest net utilization (or tie-break)
    best = best_results[0]
    for r in results:
        assert best["net_utilization_pct"] >= r["net_utilization_pct"] or best["blocks_used_count"] <= r["blocks_used_count"]


def test_infeasible_parts_reported_not_dropped():
    # Part larger than standard bun usable size (usable is ~106 x 80 x 38)
    infeasible_part = {
        "id": "giant-1",
        "sku": "Giant-Cushion",
        "name": "Impossible Giant Foam",
        "grade": "HR-40",
        "length": 150.0,
        "width": 100.0,
        "height": 50.0,
        "quantity": 1,
        "orientation_mode": "any"
    }

    payload = {
        "job_id": "INFEASIBLE-TEST",
        "grade": "HR-40",
        "machine_id": "saw-g2",
        "parts": [infeasible_part]
    }
    res = client.post("/api/optimize", json=payload)
    assert res.status_code == 200
    data = res.json()

    # Part must be explicitly in unplaced_parts
    assert len(data["unplaced_parts"]) == 1
    assert data["unplaced_parts"][0]["sku"] == "Giant-Cushion"
    assert data["total_parts_placed"] == 0

    # Validator must report it as an error
    assert data["validation"]["is_valid"] is False
    assert any("exceeds usable block dimensions" in err for err in data["validation"]["errors"])


def test_randomized_part_sets_validator_passes():
    import random
    rng = random.Random(999)
    random_parts = []
    for i in range(5):
        l = round(rng.uniform(10.0, 30.0) * 16) / 16
        w = round(rng.uniform(8.0, 24.0) * 16) / 16
        h = round(rng.uniform(4.0, 12.0) * 16) / 16
        q = rng.randint(2, 6)
        mode = rng.choice(["rise-locked", "free-in-plane", "any"])
        random_parts.append({
            "id": f"rand-{i}",
            "sku": f"RAND-{i}",
            "name": f"Random Part {i}",
            "grade": "HR-40",
            "length": l,
            "width": w,
            "height": h,
            "quantity": q,
            "orientation_mode": mode
        })

    payload = {
        "job_id": "RANDOM-TEST",
        "grade": "HR-40",
        "machine_id": "saw-g2",
        "algorithm_id": "best_fit_decreasing",
        "parts": random_parts
    }
    res = client.post("/api/optimize", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["validation"]["is_valid"] is True
    assert len(data["validation"]["errors"]) == 0
