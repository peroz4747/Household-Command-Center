"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Box, Card, CardContent, Chip, IconButton, InputBase, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import CasinoOutlinedIcon from "@mui/icons-material/CasinoOutlined";
import RestaurantIcon from "@mui/icons-material/Restaurant";

type MealItem = { id?: string; date: string; meal: string };

type Day = {
  date: string; // YYYY-MM-DD v lokalnem času
  weekday: string;
  dayNumber: number;
  month: string;
  isToday: boolean;
  isPast: boolean;
};

const mealIdeas = [
  // Vegansko
  "Vegan Burger with Sweet Potato Fries",
  "Vegan Pizza",
  "Chickpea Curry with Naan",
  "Vegan Chili sin Carne",
  "Crispy Tofu Pad Thai",
  "Lentil Bolognese",
  "Mushroom Stroganoff",
  "Black Bean Tacos with Guacamole",
  "Falafel Wrap with Hummus",
  "Vegan Ramen",
  "Teriyaki Tofu Rice Bowl",
  "Stuffed Peppers with Rice & Beans",
  "Creamy Vegan Mushroom Risotto",
  "Thai Red Curry with Vegetables",
  "Gnocchi with Pesto & Cherry Tomatoes",
  "Vegan Lasagne",
  "Cauliflower Buffalo Wings",
  "Sweet Potato & Black Bean Burrito",
  "Buddha Bowl with Peanut Sauce",
  "Vegan Mac & Cheese",
  // Ostalo
  "Pasta Carbonara",
  "Fish Tacos",
  "Beef Stir Fry",
  "Salmon with Lemon",
  "Homemade Pizza",
  "Beef Meatballs",
  "Shakshuka",
  "Chicken Fajitas",
  "Butter Chicken",
  "Smash Burgers",
];

// Lokalni datum (toISOString bi po polnoči do 1/2 h zjutraj vrnil včerajšnji dan).
const toDateString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Ta in naslednji teden, od ponedeljka do nedelje. */
function getTwoWeeks(now = new Date()): Day[][] {
  const today = toDateString(now);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const weeks: Day[][] = [[], []];
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const date = toDateString(d);
    weeks[Math.floor(i / 7)].push({
      date,
      weekday: d.toLocaleDateString("en-GB", { weekday: "short" }),
      dayNumber: d.getDate(),
      month: d.toLocaleDateString("en-GB", { month: "short" }),
      isToday: date === today,
      isPast: date < today,
    });
  }
  return weeks;
}

