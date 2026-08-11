import uuid
from datetime import UTC, datetime

from app.database import Base
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class CalibrationRound(Base):
    __tablename__ = "calibration_rounds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id: Mapped[str] = mapped_column(String(36), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    domain_tag: Mapped[str] = mapped_column(String(50), nullable=False)
    total_test_tasks: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    pass_threshold_pct: Mapped[float] = mapped_column(Float, nullable=False, default=90.0)
    max_allowed_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=lambda: datetime.now(UTC))

    results: Mapped[list["CalibrationResult"]] = relationship(
        "CalibrationResult", back_populates="calibration_round", cascade="all, delete-orphan"
    )


class CalibrationResult(Base):
    __tablename__ = "calibration_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    round_id: Mapped[str] = mapped_column(String(36), ForeignKey("calibration_rounds.id", ondelete="CASCADE"), nullable=False)
    worker_id: Mapped[str] = mapped_column(String(36), ForeignKey("workers.id", ondelete="CASCADE"), nullable=False)
    score_pct: Mapped[float] = mapped_column(Float, nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=lambda: datetime.now(UTC))

    calibration_round: Mapped["CalibrationRound"] = relationship("CalibrationRound", back_populates="results")
