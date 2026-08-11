import uuid
from datetime import UTC, date, datetime

from app.database import Base
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    client_name: Mapped[str] = mapped_column(String(120), nullable=False)
    task_type: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    total_volume: Mapped[int] = mapped_column(Integer, nullable=False)
    target_quality_pct: Mapped[float] = mapped_column(Float, nullable=False, default=95.0)
    review_sampling_pct: Mapped[float] = mapped_column(Float, nullable=False, default=20.0)
    target_daily_throughput: Mapped[int] = mapped_column(Integer, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="MEDIUM")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    calibration_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    required_annotators: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    required_reviewers: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )

    skills: Mapped[list["CampaignSkill"]] = relationship(
        "CampaignSkill", back_populates="campaign", cascade="all, delete-orphan"
    )


class CampaignSkill(Base):
    __tablename__ = "campaign_skills"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id: Mapped[str] = mapped_column(String(36), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    skill_tag: Mapped[str] = mapped_column(String(50), nullable=False)

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="skills")
