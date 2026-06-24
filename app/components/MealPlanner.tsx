"use client";

import { useEffect, useState } from "react";
import { Box, Card, CardContent, TextField, Typography, Button, IconButton } from "@mui/material";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

interface MealPlanEntry {
  date: string;
  label: string;
  meal: string;
  editing: boolean;
}

const TODAY_INDEX = 7;

const getBaseDate = () => new Date();

const toDateString = (date: Date) => date.toISOString().slice(0, 10);

const getDateLabel = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);

const getTodayDateString = () => toDateString(getBaseDate());

const getMealPlanWindow = (baseDate = getBaseDate()) => {
  const result: MealPlanEntry[] = [];

  for (let index = 0; index < 16; index += 1) {
    const next = new Date(baseDate);
    next.setDate(baseDate.getDate() + index - TODAY_INDEX);

    result.push({
      date: toDateString(next),
      label: getDateLabel(next),
      meal: "",
      editing: false,
    });
  }

  return result;
};

const mealIdeas = [
  "Pasta Carbonara",
  "Grilled Chicken",
  "Fish Tacos",
  "Beef Stir Fry",
  "Vegetable Curry",
  "Salmon with Lemon",
  "Risotto",
  "Pad Thai",
  "Roast Vegetables",
  "Homemade Pizza",
  "Chicken Breast with Rice",
  "Beef Meatballs",
  "Shakshuka",
  "Thai Green Curry",
  "Baked Tilapia",
];

export default function MealPlanner() {
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [mounted, setMounted] = useState(false);
  const today = getTodayDateString();

  useEffect(() => {
    const expectedWindow = getMealPlanWindow();
    const stored = window.localStorage.getItem("household-dashboard-mealplan");

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Array<Omit<MealPlanEntry, "editing">>;

        if (Array.isArray(parsed) && parsed.length === 16) {
          const mealsByDate = new Map(parsed.map((entry) => [entry.date, entry.meal]));

          setEntries(
            expectedWindow.map((entry) => ({
              ...entry,
              meal: mealsByDate.get(entry.date) ?? "",
              editing: false,
            }))
          );

          setMounted(true);
          return;
        }
      } catch {
        // ignore parse errors
      }
    }

    setEntries(expectedWindow);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const toSave = entries.map(({ editing, ...rest }) => rest);
    window.localStorage.setItem("household-dashboard-mealplan", JSON.stringify(toSave));
  }, [entries, mounted]);

  const handleChange = (date: string, value: string) => {
    setEntries((current) =>
      current.map((entry) => (entry.date === date ? { ...entry, meal: value } : entry))
    );
  };

  const handleStartEdit = (date: string) => {
    setEntries((current) =>
      current.map((entry) => (entry.date === date ? { ...entry, editing: true } : entry))
    );
  };

  const handleEndEdit = (date: string) => {
    setEntries((current) =>
      current.map((entry) => (entry.date === date ? { ...entry, editing: false } : entry))
    );
  };

  const handleRandomize = (date: string) => {
    const randomMeal = mealIdeas[Math.floor(Math.random() * mealIdeas.length)];
    handleChange(date, randomMeal);
    handleEndEdit(date);
  };

  return (
    <Card sx={{ minHeight: 420 }} suppressHydrationWarning>
      <CardContent>
        <Typography variant="subtitle2" color="secondary">
          Meal planner
        </Typography>

        <Typography variant="h6" sx={{ mt: 1, mb: 3, fontWeight: 700 }}>
          Two week dinner calendar
        </Typography>

        {!mounted ? (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)" }, gap: 2 }}>
            {Array.from({ length: 16 }).map((_, i) => (
              <Box
                key={i}
                sx={{
                  p: 2,
                  bgcolor: "rgba(148,163,184,0.05)",
                  borderRadius: 2,
                  border: "1px solid rgba(255,255,255,0.1)",
                  height: 100,
                }}
              />
            ))}
          </Box>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)" }, gap: 2 }}>
            {entries.map((entry, index) => {
              const isToday = index === TODAY_INDEX;

              return (
                <Box
                  key={entry.date}
                  sx={{
                    p: 2,
                    bgcolor: isToday ? "rgba(59, 130, 246, 0.08)" : "rgba(148,163,184,0.05)",
                    borderRadius: 2,
                    border: isToday ? "2px solid #f87171" : "1px solid rgba(255,255,255,0.1)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    transition: "all 0.2s ease",
                    "&:hover": {
                      bgcolor: isToday ? "rgba(59, 130, 246, 0.12)" : "rgba(148,163,184,0.08)",
                    },
                  }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 13 }}>
                      {entry.label}
                      {isToday ? (
                        <Typography component="span" sx={{ ml: 1, color: "#f87171", fontWeight: 700 }}>
                          ●
                        </Typography>
                      ) : null}
                    </Typography>
                  </Box>

                  {entry.editing ? (
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                      <TextField
                        value={entry.meal}
                        onChange={(event) => handleChange(entry.date, event.target.value)}
                        placeholder="What to eat?"
                        size="small"
                        fullWidth
                        autoFocus
                        sx={{ flex: 1 }}
                      />

                      <IconButton size="small" onClick={() => handleRandomize(entry.date)} title="Random meal">
                        <RestartAltIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ) : (
                    <Box
                      onClick={() => handleStartEdit(entry.date)}
                      sx={{
                        p: 1,
                        bgcolor: "rgba(255,255,255,0.04)",
                        borderRadius: 1,
                        minHeight: 32,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        fontSize: 13,
                        color: entry.meal ? "inherit" : "text.secondary",
                        fontStyle: entry.meal ? "normal" : "italic",
                        transition: "all 0.2s ease",
                        "&:hover": {
                          bgcolor: "rgba(255,255,255,0.08)",
                        },
                      }}
                    >
                      {entry.meal || "Click to add meal"}
                    </Box>
                  )}

                  {entry.editing && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleEndEdit(entry.date)}
                      sx={{ textTransform: "none", borderRadius: 1 }}
                    >
                      Done
                    </Button>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}