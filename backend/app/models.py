from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from .database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True, default="")
    created_at = Column(DateTime, default=utcnow, nullable=False)

    stories = relationship(
        "UserStory",
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    jobs = relationship(
        "BackgroundJob",
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class UserStory(Base):
    __tablename__ = "user_stories"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = Column(String(160), nullable=False)
    description = Column(Text, nullable=True, default="")
    status = Column(String(30), nullable=False, default="todo")  # todo | in_progress | done
    priority = Column(String(20), nullable=False, default="medium")  # low | medium | high
    created_at = Column(DateTime, default=utcnow, nullable=False)

    project = relationship("Project", back_populates="stories")
    tasks = relationship(
        "Task",
        back_populates="story",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    story_id = Column(
        Integer, ForeignKey("user_stories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = Column(String(160), nullable=False)
    assignee_name = Column(String(80), nullable=False, default="Unassigned")
    status = Column(String(30), nullable=False, default="todo")  # todo | in_progress | done
    estimate_hours = Column(Integer, nullable=False, default=2)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    story = relationship("UserStory", back_populates="tasks")


class BackgroundJob(Base):
    __tablename__ = "background_jobs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    job_type = Column(String(60), nullable=False, default="project_digest")
    status = Column(
        String(30), nullable=False, default="queued"
    )  # queued | running | retrying | completed | failed
    attempts = Column(Integer, nullable=False, default=0)
    max_retries = Column(Integer, nullable=False, default=3)
    simulate_failure = Column(Boolean, nullable=False, default=False)
    last_error = Column(Text, nullable=True)
    result_summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    project = relationship("Project", back_populates="jobs")