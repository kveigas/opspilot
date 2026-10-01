from datetime import UTC, date, datetime

from app.database import Base
from app.models.types import UTCDateTime
from sqlalchemy import Date, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column


class SimulationClock(Base):
    """Explicit operational date for simulated campaigns.

    Fixed demo dates otherwise age against the real clock, so a synthetic campaign
    becomes permanently "overdue". Campaigns without a clock use the real date.
    """

    __tablename__ = "simulation_clocks"

    campaign_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    operational_date: Mapped[date] = mapped_column(Date, nullable=False)
    workdays_advanced: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class IdempotencyRecord(Base):
    """Server-side replay protection for mutating requests carrying an Idempotency-Key."""

    __tablename__ = "idempotency_records"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="PENDING")
    response_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=lambda: datetime.now(UTC))
