import uuid
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING, Optional

from app.database import Base
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.allocation import Allocation
    from app.models.campaign import Campaign
    from app.models.worker import Worker


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id: Mapped[str] = mapped_column(String(36), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    external_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    task_type: Mapped[str] = mapped_column(String(40), nullable=False)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="MEDIUM")
    state: Mapped[str] = mapped_column(String(30), nullable=False, default="UNASSIGNED")
    rework_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    assigned_worker_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("workers.id", ondelete="SET NULL"), nullable=True)
    allocation_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("allocations.id", ondelete="SET NULL"), nullable=True)
    operational_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    campaign: Mapped["Campaign"] = relationship("Campaign")
    assigned_worker: Mapped[Optional["Worker"]] = relationship("Worker")
    allocation: Mapped[Optional["Allocation"]] = relationship("Allocation", foreign_keys=[allocation_id])
    skills: Mapped[list["TaskSkill"]] = relationship("TaskSkill", back_populates="task", cascade="all, delete-orphan")


class TaskSkill(Base):
    __tablename__ = "task_skills"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id: Mapped[str] = mapped_column(String(36), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    skill_tag: Mapped[str] = mapped_column(String(50), nullable=False)

    task: Mapped["Task"] = relationship("Task", back_populates="skills")
