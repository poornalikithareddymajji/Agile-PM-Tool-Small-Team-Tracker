import React, { useEffect, useState } from "react";

const API_BASE = "http://127.0.0.1:8000/api";

const STATUS_BADGE = {
  todo: "bg-slate-200 text-slate-800",
  in_progress: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
  queued: "bg-slate-200 text-slate-800",
  running: "bg-blue-100 text-blue-800",
  retrying: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
};

export default function App() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [hierarchy, setHierarchy] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [simulateFailure, setSimulateFailure] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");

  const [storyTitle, setStoryTitle] = useState("");
  const [storyDesc, setStoryDesc] = useState("");
  const [storyPriority, setStoryPriority] = useState("medium");

  const [taskInputs, setTaskInputs] = useState({});
  const [errorMsg, setErrorMsg] = useState("");

  async function loadProjects(preferredId = null) {
    try {
      const res = await fetch(`${API_BASE}/projects`);
      const data = await res.json();
      setProjects(data);
      const targetId = preferredId ?? selectedProjectId ?? (data[0]?.id || null);
      setSelectedProjectId(targetId);
    } catch {
      setErrorMsg("Could not reach backend API at http://127.0.0.1:8000");
    }
  }

  async function loadHierarchy(projectId, filter = statusFilter) {
    if (!projectId) {
      setHierarchy(null);
      return;
    }
    const query = filter ? `?status=${encodeURIComponent(filter)}` : "";
    const res = await fetch(`${API_BASE}/projects/${projectId}/hierarchy${query}`);
    if (res.ok) {
      setHierarchy(await res.json());
    }
  }

  async function loadJobs(projectId) {
    if (!projectId) {
      setJobs([]);
      return;
    }
    const res = await fetch(`${API_BASE}/projects/${projectId}/jobs`);
    if (res.ok) {
      setJobs(await res.json());
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadHierarchy(selectedProjectId, statusFilter);
      loadJobs(selectedProjectId);
    }
  }, [selectedProjectId, statusFilter]);

  useEffect(() => {
    if (!selectedProjectId) return;
    const hasActiveJob = jobs.some((j) =>
      ["queued", "running", "retrying"].includes(j.status)
    );
    if (!hasActiveJob) return;

    const timer = setInterval(() => {
      loadJobs(selectedProjectId);
    }, 1500);
    return () => clearInterval(timer);
  }, [jobs, selectedProjectId]);

  async function handleCreateProject(e) {
    e.preventDefault();
    if (!projectName.trim()) return;
    setErrorMsg("");
    const res = await fetch(`${API_BASE}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: projectName, description: projectDesc }),
    });
    if (res.ok) {
      const created = await res.json();
      setProjectName("");
      setProjectDesc("");
      await loadProjects(created.id);
    }
  }

  async function handleCreateStory(e) {
    e.preventDefault();
    if (!selectedProjectId || !storyTitle.trim()) return;
    const res = await fetch(`${API_BASE}/projects/${selectedProjectId}/stories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: storyTitle,
        description: storyDesc,
        priority: storyPriority,
        status: "todo",
      }),
    });
    if (res.ok) {
      setStoryTitle("");
      setStoryDesc("");
      await loadHierarchy(selectedProjectId);
    }
  }

  async function handleUpdateStoryStatus(storyId, newStatus) {
    const res = await fetch(`${API_BASE}/stories/${storyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      await loadHierarchy(selectedProjectId);
    }
  }

  function updateTaskDraft(storyId, patch) {
    setTaskInputs((prev) => ({
      ...prev,
      [storyId]: {
        title: "",
        assignee_name: "Alex",
        estimate_hours: 2,
        ...prev[storyId],
        ...patch,
      },
    }));
  }

  async function handleCreateTask(e, storyId) {
    e.preventDefault();
    const draft = taskInputs[storyId] || {
      title: "",
      assignee_name: "Alex",
      estimate_hours: 2,
    };
    if (!draft.title.trim()) return;

    const res = await fetch(`${API_BASE}/stories/${storyId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: draft.title,
        assignee_name: draft.assignee_name || "Unassigned",
        estimate_hours: Number(draft.estimate_hours) || 2,
        status: "todo",
      }),
    });
    if (res.ok) {
      updateTaskDraft(storyId, { title: "" });
      await loadHierarchy(selectedProjectId);
    }
  }

  async function handleUpdateTaskStatus(taskId, newStatus) {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      await loadHierarchy(selectedProjectId);
    }
  }

  async function handleTriggerDigest() {
    if (!selectedProjectId) return;
    const res = await fetch(`${API_BASE}/projects/${selectedProjectId}/jobs/digest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        simulate_failure: simulateFailure,
        max_retries: 2,
      }),
    });
    if (res.ok) {
      await loadJobs(selectedProjectId);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Agile PM Tool — Small Team Tracker
            </h1>
            <p className="text-sm text-slate-500">
              Hierarchy: Project → User Story → Task + Async Digest Worker
            </p>
          </div>
          {errorMsg && (
            <span className="rounded bg-rose-100 px-3 py-1 text-sm text-rose-800">
              {errorMsg}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 p-6 lg:grid-cols-12">
        <section className="space-y-4 lg:col-span-3">
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold">Projects</h2>
            <form onSubmit={handleCreateProject} className="space-y-2">
              <input
                type="text"
                placeholder="New project name..."
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full rounded border px-3 py-2 text-sm"
                required
              />
              <input
                type="text"
                placeholder="Short description..."
                value={projectDesc}
                onChange={(e) => setProjectDesc(e.target.value)}
                className="w-full rounded border px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                + Create Project
              </button>
            </form>

            <div className="mt-4 space-y-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProjectId(p.id)}
                  className={`w-full rounded border p-2.5 text-left text-sm transition ${
                    p.id === selectedProjectId
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="font-semibold">{p.name}</div>
                  {p.description && (
                    <div
                      className={`text-xs ${
                        p.id === selectedProjectId ? "text-slate-300" : "text-slate-500"
                      }`}
                    >
                      {p.description}
                    </div>
                  )}
                </button>
              ))}
              {projects.length === 0 && (
                <p className="text-xs text-slate-500">No projects yet. Create one above.</p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-4 lg:col-span-6">
          {hierarchy ? (
            <>
              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold">{hierarchy.name}</h2>
                    <p className="text-sm text-slate-600">{hierarchy.description}</p>
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded border px-2.5 py-1.5 text-sm"
                  >
                    <option value="">All Story Statuses</option>
                    <option value="todo">Todo</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>

                <form
                  onSubmit={handleCreateStory}
                  className="mt-4 grid grid-cols-1 gap-2 border-t pt-4 sm:grid-cols-12"
                >
                  <input
                    type="text"
                    placeholder="New user story title..."
                    value={storyTitle}
                    onChange={(e) => setStoryTitle(e.target.value)}
                    className="rounded border px-3 py-2 text-sm sm:col-span-5"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Acceptance / notes..."
                    value={storyDesc}
                    onChange={(e) => setStoryDesc(e.target.value)}
                    className="rounded border px-3 py-2 text-sm sm:col-span-4"
                  />
                  <select
                    value={storyPriority}
                    onChange={(e) => setStoryPriority(e.target.value)}
                    className="rounded border px-2 py-2 text-sm sm:col-span-1"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Med</option>
                    <option value="high">High</option>
                  </select>
                  <button
                    type="submit"
                    className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 sm:col-span-2"
                  >
                    + Story
                  </button>
                </form>
              </div>

              <div className="space-y-4">
                {hierarchy.stories.map((story) => {
                  const draft = taskInputs[story.id] || {
                    title: "",
                    assignee_name: "Alex",
                    estimate_hours: 2,
                  };
                  return (
                    <div
                      key={story.id}
                      className="rounded-lg border bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                              STORY #{story.id}
                            </span>
                            <h3 className="font-semibold">{story.title}</h3>
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                              {story.priority}
                            </span>
                          </div>
                          {story.description && (
                            <p className="mt-1 text-sm text-slate-600">
                              {story.description}
                            </p>
                          )}
                        </div>
                        <select
                          value={story.status}
                          onChange={(e) =>
                            handleUpdateStoryStatus(story.id, e.target.value)
                          }
                          className={`rounded px-2.5 py-1 text-xs font-medium ${
                            STATUS_BADGE[story.status] || ""
                          }`}
                        >
                          <option value="todo">todo</option>
                          <option value="in_progress">in_progress</option>
                          <option value="done">done</option>
                        </select>
                      </div>

                      <div className="mt-3 space-y-2 border-t pt-3 pl-3">
                        {story.tasks.map((task) => (
                          <div
                            key={task.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 px-3 py-2 text-sm"
                          >
                            <div>
                              <span className="font-medium">{task.title}</span>
                              <span className="ml-2 text-xs text-slate-500">
                                @{task.assignee_name} · {task.estimate_hours}h
                              </span>
                            </div>
                            <select
                              value={task.status}
                              onChange={(e) =>
                                handleUpdateTaskStatus(task.id, e.target.value)
                              }
                              className={`rounded px-2 py-0.5 text-xs font-medium ${
                                STATUS_BADGE[task.status] || ""
                              }`}
                            >
                              <option value="todo">todo</option>
                              <option value="in_progress">in_progress</option>
                              <option value="done">done</option>
                            </select>
                          </div>
                        ))}

                        <form
                          onSubmit={(e) => handleCreateTask(e, story.id)}
                          className="mt-2 flex flex-wrap gap-2"
                        >
                          <input
                            type="text"
                            placeholder="Add task..."
                            value={draft.title}
                            onChange={(e) =>
                              updateTaskDraft(story.id, { title: e.target.value })
                            }
                            className="min-w-[140px] flex-1 rounded border bg-white px-2.5 py-1.5 text-xs"
                            required
                          />
                          <input
                            type="text"
                            placeholder="Assignee"
                            value={draft.assignee_name}
                            onChange={(e) =>
                              updateTaskDraft(story.id, {
                                assignee_name: e.target.value,
                              })
                            }
                            className="w-24 rounded border bg-white px-2 py-1.5 text-xs"
                          />
                          <input
                            type="number"
                            min="1"
                            max="200"
                            value={draft.estimate_hours}
                            onChange={(e) =>
                              updateTaskDraft(story.id, {
                                estimate_hours: e.target.value,
                              })
                            }
                            className="w-16 rounded border bg-white px-2 py-1.5 text-xs"
                          />
                          <button
                            type="submit"
                            className="rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                          >
                            + Task
                          </button>
                        </form>
                      </div>
                    </div>
                  );
                })}
                {hierarchy.stories.length === 0 && (
                  <div className="rounded-lg border bg-white p-6 text-center text-sm text-slate-500">
                    No user stories in this project yet. Add one above.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-lg border bg-white p-8 text-center text-sm text-slate-500">
              Select or create a project to view its hierarchy.
            </div>
          )}
        </section>

        <section className="space-y-4 lg:col-span-3">
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Async Digest Worker</h2>
            <p className="mt-1 text-xs text-slate-500">
              Runs background project progress summaries with retry & backoff support.
            </p>

            <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={simulateFailure}
                onChange={(e) => setSimulateFailure(e.target.checked)}
              />
              Simulate transient failure (tests retry)
            </label>

            <button
              onClick={handleTriggerDigest}
              disabled={!selectedProjectId}
              className="mt-3 w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Run Async Digest Job
            </button>

            <div className="mt-4 space-y-2.5">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded border bg-slate-50 p-2.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Job #{job.id}</span>
                    <span
                      className={`rounded px-2 py-0.5 font-medium ${
                        STATUS_BADGE[job.status] || ""
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>
                  <div className="mt-1 text-slate-600">
                    Attempts: {job.attempts}/{job.max_retries + 1}
                  </div>
                  {job.last_error && (
                    <div className="mt-1 text-rose-700">{job.last_error}</div>
                  )}
                  {job.result_summary && (
                    <pre className="mt-1.5 overflow-x-auto rounded bg-white p-2 text-[11px] text-slate-800">
                      {JSON.stringify(JSON.parse(job.result_summary), null, 2)}
                    </pre>
                  )}
                </div>
              ))}
              {jobs.length === 0 && (
                <p className="text-xs text-slate-500">No background jobs triggered yet.</p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}