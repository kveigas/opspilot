from datetime import UTC, date, datetime, timedelta

from app.models.ops import SimulationClock
from sqlalchemy.orm import Session


def next_working_day(current: date) -> date:
    candidate = current + timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate += timedelta(days=1)
    return candidate


def get_operational_date(db: Session, campaign_id: str) -> date:
    """Simulated campaigns follow their own clock; real campaigns use today's UTC date."""
    clock = db.get(SimulationClock, campaign_id)
    return clock.operational_date if clock else datetime.now(UTC).date()


def is_simulated(db: Session, campaign_id: str) -> bool:
    return db.get(SimulationClock, campaign_id) is not None


def set_simulation_clock(db: Session, campaign_id: str, operational_date: date) -> SimulationClock:
    clock = db.get(SimulationClock, campaign_id)
    if clock is None:
        clock = SimulationClock(campaign_id=campaign_id, operational_date=operational_date, workdays_advanced=0)
        db.add(clock)
    else:
        clock.operational_date = operational_date
        clock.workdays_advanced = 0
    db.flush()
    return clock


def advance_simulation_clock(db: Session, campaign_id: str) -> SimulationClock:
    clock = db.get(SimulationClock, campaign_id)
    if clock is None:
        raise ValueError(f"Campaign '{campaign_id}' has no simulation clock")
    clock.operational_date = next_working_day(clock.operational_date)
    clock.workdays_advanced += 1
    db.flush()
    return clock
