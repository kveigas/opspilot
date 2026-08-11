import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from app.database import Base
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.capacity import WorkerDailyCapacity


class Worker(Base):
    __tablename__ = "workers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="ANNOTATOR")
    timezone: Mapped[str] = mapped_column(String(40), nullable=False, default="UTC")
    default_max_daily_capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    availability: Mapped[str] = mapped_column(String(20), nullable=False, default="AVAILABLE")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=lambda: datetime.now(UTC))

    skills: Mapped[list["WorkerSkill"]] = relationship("WorkerSkill", back_populates="worker", cascade="all, delete-orphan")
    qualifications: Mapped[list["WorkerQualification"]] = relationship(
        "WorkerQualification", back_populates="worker", cascade="all, delete-orphan"
    )
    capacities: Mapped[list["WorkerDailyCapacity"]] = relationship(
        "WorkerDailyCapacity", back_populates="worker", cascade="all, delete-orphan"
    )


class WorkerSkill(Base):
    __tablename__ = "worker_skills"
    __table_args__ = (UniqueConstraint("worker_id", "skill_tag", name="uix_worker_skill"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    worker_id: Mapped[str] = mapped_column(String(36), ForeignKey("workers.id", ondelete="CASCADE"), nullable=False)
    skill_tag: Mapped[str] = mapped_column(String(50), nullable=False)

    worker: Mapped["Worker"] = relationship("Worker", back_populates="skills")


class WorkerQualification(Base):
    __tablename__ = "worker_qualifications"
    __table_args__ = (UniqueConstraint("worker_id", "campaign_id", name="uix_worker_qualification"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    worker_id: Mapped[str] = mapped_column(String(36), ForeignKey("workers.id", ondelete="CASCADE"), nullable=False)
    campaign_id: Mapped[str] = mapped_column(String(36), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="NOT_STARTED")
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    attempts_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    qualified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    worker: Mapped["Worker"] = relationship("Worker", back_populates="qualifications")
