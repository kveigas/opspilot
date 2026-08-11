import uuid
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

from app.database import Base
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.campaign import Campaign
    from app.models.task import Task
    from app.models.worker import Worker


class AllocationRun(Base):
    __tablename__ = "allocation_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id: Mapped[str] = mapped_column(String(36), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    operational_date: Mapped[date] = mapped_column(Date, nullable=False)
    tasks_considered: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tasks_allocated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tasks_unallocated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    workers_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    capacity_consumed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unallocated_reasons_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=lambda: datetime.now(UTC))

    campaign: Mapped["Campaign"] = relationship("Campaign")
    allocations: Mapped[list["Allocation"]] = relationship("Allocation", back_populates="allocation_run", cascade="all, delete-orphan")


class Allocation(Base):
    __tablename__ = "allocations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    allocation_run_id: Mapped[str] = mapped_column(String(36), ForeignKey("allocation_runs.id", ondelete="CASCADE"), nullable=False)
    campaign_id: Mapped[str] = mapped_column(String(36), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    task_id: Mapped[str] = mapped_column(String(36), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    worker_id: Mapped[str] = mapped_column(String(36), ForeignKey("workers.id", ondelete="CASCADE"), nullable=False)
    operational_date: Mapped[date] = mapped_column(Date, nullable=False)
    allocated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    deallocated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    allocation_run: Mapped["AllocationRun"] = relationship("AllocationRun", back_populates="allocations")
    campaign: Mapped["Campaign"] = relationship("Campaign")
    task: Mapped["Task"] = relationship("Task", foreign_keys=[task_id])
    worker: Mapped["Worker"] = relationship("Worker")
