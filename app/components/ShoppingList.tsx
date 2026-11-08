"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Box, Button, Card, CardContent, Checkbox, FormControlLabel, TextField, Typography } from "@mui/material";
import { useI18n } from "../i18n";

type Item = { id: string; text: string; done: boolean };

const dayKey = (d: Date) => d.toLocaleDateString("en-CA");

/** Nakupovalni seznam; obroke iz jedilnika je mogoče dodati z enim klikom. */
export default function ShoppingList() {
  const { t } = useI18n();
  const tr = t as unknown as (key: string) => string;
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const call = (method: string, body?: unknown) =>
    fetch("/api/shopping", {
      method,
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setNote(tr("shopping.error")));

  useEffect(() => {
    void call("GET");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setText("");
    void call("POST", { texts: [text] });
  };

  const addMeals = async () => {
    setNote(null);
    const data = await fetch("/api/meals", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    const from = dayKey(new Date());
    const to = dayKey(new Date(Date.now() + 6 * 86_400_000));
    const meals: string[] = (data?.items ?? []).filter((m: any) => m.date >= from && m.date <= to).map((m: any) => m.meal);
    if (meals.length === 0) setNote(tr("shopping.noMeals"));
    else void call("POST", { texts: meals });
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {tr("shopping.title")}
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button size="small" onClick={() => void addMeals()} sx={{ textTransform: "none" }}>
              {tr("shopping.addMeals")}
            </Button>
            <Button size="small" color="inherit" disabled={!items.some((i) => i.done)} onClick={() => void call("DELETE")} sx={{ textTransform: "none" }}>
              {tr("shopping.clear")}
            </Button>
          </Box>
        </Box>
        <Box component="form" onSubmit={add} sx={{ display: "flex", gap: 1, mt: 1.5 }}>
          <TextField size="small" fullWidth placeholder={tr("shopping.placeholder")} value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" variant="contained" disabled={!text.trim()}>
            {tr("common.add")}
          </Button>
        </Box>
        {note && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {note}
          </Typography>
        )}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" }, mt: 1 }}>
          {items.map((item) => (
            <FormControlLabel
              key={item.id}
              control={<Checkbox size="small" checked={item.done} onChange={(e) => void call("PUT", { id: item.id, done: e.target.checked })} />}
              label={item.text}
              sx={{ "& .MuiFormControlLabel-label": { textDecoration: item.done ? "line-through" : "none", color: item.done ? "text.secondary" : "text.primary" } }}
            />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
