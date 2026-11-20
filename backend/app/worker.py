import json
import queue
import threading
import time
from datetime import datetime, timezone
from .database import SessionLocal
from .models import BackgroundJob, Project


class AsyncJobWorker:
    def __init__(self):
        self._queue: queue.Queue[int] = queue.Queue()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3)

    def enqueue(self, job_id: int):
        self._queue.put(job_id)

    def _run_loop(self):
        while not self._stop_event.is_set():
            try:
                job_id = self._queue.get(timeout=0.5)
            except queue.Empty:
                continue

            try:
                self._process_job(job_id)
            finally:
                self._queue.task_done()

    def _process_job(self, job_id: int):
        db = SessionLocal()
        try:
            job = db.query(BackgroundJob).filter(BackgroundJob.id == job_id).first()
            if not job:
                return

            while True:
                job.attempts += 1
                job.status = "running"
                job.updated_at = datetime.now(timezone.utc)
                db.commit()

                # Simulate async I/O / report generation latency
                time.sleep(1.0)

                try:
                    # Simulate transient failure on first N-1 attempts if requested
                    if job.simulate_failure and job.attempts <= max(1, job.max_retries):
                        raise RuntimeError(
                            f"Simulated transient digest service timeout on attempt {job.attempts}"
                        )

                    project = (
                        db.query(Project).filter(Project.id == job.project_id).first()
                    )
                    if not project:
                        raise ValueError("Parent project no longer exists")

                    stories = project.stories
                    total_stories = len(stories)
                    done_stories = sum(1 for s in stories if s.status == "done")

                    all_tasks = [t for s in stories for t in s.tasks]
                    total_tasks = len(all_tasks)
                    done_tasks = sum(1 for t in all_tasks if t.status == "done")
                    total_hours = sum(t.estimate_hours for t in all_tasks)
                    completed_hours = sum(
                        t.estimate_hours for t in all_tasks if t.status == "done"
                    )

                    summary = {
                        "project_name": project.name,
                        "stories_done_of_total": f"{done_stories}/{total_stories}",
                        "tasks_done_of_total": f"{done_tasks}/{total_tasks}",
                        "hours_completed_of_total": f"{completed_hours}h/{total_hours}h",
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                    }

                    job.status = "completed"
                    job.last_error = None
                    job.result_summary = json.dumps(summary)
                    job.updated_at = datetime.now(timezone.utc)
                    db.commit()
                    break

                except Exception as exc:
                    job.last_error = str(exc)
                    job.updated_at = datetime.now(timezone.utc)
                    if job.attempts <= job.max_retries:
                        job.status = "retrying"
                        db.commit()
                        backoff_seconds = min(2 ** (job.attempts - 1), 5)
                        time.sleep(backoff_seconds)
                    else:
                        job.status = "failed"
                        db.commit()
                        break
        finally:
            db.close()


job_worker = AsyncJobWorker()