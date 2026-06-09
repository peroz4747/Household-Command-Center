"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Box, Button, Card, CardContent, CircularProgress, IconButton, TextField, Typography } from "@mui/material";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";

interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  description: string;
}

type TaskStatus = "pending" | "completed";

interface TaskItem {
  id: string;
  title: string;
  due: string;
  status: TaskStatus;
}

const isOverdueTask = (task: TaskItem) => {
  if (task.status === "completed") return false;
  if (!task.due || task.due === "No due date") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const taskDate = new Date(task.due);
  taskDate.setHours(0, 0, 0, 0);
  return taskDate < today;
};

export default function CalendarTimeline() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");

  useEffect(() => {
    let mounted = true;

    fetch("/api/calendar")
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return;
        if (data.error) {
          setError(data.error);
        } else {
          setEvents(data.events ?? []);
        }
      })
      .catch(() => setError("Unable to load calendar events."))
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("household-dashboard-tasks");
    if (stored) {
      try {
        setTasks(JSON.parse(stored));
      } catch {
        setTasks([]);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("household-dashboard-tasks", JSON.stringify(tasks));
  }, [tasks]);

  const pendingTasks = useMemo(
    () => tasks.filter((task) => task.status === "pending" && !isOverdueTask(task)),
    [tasks]
  );
  const overdueTasks = useMemo(
    () => tasks.filter((task) => task.status === "pending" && isOverdueTask(task)),
    [tasks]
  );
  const completedTasks = useMemo(() => tasks.filter((task) => task.status === "completed"), [tasks]);

  const handleAddTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTaskTitle.trim()) return;

    const nextTask: TaskItem = {
      id: `${Date.now()}-${newTaskTitle}`,
      title: newTaskTitle.trim(),
      due: newTaskDue || "No due date",
      status: "pending",
    };

    setTasks((current) => [nextTask, ...current]);
    setNewTaskTitle("");
    setNewTaskDue("");
  };

  const handleDeleteTask = (id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id));
  };

  const handleCompleteTask = (id: string) => {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, status: "completed" } : task)));
  };

  return (
    <Card sx={{ minHeight: 430, display: "flex", flexDirection: "column", justifyContent: "space-between" }} suppressHydrationWarning>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="subtitle2" color="secondary">
              Today&apos;s focus
            </Typography>
            <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>
              Task timeline
            </Typography>
          </Box>
          {loading ? <CircularProgress size={32} color="inherit" /> : null}
        </Box>

        {error ? (
          <Typography color="error" sx={{ mt: 4 }}>
            {error}
          </Typography>
        ) : (
          <Box sx={{ display: "grid", gap: 2, mt: 4 }}>
            {events.length > 0 ? (
              events.map((event) => (
                <Box key={event.title + event.start} sx={{ display: "flex", alignItems: "center", gap: 2, p: 2, bgcolor: "rgba(148,163,184,0.08)", borderRadius: 3 }}>
                  <Box sx={{ width: 4, height: 40, borderRadius: 2, bgcolor: "primary.main" }} />
                  <Box>
                    <Typography sx={{ fontWeight: 700 }}>{event.title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {event.start} — {event.end}
                    </Typography>
                    {event.description ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {event.description}
                      </Typography>
                    ) : null}
                  </Box>
                </Box>
              ))
            ) : (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  This month
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <Typography key={day} variant="caption" color="text.secondary" sx={{ textAlign: "center", fontWeight: 700, py: 1 }}>
                      {day}
                    </Typography>
                  ))}
                  {Array.from({ length: 42 }).map((_, i) => {
                    const today = new Date();
                    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
                    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
                    const dayNum = i - firstDay + 1;
                    const isCurrentMonth = dayNum > 0 && dayNum <= daysInMonth;
                    const isToday = isCurrentMonth && dayNum === today.getDate();
                    
                    return (
                      <Box
                        key={i}
                        sx={{
                          p: 1,
                          textAlign: "center",
                          borderRadius: 1,
                          bgcolor: isToday ? "rgba(59, 130, 246, 0.2)" : isCurrentMonth ? "rgba(148,163,184,0.04)" : "transparent",
                          border: isToday ? "1px solid rgba(59, 130, 246, 0.5)" : "1px solid rgba(255,255,255,0.05)",
                          color: isCurrentMonth ? "inherit" : "text.secondary",
                          fontSize: 12,
                          fontWeight: isToday ? 700 : 400,
                        }}
                      >
                        {isCurrentMonth ? dayNum : ""}
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            )}
          </Box>
        )}

        <Box component="form" onSubmit={handleAddTask} sx={{ display: "grid", gap: 2, mt: 4 }}>
          <Typography variant="subtitle2" color="secondary">
            Add a task
          </Typography>
          <TextField
            label="Task"
            value={newTaskTitle}
            onChange={(event) => setNewTaskTitle(event.target.value)}
            size="small"
            fullWidth
          />
          <TextField
            label="Due date"
            type="date"
            value={newTaskDue}
            onChange={(event) => setNewTaskDue(event.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
          />
          <Button type="submit" variant="contained" disabled={!newTaskTitle.trim()}>
            Add task
          </Button>
        </Box>

        <Box sx={{ mt: 3 }}>
          {overdueTasks.length > 0 ? (
            <Box sx={{ display: "grid", gap: 1.5, mb: 2 }}>
              <Typography variant="subtitle2" color="error">
                Overdue tasks
              </Typography>
              {overdueTasks.map((task) => (
                <Box key={task.id} sx={{ p: 2, bgcolor: "rgba(248,113,113,0.12)", borderRadius: 3, border: "1px solid rgba(248,113,113,0.3)" }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, alignItems: "center" }}>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{task.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Due: {task.due}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", gap: 1 }}>
                      <IconButton aria-label="complete" size="small" onClick={() => handleCompleteTask(task.id)}>
                        <CheckCircleOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton aria-label="delete" size="small" onClick={() => handleDeleteTask(task.id)}>
                        <DeleteOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          ) : null}

          {pendingTasks.length > 0 ? (
            <Box sx={{ display: "grid", gap: 1.5, mb: 2 }}>
              <Typography variant="subtitle2" color="secondary">
                Pending tasks
              </Typography>
              {pendingTasks.map((task) => (
                <Box key={task.id} sx={{ p: 2, bgcolor: "rgba(148,163,184,0.08)", borderRadius: 3 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, alignItems: "center" }}>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{task.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Due: {task.due}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", gap: 1 }}>
                      <IconButton aria-label="complete" size="small" onClick={() => handleCompleteTask(task.id)}>
                        <CheckCircleOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton aria-label="delete" size="small" onClick={() => handleDeleteTask(task.id)}>
                        <DeleteOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          ) : null}

          {completedTasks.length > 0 ? (
            <Box sx={{ display: "grid", gap: 1.5 }}>
              <Typography variant="subtitle2" color="success.main">
                Completed tasks
              </Typography>
              {completedTasks.map((task) => (
                <Box key={task.id} sx={{ p: 2, bgcolor: "rgba(34,197,94,0.12)", borderRadius: 3 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, alignItems: "center" }}>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{task.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Due: {task.due}
                      </Typography>
                    </Box>
                    <IconButton aria-label="delete" size="small" onClick={() => handleDeleteTask(task.id)}>
                      <DeleteOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              ))}
            </Box>
          ) : null}

          {tasks.length === 0 ? (
            <Typography color="text.secondary">Create a new task to keep the household organized.</Typography>
          ) : null}
        </Box>
      </CardContent>
      <Box sx={{ bgcolor: "rgba(255,255,255,0.03)", p: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Calendar sync is enabled.
          </Typography>
          <Button href="/api/calendar" size="small" sx={{ textTransform: "none" }}>
            Refresh
          </Button>
        </Box>
      </Box>
    </Card>
  );
}
