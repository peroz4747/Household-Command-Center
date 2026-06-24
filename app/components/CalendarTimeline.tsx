"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Box, Button, Card, CardContent, CircularProgress, IconButton, TextField, Typography, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';

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

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date>(today);

  const jsFirstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const firstDay = (jsFirstDay + 6) % 7; // shift so Monday is index 0
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const dayBoxes = (firstDay + daysInMonth) + (7 - ((firstDay + daysInMonth) % 7 || 7));
                    
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

  // local calendar events stored client-side
  const [localEvents, setLocalEvents] = useState<CalendarEvent[]>([]);
  const [hiddenEventKeys, setHiddenEventKeys] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('household-calendar-events');
      if (stored) setLocalEvents(JSON.parse(stored));
    } catch {}
    try {
      const hidden = window.localStorage.getItem('household-calendar-hidden');
      if (hidden) setHiddenEventKeys(JSON.parse(hidden));
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('household-calendar-events', JSON.stringify(localEvents));
  }, [localEvents]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('household-calendar-hidden', JSON.stringify(hiddenEventKeys));
  }, [hiddenEventKeys]);

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

  const combinedEvents = useMemo(() => {
    const all = [...(events || []), ...(localEvents || [])];
    return all.filter((ev) => !hiddenEventKeys.includes(`${ev.title}--${ev.start}`));
  }, [events, localEvents, hiddenEventKeys]);

  const pad = (n: number) => n.toString().padStart(2, "0");

  // local YYYY-MM-DD for input[type=date] values (avoids timezone shifts)
  const formatDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  const formatDisplayDate = (date: Date) => `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;

  const formatDisplayTimeFromString = (s: string) => {
    // s may be 'YYYY-MM-DDTHH:MM', ISO or a human string; try parse first
    try {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) {
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    } catch {}
    // fallback: if it's already HH:MM
    const tMatch = s.match(/(\d{2}:\d{2})/);
    return tMatch ? tMatch[1] : s;
  };

  const eventsForDate = (date: Date) => {
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    return combinedEvents.filter((ev) => {
      try {
        const dt = new Date(ev.start);
        return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
      } catch {
        return false;
      }
    });
  };

  const handlePrevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  // Add event modal state
  const [addOpen, setAddOpen] = useState(false);
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState(formatDateKey(today));
  const [evStart, setEvStart] = useState('09:00');
  const [evEnd, setEvEnd] = useState('10:00');
  const [evDesc, setEvDesc] = useState('');

  const openAddForDate = (date: Date) => {
    setEvDate(formatDateKey(date));
    setAddOpen(true);
  };

  const handleSaveEvent = () => {
    if (!evTitle.trim() || !evDate) return;
    const start = `${evDate}${evStart ? 'T' + evStart : ''}`;
    const end = evEnd ? `${evDate}T${evEnd}` : '';
    const next: CalendarEvent = { title: evTitle.trim(), start, end, description: evDesc };
    setLocalEvents((cur) => [next, ...cur]);
    setAddOpen(false);
    setEvTitle('');
    setEvDesc('');
  };

  const handleDeleteEvent = (ev: CalendarEvent) => {
    const key = `${ev.title}--${ev.start}`;
    const found = localEvents.find((l) => `${l.title}--${l.start}` === key);
    if (found) {
      setLocalEvents((cur) => cur.filter((l) => `${l.title}--${l.start}` !== key));
      return;
    }
    setHiddenEventKeys((cur) => Array.from(new Set([...cur, key])));
  };

  return (
    <Card sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }} suppressHydrationWarning>
      <CardContent sx={{ flexGrow: 1, overflowY: "auto" }}>
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <IconButton size="small" onClick={handlePrevMonth} aria-label="prev month">
                  <ArrowBackIosNewIcon fontSize="small" />
                </IconButton>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {currentMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                </Typography>
                <IconButton size="small" onClick={handleNextMonth} aria-label="next month">
                  <ArrowForwardIosIcon fontSize="small" />
                </IconButton>
              </Box>
              <Box>
                <Button startIcon={<AddIcon />} size="small" onClick={() => openAddForDate(selectedDate)}>
                  Add
                </Button>
              </Box>
            </Box>

            <Box>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                  <Typography key={day} variant="caption" color="text.secondary" sx={{ textAlign: "center", fontWeight: 700, py: 1 }}>
                    {day}
                  </Typography>
                ))}
                {Array.from({ length: dayBoxes }).map((_, i) => {
                  const dayNum = i - firstDay + 1;
                  const isCurrentMonth = dayNum > 0 && dayNum <= daysInMonth;
                  const dateForBox = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), dayNum);
                  const isSelected = isCurrentMonth && formatDateKey(selectedDate) === formatDateKey(dateForBox);
                  const isToday = isCurrentMonth && dayNum === today.getDate() && currentMonth.getMonth() === today.getMonth() && currentMonth.getFullYear() === today.getFullYear();

                  return (
                    <Box
                      key={i}
                      onClick={() => isCurrentMonth && setSelectedDate(dateForBox)}
                      sx={{
                        p: 1,
                        textAlign: "center",
                        borderRadius: 1,
                        cursor: isCurrentMonth ? 'pointer' : 'default',
                        bgcolor: isSelected ? 'rgba(99,102,241,0.18)' : isToday ? "rgba(59, 130, 246, 0.08)" : isCurrentMonth ? "rgba(148,163,184,0.04)" : "transparent",
                        border: isSelected ? '1px solid rgba(99,102,241,0.6)' : isToday ? "1px solid rgba(59,130,246,0.3)" : "1px solid rgba(255,255,255,0.03)",
                        color: isCurrentMonth ? "inherit" : "text.secondary",
                        fontSize: 12,
                        fontWeight: isSelected ? 700 : 400,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {isCurrentMonth ? (
                        <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography sx={{ fontSize: 12 }}>{dayNum}</Typography>
                        </Box>
                      ) : null}
                    </Box>
                  );
                })}
              </Box>

              <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>{`Events for ${formatDisplayDate(selectedDate)}`}</Typography>
                <Box sx={{ display: 'grid', gap: 1 }}>
                  {eventsForDate(selectedDate).length > 0 ? (
                    eventsForDate(selectedDate).map((ev) => (
                      <Box key={`${ev.title}--${ev.start}`} sx={{ p: 2, bgcolor: 'rgba(148,163,184,0.06)', borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                          <Typography sx={{ fontWeight: 700 }}>{ev.title}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {(() => {
                              // show date + local times in DD.MM.YYYY and HH:MM
                              const startDate = (() => {
                                try {
                                  const dt = new Date(ev.start);
                                  if (!Number.isNaN(dt.getTime())) return formatDisplayDate(dt);
                                } catch {}
                                // fallback: if start contains YYYY-MM-DD
                                const m = ev.start && ev.start.slice(0, 10).match(/(\d{4}-\d{2}-\d{2})/);
                                return m ? m[1].split("-").reverse().join(".") : ev.start;
                              })();
                              const startTime = formatDisplayTimeFromString(ev.start);
                              const endTime = ev.end ? formatDisplayTimeFromString(ev.end) : null;
                              return `${startDate} ${startTime}${endTime ? ` — ${endTime}` : ''}`;
                            })()}
                          </Typography>
                          {ev.description ? <Typography variant="body2" color="text.secondary">{ev.description}</Typography> : null}
                        </Box>
                        <Box>
                          <IconButton size="small" aria-label="delete" onClick={() => handleDeleteEvent(ev)}>
                            <DeleteOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </Box>
                    ))
                  ) : (
                    <Typography color="text.secondary">No events for this date.</Typography>
                  )}
                </Box>
              </Box>
            </Box>

            <Dialog open={addOpen} onClose={() => setAddOpen(false)}>
              <DialogTitle>Add event</DialogTitle>
              <DialogContent sx={{ display: 'grid', gap: 2, width: 360 }}>
                {/* preview in DD.MM.YYYY and HH:MM */}
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    {(() => {
                      const parts = evDate.split("-").map((p) => parseInt(p, 10));
                      const previewDate = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(evDate);
                      return `${formatDisplayDate(previewDate)} ${evStart}${evEnd ? ` — ${evEnd}` : ''}`;
                    })()}
                  </Typography>
                </Box>
                <TextField label="Title" value={evTitle} onChange={(e) => setEvTitle(e.target.value)} size="small" fullWidth />
                <TextField label="Date" type="date" value={evDate} onChange={(e) => setEvDate(e.target.value)} size="small" slotProps={{ inputLabel: { shrink: true } }} fullWidth />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField label="Start" type="time" value={evStart} onChange={(e) => setEvStart(e.target.value)} size="small" fullWidth />
                  <TextField label="End" type="time" value={evEnd} onChange={(e) => setEvEnd(e.target.value)} size="small" fullWidth />
                </Box>
                <TextField label="Description" value={evDesc} onChange={(e) => setEvDesc(e.target.value)} size="small" fullWidth multiline rows={2} />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveEvent} variant="contained">Save</Button>
              </DialogActions>
            </Dialog>
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
