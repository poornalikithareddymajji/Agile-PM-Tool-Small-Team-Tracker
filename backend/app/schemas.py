from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field

StatusType = Literal["todo", "in_progress", "done"]
PriorityType = Literal["low", "medium", "high"]


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(default="", max_length=1000)


class ProjectOut(BaseModel):
    id: int
    name: str
    description: str
    created_at: datetime

    class Config:
        from_attributes = True


class StoryCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    description: Optional[str] = Field(default="", max_length=1000)
    status: StatusType = "todo"
    priority: PriorityType = "medium"


class StoryUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=160)
    description: Optional[str] = Field(default=None, max_length=1000)
    status: Optional[StatusType] = None
    priority: Optional[PriorityType] = None


class StoryOut(BaseModel):
    id: int
    project_id: int
    title: str
    description: str
    status: str
    priority: str
    created_at: datetime

    class Config:
        from_attributes = True


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    assignee_name: str = Field(default="Unassigned", min_length=1, max_length=80)
    status: StatusType = "todo"
    estimate_hours: int = Field(default=2, ge=1, le=200)


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=160)
    assignee_name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    status: Optional[StatusType] = None
    estimate_hours: Optional[int] = Field(default=None, ge=1, le=200)


class TaskOut(BaseModel):
    id: int
    story_id: int
    title: str
    assignee_name: str
    status: str
    estimate_hours: int
    created_at: datetime

    class Config:
        from_attributes = True


class DigestJobRequest(BaseModel):
    simulate_failure: bool = False
    max_retries: int = Field(default=3, ge=0, le=5)


class BackgroundJobOut(BaseModel):
    id: int
    project_id: int
    job_type: str
    status: str
    attempts: int
    max_retries: int
    simulate_failure: bool
    last_error: Optional[str]
    result_summary: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class HierarchyTaskNode(BaseModel):
    id: int
    title: str
    assignee_name: str
    status: str
    estimate_hours: int


class HierarchyStoryNode(BaseModel):
    id: int
    title: str
    description: str
    status: str
    priority: str
    tasks: list[HierarchyTaskNode]


class ProjectHierarchyOut(BaseModel):
    id: int
    name: str
    description: str
    stories: list[HierarchyStoryNode]