import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Optional

from app.database import Base
from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.campaign import Campaign
    from app.models.task import Task
    from app.models.worker import Worker


class Escalation(Base):
    __tablename__ = "escalations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id: Mapped[str] = mapped_column(String(36), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    task_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    owner_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("workers.id", ondelete="SET NULL"), nullable=True)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="MEDIUM")  # LOW, MEDIUM, HIGH, CRITICAL
    category: Mapped[str] = mapped_column(String(40), nullable=False, default="QUALITY")  # GUIDELINE, QUALITY, CAPACITY, TOOLING, CLIENT_CLARIFICATION, DATA_ISSUE, SLA
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN")  # OPEN, INVESTIGATING, WAITING, RESOLVED, CLOSED
    blocker: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    resolution: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    campaign: Mapped["Campaign"] = relationship("Campaign")
    task: Mapped[Optional["Task"]] = relationship("Task")
    owner: Mapped[Optional["Worker"]] = relationship("Worker")