async function request(method: "POST" | "PUT" | "DELETE", body: object) {
  const res = await fetch("/api/meals", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Unable to save meal");
  return data;
}

export default function MealPlanner() {
  const theme = useTheme();
  const [weeks, setWeeks] = useState<Day[][] | null>(null);
  const [meals, setMeals] = useState<Map<string, MealItem>>(new Map());
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Prepreči dvojno shranjevanje (Enter sproži save, nato še blur).
  const skipBlur = useRef(false);

  useEffect(() => {
    setWeeks(getTwoWeeks());
    fetch("/api/meals")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setMeals(new Map((data.items ?? []).map((m: MealItem) => [m.date, m])));
      })
      .catch(() => setError("Unable to load meal planner data."));
  }, []);

  const save = async (date: string, value: string) => {
    const meal = value.trim();
    const existing = meals.get(date);
    if ((existing?.meal ?? "") === meal) return;
    try {
      let saved: MealItem | null = null;
      if (!meal) {
        if (existing?.id) await request("DELETE", { id: existing.id });
      } else if (existing?.id) {
        saved = await request("PUT", { id: existing.id, date, meal });
      } else {
        saved = await request("POST", { date, meal });
      }
      setMeals((current) => {
        const next = new Map(current);
        if (saved) next.set(date, saved);
        else next.delete(date);
        return next;
      });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const startEdit = (date: string) => {
    setDraft(meals.get(date)?.meal ?? "");
    setEditing(date);
  };

  const finishEdit = (date: string, value: string) => {
    setEditing(null);
    void save(date, value);
  };

  const onKeyDown = (date: string) => (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      skipBlur.current = true;
      finishEdit(date, draft);
    } else if (e.key === "Escape") {
      skipBlur.current = true;
      setEditing(null);
    }
  };

  const randomize = (date: string) => {
    const current = meals.get(date)?.meal;
    const options = mealIdeas.filter((m) => m !== current);
    const pick = options[Math.floor(Math.random() * options.length)];
    skipBlur.current = true;
    setEditing(null);
    void save(date, pick);
  };

  const planned = weeks ? weeks.flat().filter((d) => !d.isPast && meals.get(d.date)?.meal).length : 0;
  const upcoming = weeks ? weeks.flat().filter((d) => !d.isPast).length : 0;
  const range = weeks
    ? `${weeks[0][0].dayNumber} ${weeks[0][0].month} – ${weeks[1][6].dayNumber} ${weeks[1][6].month}`
    : "";

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2, mb: 2.5 }}>
          <Box>
            <Typography variant="subtitle2" color="secondary">
              Meal planner
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              Dinners
              <Typography component="span" color="text.secondary" sx={{ ml: 1, fontSize: 14, fontWeight: 500 }}>
                {range}
              </Typography>
            </Typography>
          </Box>
          {weeks && (
            <Chip
              icon={<RestaurantIcon />}
              label={`${planned}/${upcoming} planned`}
              size="small"
              variant="outlined"
              color={planned === upcoming ? "secondary" : "default"}
            />
          )}
        </Box>

        {error && (
          <Typography variant="caption" color="error" sx={{ display: "block", mb: 1.5 }}>
            {error}
          </Typography>
        )}

        <Box sx={{ overflowX: "auto", mx: { xs: -2, md: 0 }, px: { xs: 2, md: 0 } }}>
          <Box sx={{ minWidth: 640, display: "grid", gap: 1.5 }}>
            {(weeks ?? [[], []]).map((week, w) => (
              <Box key={w}>
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ display: "block", lineHeight: 1, mb: 0.75, letterSpacing: 1.2 }}
                >
                  {w === 0 ? "This week" : "Next week"}
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
                  {!weeks
                    ? Array.from({ length: 7 }).map((_, i) => (
                        <Box key={i} sx={{ height: 104, borderRadius: 3, bgcolor: "rgba(148,163,184,0.05)" }} />
                      ))
                    : week.map((day) => {
                        const meal = meals.get(day.date)?.meal;
                        const isEditing = editing === day.date;
                        const accent = theme.palette.primary.main;
                        return (
                          <Box
                            key={day.date}
                            onClick={() => !isEditing && startEdit(day.date)}
                            sx={{
                              position: "relative",
                              minHeight: 104,
                              px: 1.5,
                              pt: 1.5,
                              pb: 1.25,
                              borderRadius: 3,
                              cursor: isEditing ? "default" : "pointer",
                              display: "flex",
                              flexDirection: "column",
                              gap: 0.75,
                              opacity: day.isPast && !isEditing ? 0.45 : 1,
                              bgcolor: day.isToday ? alpha(accent, 0.12) : "rgba(148,163,184,0.06)",
                              border: "1px solid",
                              borderColor: isEditing
                                ? accent
                                : day.isToday
                                  ? alpha(accent, 0.6)
                                  : "rgba(148,163,184,0.12)",
                              transition: "background-color .15s, border-color .15s, opacity .15s",
                              "&:hover": {
                                opacity: 1,
                                bgcolor: day.isToday ? alpha(accent, 0.18) : "rgba(148,163,184,0.11)",
                              },
                              "&:hover .meal-add": { opacity: 1 },
                            }}
                          >
                            <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 0.75 }}>
                              <Typography
                                sx={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  letterSpacing: 0.8,
                                  color: day.isToday ? accent : "text.secondary",
                                }}
                              >
                                {day.weekday}
                              </Typography>
                              <Typography sx={{ fontSize: 15, fontWeight: 700, color: day.isToday ? accent : "text.primary" }}>
                                {day.dayNumber}
                              </Typography>
                            </Box>
                            {day.isToday && (
                              <Typography
                                sx={{ mt: -0.75, textAlign: "center", fontSize: 10, fontWeight: 700, color: accent, letterSpacing: 0.8 }}
                              >
                                TODAY
                              </Typography>
                            )}

                            {isEditing ? (
                              <Box sx={{ display: "flex", flexDirection: "column", flex: 1, gap: 0.5 }}>
                                <InputBase
                                  autoFocus
                                  multiline
                                  maxRows={3}
                                  value={draft}
                                  placeholder="Dinner…"
                                  onChange={(e) => setDraft(e.target.value)}
                                  onKeyDown={onKeyDown(day.date)}
                                  onFocus={() => (skipBlur.current = false)}
                                  onBlur={() => {
                                    if (skipBlur.current) return;
                                    finishEdit(day.date, draft);
                                  }}
                                  inputProps={{ style: { textAlign: "center" } }}
                                  sx={{ flex: 1, fontSize: 13, lineHeight: 1.35, p: 0 }}
                                />
                                <Tooltip title="Surprise me">
                                  <IconButton
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => randomize(day.date)}
                                    aria-label="Random meal"
                                    sx={{
                                      alignSelf: "center",
                                      width: 36,
                                      height: 36,
                                      color: accent,
                                      bgcolor: alpha(accent, 0.12),
                                      "&:hover": { bgcolor: alpha(accent, 0.24) },
                                    }}
                                  >
                                    <CasinoOutlinedIcon sx={{ fontSize: 22 }} />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            ) : meal ? (
                              <Typography
                                sx={{
                                  fontSize: 13,
                                  fontWeight: 500,
                                  lineHeight: 1.35,
                                  textAlign: "center",
                                  wordBreak: "break-word",
                                  display: "-webkit-box",
                                  WebkitLineClamp: 3,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }}
                              >
                                {meal}
                              </Typography>
                            ) : (
                              <Box
                                className="meal-add"
                                sx={{
                                  flex: 1,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "text.secondary",
                                  opacity: day.isToday ? 0.8 : 0.35,
                                  transition: "opacity .15s",
                                }}
                              >
                                <AddIcon fontSize="small" />
                              </Box>
                            )}
                          </Box>
                        );
                      })}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
