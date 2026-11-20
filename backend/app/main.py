from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from . import models, schemas
from .database import Base, engine, get_db
from .worker import job_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    job_worker.start()
    yield
    job_worker.stop()


app = FastAPI(
    title="Agile Project Management API",
    description="Hierarchical Project -> User Story -> Task tracker with async background digest workflow.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


# --- Projects ---
@app.post("/api/projects", response_model=schemas.ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(payload: schemas.ProjectCreate, db: Session = Depends(get_db)):
    project = models.Project(name=payload.name.strip(), description=(payload.description or "").strip())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@app.get("/api/projects", response_model=list[schemas.ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.query(models.Project).order_by(models.Project.id.desc()).all()


@app.get("/api/projects/{project_id}/hierarchy", response_model=schemas.ProjectHierarchyOut)
def get_project_hierarchy(
    project_id: int,
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    stories_out = []
    for story in project.stories:
        if status_filter and story.status != status_filter:
            continue
        tasks_out = [
            schemas.HierarchyTaskNode(
                id=t.id,
                title=t.title,
                assignee_name=t.assignee_name,
                status=t.status,
                estimate_hours=t.estimate_hours,
            )
            for t in story.tasks
        ]
        stories_out.append(
            schemas.HierarchyStoryNode(
                id=story.id,
                title=story.title,
                description=story.description,
                status=story.status,
                priority=story.priority,
                tasks=tasks_out,
            )
        )

    return schemas.ProjectHierarchyOut(
        id=project.id,
        name=project.name,
        description=project.description,
        stories=stories_out,
    )


# --- User Stories ---
@app.post(
    "/api/projects/{project_id}/stories",
    response_model=schemas.StoryOut,
    status_code=status.HTTP_201_CREATED,
)
def create_story(project_id: int, payload: schemas.StoryCreate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    story = models.UserStory(
        project_id=project_id,
        title=payload.title.strip(),
        description=(payload.description or "").strip(),
        status=payload.status,
        priority=payload.priority,
    )
    db.add(story)
    db.commit()
    db.refresh(story)
    return story


@app.patch("/api/stories/{story_id}", response_model=schemas.StoryOut)
def update_story(story_id: int, payload: schemas.StoryUpdate, db: Session = Depends(get_db)):
    story = db.query(models.UserStory).filter(models.UserStory.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="User story not found")

    updates = payload.model_dump(exclude_unset=True)
    if "title" in updates and updates["title"] is not None:
        updates["title"] = updates["title"].strip()
    if "description" in updates and updates["description"] is not None:
        updates["description"] = updates["description"].strip()

    for field, value in updates.items():
        setattr(story, field, value)

    db.commit()
    db.refresh(story)
    return story


# --- Tasks ---
@app.post(
    "/api/stories/{story_id}/tasks",
    response_model=schemas.TaskOut,
    status_code=status.HTTP_201_CREATED,
)
def create_task(story_id: int, payload: schemas.TaskCreate, db: Session = Depends(get_db)):
    story = db.query(models.UserStory).filter(models.UserStory.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="User story not found")

    task = models.Task(
        story_id=story_id,
        title=payload.title.strip(),
        assignee_name=payload.assignee_name.strip(),
        status=payload.status,
        estimate_hours=payload.estimate_hours,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@app.patch("/api/tasks/{task_id}", response_model=schemas.TaskOut)
def update_task(task_id: int, payload: schemas.TaskUpdate, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    updates = payload.model_dump(exclude_unset=True)
    if "title" in updates and updates["title"] is not None:
        updates["title"] = updates["title"].strip()
    if "assignee_name" in updates and updates["assignee_name"] is not None:
        updates["assignee_name"] = updates["assignee_name"].strip()

    for field, value in updates.items():
        setattr(task, field, value)

    db.commit()
    db.refresh(task)
    return task


# --- Async Background Workflow ---
@app.post(
    "/api/projects/{project_id}/jobs/digest",
    response_model=schemas.BackgroundJobOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def trigger_digest_job(
    project_id: int,
    payload: schemas.DigestJobRequest = schemas.DigestJobRequest(),
    db: Session = Depends(get_db),
):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    job = models.BackgroundJob(
        project_id=project_id,
        job_type="project_digest",
        status="queued",
        attempts=0,
        max_retries=payload.max_retries,
        simulate_failure=payload.simulate_failure,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    job_worker.enqueue(job.id)
    return job


@app.get("/api/projects/{project_id}/jobs", response_model=list[schemas.BackgroundJobOut])
def list_project_jobs(project_id: int, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return (
        db.query(models.BackgroundJob)
        .filter(models.BackgroundJob.project_id == project_id)
        .order_by(models.BackgroundJob.id.desc())
        .all()
    )