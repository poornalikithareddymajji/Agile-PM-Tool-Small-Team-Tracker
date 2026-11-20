Agile PM Tool — Small Team Tracker

A full-stack project management web app built for small engineering teams (around 3–10 people). It organizes work into a strict three-level hierarchy (Project -> User Story -> Task) and includes a background worker that generates project progress summaries asynchronously with automatic retries.

Project Overview & Architecture

What It Does

Three-Level Work Tracking (Project -> User Story -> Task): Instead of one flat to-do list, projects contain user stories (with low/medium/high priority and todo/in_progress/done status), and each story breaks down into tasks with an assignee and hour estimate. You can also filter stories by status.

Background Digest Worker: Clicking Run Async Digest Job triggers a background job that calculates project progress (story counts, task completion, and estimated hours) without freezing the UI. The React frontend polls active jobs every 1.5 seconds until they finish.

Failure Simulation & Retries: There is a toggle to simulate transient failures (simulate_failure). When a job fails, the worker logs the error, switches to retrying, waits briefly, and retries up to max_retries before marking the job completed or failed.

How It's Built

Backend: Python with FastAPI, Pydantic for request/response validation, SQLAlchemy as the ORM, and SQLite for local storage. FastAPI also serves interactive Swagger docs at http://127.0.0.1:8000/docs.

Frontend: React (with Vite) and Tailwind CSS v3, talking to the backend via REST/JSON APIs.

Setup Instructions (Running Locally)

What You Need Installed

Python 3.10 or newer

Node.js (LTS) and npm

Start the Backend
Open a terminal in the project root (agile-pm-tool):

Create and activate a virtual environment
python -m venv .venv
..venv\Scripts\Activate.ps1

Install Python packages
cd backend
pip install -r requirements.txt

Run the FastAPI server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

Start the Frontend
cd frontend
npm install
npm run dev

Open http://localhost:5173 in your browser while the backend is running on port 8000.

API Documentation

Base URL: http://127.0.0.1:8000 (all data endpoints are prefixed with /api). Full interactive docs are available at http://127.0.0.1:8000/docs.

GET /health
Basic server health check.

GET /api/projects
Fetches all projects.

POST /api/projects
Creates a new project.
Example body: {"name": "Sprint Tracker", "description": "Internal tool"}

GET /api/projects/{project_id}/hierarchy
Returns a project with its nested stories and tasks.
Optional query param: ?status=todo|in_progress|done

POST /api/projects/{project_id}/stories
Adds a user story to a project.
Example body: {"title": "Auth flow", "description": "...", "priority": "high", "status": "todo"}

PATCH /api/stories/{story_id}
Updates a story's status or details.
Example body: {"status": "in_progress"}

POST /api/stories/{story_id}/tasks
Adds a task under a user story.
Example body: {"title": "Build form", "assignee_name": "Alex", "estimate_hours": 2, "status": "todo"}

PATCH /api/tasks/{task_id}
Updates a task's status or details.
Example body: {"status": "done"}

POST /api/projects/{project_id}/jobs/digest
Queues a background progress digest job.
Example body: {"simulate_failure": false, "max_retries": 2}

GET /api/projects/{project_id}/jobs
Lists digest jobs and results for a project.

Database Schema

The database uses SQLite with foreign keys enforcing the Project -> User Story -> Task structure:

projects (Project)
id (Integer, Primary Key)
name (String, required)
description (Text/String, optional)
created_at (DateTime)
Links: Has many user_stories and digest_jobs.

user_stories (UserStory)
id (Integer, Primary Key)
project_id (Integer, Foreign Key -> projects.id)
title (String, required)
description (Text/String, optional)
priority (String: low, medium, high)
status (String: todo, in_progress, done)
created_at (DateTime)
Links: Belongs to one project; has many tasks.

tasks (Task)
id (Integer, Primary Key)
story_id (Integer, Foreign Key -> user_stories.id)
title (String, required)
assignee_name (String)
estimate_hours (Integer/Float)
status (String: todo, in_progress, done)
created_at (DateTime)
Links: Belongs to one user_story.

digest_jobs (DigestJob)
id (Integer, Primary Key)
project_id (Integer, Foreign Key -> projects.id)
status (String: queued, running, retrying, completed, failed)
attempts (Integer, starts at 0)
max_retries (Integer, defaults to 2)
simulate_failure (Boolean, defaults to false)
last_error (Text/String, nullable)
result_summary (JSON string with summary stats, nullable)
created_at / updated_at (DateTime)
Links: Belongs to one project.

Design Decisions and Tradeoffs

SQLite instead of PostgreSQL: I chose SQLite so anyone reviewing or running the project locally doesn't have to install or configure a separate database server. The tradeoff is lower write concurrency, so I would switch to PostgreSQL if deploying this for multiple teams at once.

In-Process Background Worker + Polling instead of Celery/Redis: Running the digest worker inside FastAPI and saving job states in SQLite keeps the local setup simple (no Redis broker needed). In a real production setup, a separate worker queue like Celery or RQ with Redis would be safer so long jobs don't share memory with the API server or get lost on restarts.

Strict 3-Level Hierarchy: Keeping the model strictly Project -> User Story -> Task keeps the UI clean and predictable for a small team rather than overcomplicating it with sub-tasks or multiple boards.

Security Considerations

Request Validation: Every incoming payload is validated through Pydantic models before touching the database.

SQL Injection Protection: All database reads and writes use SQLAlchemy's ORM parameterized queries rather than raw SQL strings.

CORS Setup: CORS is configured specifically so the local frontend (http://localhost:5173) can talk to the API without leaving it wide open.

What is Missing for Production: Right now there is no login system or role-based access, because the focus was on the core workflow and async job handling. Before putting this online for a real team, I would add JWT/OAuth2 authentication, check that users belong to a project before letting them read or modify it, move secrets/URLs to .env files, and add rate limiting.

AI Usage Note

I used AI tools while building this project to help debug dependency and syntax issues, brainstorm the retry logic for the background digest worker, and clean up the documentation. I wrote, integrated, and tested all endpoints, database models, and UI flows locally.

What I Would Improve or Build Next With More Time

User Accounts & Permissions: Add login/signup and team roles so tasks can be assigned to real user accounts with proper access control.

Edit & Delete Controls: Add inline editing and delete buttons (with confirmation) for projects, user stories, and tasks, along with filtering by assignee.

Dedicated Job Queue & Automated Tests: Move background jobs to Redis + Celery/ARQ and add pytest unit/integration tests for the API and retry logic.