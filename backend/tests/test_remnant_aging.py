import pytest
from datetime import date, timedelta
from app.domain.models import RemnantStock
from app.domain.remnant_aging import compute_effective_remnant_dims


def test_remnant_aging_fresh():
    # Cut 1 day ago -> fresh, no trim loss
    today = date(2026, 10, 23)
    remnant = RemnantStock(
        id="rem-fresh",
        code="REM-FRESH",
        grade="HR-40",
        length=40.0,
        width=30.0,
        height=20.0,
        cut_date=today - timedelta(days=1),
        usability_score=0.9
    )
    status = compute_effective_remnant_dims(remnant, evaluation_date=today, degradation_days_threshold=3)
    assert not status.is_degraded
    assert status.age_days == 1
    assert status.effective_dims == (40.0, 30.0, 20.0)
    assert status.volume_loss_pct == 0.0


def test_remnant_aging_degraded():
    # Cut 4 days ago -> degraded (> 3 days), loses 1" per face = 2" per axis
    today = date(2026, 10, 23)
    remnant = RemnantStock(
        id="rem-aged",
        code="REM-AGED",
        grade="HR-40",
        length=40.0,
        width=30.0,
        height=20.0,
        cut_date=today - timedelta(days=4),
        usability_score=0.9
    )
    status = compute_effective_remnant_dims(remnant, evaluation_date=today, degradation_days_threshold=3)
    assert status.is_degraded
    assert status.age_days == 4
    # Effective dims = 40 - 2, 30 - 2, 20 - 2 = (38.0, 28.0, 18.0)
    assert status.effective_dims == (38.0, 28.0, 18.0)
    assert status.volume_loss_pct > 0.0
    assert status.usability_score < 0.9
