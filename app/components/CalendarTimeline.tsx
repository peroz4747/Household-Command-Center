"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  TextField,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import { useI18n } from "../i18n";

interface CalendarEvent {
  id?: string;
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
  const { t, locale } = useI18n();
  // Shranjeni zapis za opravila brez roka (v data/tasks.json) ostane angleški.
  const NO_DUE = "No due date";
  const showDue = (due: string) => t("calendar.due", { date: !due || due === NO_DUE ? t("calendar.noDue") : formatDueDate(due) });
  // Imena dni v tednu (od ponedeljka) v izbranem jeziku; 2024-01-01 je bil ponedeljek.
  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "short" }).replace(/\.$/, ""),
  );
  const [tasks, setTasks] = useState<TaskItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedDate, setSelectedDate] = useState<Date>(today);

  const [addOpen, setAddOpen] = useState(false);
  const [evTitle, setEvTitle] = useState("");
  const [evDate, setEvDate] = useState("");
  const [evStart, setEvStart] = useState("09:00");
  const [evEnd, setEvEnd] = useState("10:00");
  const [evDesc, setEvDesc] = useState("");

  const pad = (n: number) => n.toString().padStart(2, "0");

  const formatDateKey = (date: Date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  const formatDisplayDate = (date: Date) =>
    `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;

  const formatDueDate = (due: string) => {
    const m = due.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? formatDisplayDate(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : due;
  };

  const formatDisplayTimeFromString = (s: string) => {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    const match = s.match(/(\d{2}:\d{2})/);
    return match ? match[1] : s;
  };

  const localDateTimeWithOffset = (date: string, time: string) => {
    const local = new Date(`${date}T${time}:00`);
    const offsetMinutes = -local.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMinutes);
    const hh = String(Math.floor(abs / 60)).padStart(2, "0");
    const mm = String(abs % 60).padStart(2, "0");

    return `${date}T${time}:00${sign}${hh}:${mm}`;
  };

  useEffect(() => {
    setEvDate(formatDateKey(today));
  }, []);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      fetch("/api/calendar").then((res) => res.json()),
      fetch("/api/tasks").then((res) => res.json()),
    ])
      .then(([calendarData, tasksData]) => {
        if (!mounted) return;

        if (calendarData.error) {
          setError(t("calendar.loadError"));
        } else {
          setEvents(calendarData.events ?? []);
        }

        if (tasksData.error) {
          setError(t("calendar.loadError"));
        } else {
          setTasks(tasksData.items ?? []);
        }
      })
      .catch(() => setError(t("calendar.loadError")))
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const jsFirstDay = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1
  ).getDay();

  const firstDay = (jsFirstDay + 6) % 7;
  const daysInMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0
  ).getDate();

  const dayBoxes =
    firstDay + daysInMonth + (7 - ((firstDay + daysInMonth) % 7 || 7));

  const combinedEvents = useMemo(() => events || [], [events]);

  const eventsForDate = (date: Date) => {
    return combinedEvents.filter((ev) => {
      const dt = new Date(ev.start);
      return (
        !Number.isNaN(dt.getTime()) &&
        dt.getFullYear() === date.getFullYear() &&
        dt.getMonth() === date.getMonth() &&
        dt.getDate() === date.getDate()
      );
    });
  };

  const pendingTasks = useMemo(
    () => tasks.filter((task) => task.status === "pending" && !isOverdueTask(task)),
    [tasks]
  );

  const overdueTasks = useMemo(
    () => tasks.filter((task) => task.status === "pending" && isOverdueTask(task)),
    [tasks]
  );

  const completedTasks = useMemo(
    () => tasks.filter((task) => task.status === "completed"),
    [tasks]
  );

  const handlePrevMonth = () =>
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    );

  const handleNextMonth = () =>
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
    );

  const openAddForDate = (date: Date) => {
    setEvDate(formatDateKey(date));
    setAddOpen(true);
  };

  const handleSaveEvent = async () => {
    if (!evTitle.trim() || !evDate || !evStart || !evEnd) return;

    const next = {
      title: evTitle.trim(),
      start: localDateTimeWithOffset(evDate, evStart),
      end: localDateTimeWithOffset(evDate, evEnd),
      description: evDesc,
    };

    try {
      const response = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });

      const created = await response.json();

      if (!response.ok) {
        throw new Error(t("calendar.saveEventError"));
      }

      setEvents((current) => [created, ...current]);
      setAddOpen(false);
      setEvTitle("");
      setEvDesc("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteEvent = async (ev: CalendarEvent) => {
    if (!ev.id) {
      setError(t("calendar.noEventId"));
      return;
    }

    try {
      const response = await fetch("/api/calendar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ev.id }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(t("calendar.deleteEventError"));
      }

      setEvents((current) => current.filter((item) => item.id !== ev.id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleAddTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!newTaskTitle.trim()) return;

    const nextTask = {
      title: newTaskTitle.trim(),
      due: newTaskDue || NO_DUE,
      status: "pending",
    };

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextTask),
      });

      const created = await response.json();

      if (!response.ok) {
        throw new Error(t("calendar.saveTaskError"));
      }

      setTasks((current) => [created, ...current]);
      setNewTaskTitle("");
      setNewTaskDue("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      setTasks((current) => current.filter((task) => task.id !== id));
    } catch {
      setError(t("calendar.deleteTaskError"));
    }
  };

  const handleCompleteTask = async (id: string) => {
    const currentTask = tasks.find((task) => task.id === id);
    if (!currentTask) return;

    try {
      const response = await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...currentTask, status: "completed" }),
      });

      const updated = await response.json();

      if (!response.ok) {
        throw new Error(t("calendar.updateTaskError"));
      }

      setTasks((current) =>
        current.map((task) => (task.id === id ? updated : task))
      );
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Card
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      suppressHydrationWarning
    >
      <CardContent sx={{ flexGrow: 1, overflowY: "auto" }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="subtitle2" color="secondary">
              {t("calendar.overline")}
            </Typography>
            <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>
              {t("calendar.title")}
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
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <IconButton size="small" onClick={handlePrevMonth}>
                  <ArrowBackIosNewIcon fontSize="small" />
                </IconButton>

                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {currentMonth.toLocaleString(locale, {
                    month: "long",
                    year: "numeric",
                  })}
                </Typography>

                <IconButton size="small" onClick={handleNextMonth}>
                  <ArrowForwardIosIcon fontSize="small" />
                </IconButton>
              </Box>

              <Button
                startIcon={<AddIcon />}
                size="small"
                onClick={() => openAddForDate(selectedDate)}
              >
                {t("common.add")}
              </Button>
            </Box>

            <Box>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
                {weekdayNames.map((day) => (
                  <Typography
                    key={day}
                    variant="caption"
                    color="text.secondary"
                    sx={{ textAlign: "center", fontWeight: 700, py: 1 }}
                  >
                    {day}
                  </Typography>
                ))}

                {Array.from({ length: dayBoxes }).map((_, i) => {
                  const dayNum = i - firstDay + 1;
                  const isCurrentMonth = dayNum > 0 && dayNum <= daysInMonth;
                  const dateForBox = new Date(
                    currentMonth.getFullYear(),
                    currentMonth.getMonth(),
                    dayNum
                  );

                  const isSelected =
                    isCurrentMonth &&
                    formatDateKey(selectedDate) === formatDateKey(dateForBox);

                  const isToday =
                    isCurrentMonth &&
                    dayNum === today.getDate() &&
                    currentMonth.getMonth() === today.getMonth() &&
                    currentMonth.getFullYear() === today.getFullYear();

                  return (
                    <Box
                      key={i}
                      onClick={() => isCurrentMonth && setSelectedDate(dateForBox)}
                      sx={{
                        p: 1,
                        textAlign: "center",
                        borderRadius: 1,
                        cursor: isCurrentMonth ? "pointer" : "default",
                        bgcolor: isSelected
                          ? "rgba(99,102,241,0.18)"
                          : isToday
                            ? "rgba(59,130,246,0.08)"
                            : isCurrentMonth
                              ? "rgba(148,163,184,0.04)"
                              : "transparent",
                        border: isSelected
                          ? "1px solid rgba(99,102,241,0.6)"
                          : isToday
                            ? "1px solid rgba(59,130,246,0.3)"
                            : "1px solid rgba(255,255,255,0.03)",
                        color: isCurrentMonth ? "inherit" : "text.secondary",
                        fontSize: 12,
                        fontWeight: isSelected ? 700 : 400,
                      }}
                    >
                      {isCurrentMonth ? dayNum : null}
                    </Box>
                  );
                })}
              </Box>

              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  {t("calendar.eventsFor", { date: formatDisplayDate(selectedDate) })}
                </Typography>

                <Box sx={{ display: "grid", gap: 1 }}>
                  {eventsForDate(selectedDate).length > 0 ? (
                    eventsForDate(selectedDate).map((ev) => (
                      <Box
                        key={ev.id || `${ev.title}--${ev.start}`}
                        sx={{
                          p: 2,
                          bgcolor: "rgba(148,163,184,0.06)",
                          borderRadius: 2,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <Box>
                          <Typography sx={{ fontWeight: 700 }}>{ev.title}</Typography>

                          <Typography variant="body2" color="text.secondary">
                            {`${formatDisplayDate(new Date(ev.start))} ${formatDisplayTimeFromString(
                              ev.start
                            )} — ${formatDisplayTimeFromString(ev.end)}`}
                          </Typography>

                          {ev.description ? (
                            <Typography variant="body2" color="text.secondary">
                              {ev.description}
                            </Typography>
                          ) : null}
                        </Box>

                        <IconButton size="small" onClick={() => handleDeleteEvent(ev)}>
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ))
                  ) : (
                    <Typography color="text.secondary">
                      {t("calendar.noEvents")}
                    </Typography>
                  )}
                </Box>
              </Box>
            </Box>

            <Dialog open={addOpen} onClose={() => setAddOpen(false)}>
              <DialogTitle>{t("calendar.addEvent")}</DialogTitle>

              <DialogContent sx={{ display: "grid", gap: 2, width: 360 }}>
                <TextField
                  label={t("calendar.field.title")}
                  value={evTitle}
                  onChange={(e) => setEvTitle(e.target.value)}
                  size="small"
                  fullWidth
                />

                <TextField
                  label={t("calendar.field.date")}
                  type="date"
                  value={evDate}
                  onChange={(e) => setEvDate(e.target.value)}
                  size="small"
                  slotProps={{ inputLabel: { shrink: true } }}
                  fullWidth
                />

                <Box sx={{ display: "flex", gap: 1 }}>
                  <TextField
                    label={t("calendar.field.start")}
                    type="time"
                    value={evStart}
                    onChange={(e) => setEvStart(e.target.value)}
                    size="small"
                    fullWidth
                  />

                  <TextField
                    label={t("calendar.field.end")}
                    type="time"
                    value={evEnd}
                    onChange={(e) => setEvEnd(e.target.value)}
                    size="small"
                    fullWidth
                  />
                </Box>

                <TextField
                  label={t("calendar.field.description")}
                  value={evDesc}
                  onChange={(e) => setEvDesc(e.target.value)}
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                />
              </DialogContent>

              <DialogActions>
                <Button onClick={() => setAddOpen(false)}>{t("common.cancel")}</Button>
                <Button onClick={handleSaveEvent} variant="contained">
                  {t("common.save")}
                </Button>
              </DialogActions>
            </Dialog>
          </Box>
        )}

        <Box component="form" onSubmit={handleAddTask} sx={{ display: "grid", gap: 2, mt: 4 }}>
          <Typography variant="subtitle2" color="secondary">
            {t("calendar.addTaskSection")}
          </Typography>

          <TextField
            label={t("calendar.field.task")}
            value={newTaskTitle}
            onChange={(event) => setNewTaskTitle(event.target.value)}
            size="small"
            fullWidth
          />

          <TextField
            label={t("calendar.field.due")}
            type="date"
            value={newTaskDue}
            onChange={(event) => setNewTaskDue(event.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
          />

          <Button type="submit" variant="contained" disabled={!newTaskTitle.trim()}>
            {t("calendar.addTask")}
          </Button>
        </Box>

        <Box sx={{ mt: 3 }}>
          {overdueTasks.length > 0 ? (
            <Box sx={{ display: "grid", gap: 1.5, mb: 2 }}>
              <Typography variant="subtitle2" color="error">
                {t("calendar.overdue")}
              </Typography>

              {overdueTasks.map((task) => (
                <Box
                  key={task.id}
                  sx={{
                    p: 2,
                    bgcolor: "rgba(248,113,113,0.12)",
                    borderRadius: 3,
                    border: "1px solid rgba(248,113,113,0.3)",
                  }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{task.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {showDue(task.due)}
                      </Typography>
                    </Box>

                    <Box>
                      <IconButton size="small" onClick={() => handleCompleteTask(task.id)}>
                        <CheckCircleOutlinedIcon fontSize="small" />
                      </IconButton>

                      <IconButton size="small" onClick={() => handleDeleteTask(task.id)}>
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
                {t("calendar.pending")}
              </Typography>

              {pendingTasks.map((task) => (
                <Box
                  key={task.id}
                  sx={{
                    p: 2,
                    bgcolor: "rgba(148,163,184,0.08)",
                    borderRadius: 3,
                  }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{task.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {showDue(task.due)}
                      </Typography>
                    </Box>

                    <Box>
                      <IconButton size="small" onClick={() => handleCompleteTask(task.id)}>
                        <CheckCircleOutlinedIcon fontSize="small" />
                      </IconButton>

                      <IconButton size="small" onClick={() => handleDeleteTask(task.id)}>
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
                {t("calendar.completed")}
              </Typography>

              {completedTasks.map((task) => (
                <Box
                  key={task.id}
                  sx={{
                    p: 2,
                    bgcolor: "rgba(34,197,94,0.12)",
                    borderRadius: 3,
                  }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{task.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {showDue(task.due)}
                      </Typography>
                    </Box>

                    <IconButton size="small" onClick={() => handleDeleteTask(task.id)}>
                      <DeleteOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              ))}
            </Box>
          ) : null}

          {tasks.length === 0 ? (
            <Typography color="text.secondary">
              {t("calendar.empty")}
            </Typography>
          ) : null}
        </Box>
      </CardContent>

      <Box sx={{ bgcolor: "rgba(255,255,255,0.03)", p: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {t("calendar.sync")}
          </Typography>

          <Button href="/api/calendar" size="small" sx={{ textTransform: "none" }}>
            {t("common.refresh")}
          </Button>
        </Box>
      </Box>
    </Card>
  );
}