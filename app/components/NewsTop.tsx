"use client";

import { useRef, useState } from "react";
import { Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Link, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useI18n } from "../i18n";
import type { NewsWindow, TopItem } from "../../lib/newsTop";
import { NEWS_TOPICS, type NewsTopic } from "../../lib/newsTopics";

/** Gumb in okno s top novicami ali novicami o izbranih temah. */
export default function NewsTop() {
  const { t, locale } = useI18n();
  const tr = t as unknown as (key: string, vars?: Record<string, string | number>) => string;
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<NewsWindow>("7d");
  const [topics, setTopics] = useState<NewsTopic[]>([]);
  const [data, setData] = useState<{ items: TopItem[]; since: number | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const requestId = useRef(0);

  const load = (nextRange: NewsWindow, nextTopics: NewsTopic[]) => {
    setRange(nextRange);
    setTopics(nextTopics);
    setData(null);
    setFailed(false);
    const id = ++requestId.current;
    const q = new URLSearchParams({ window: nextRange });
    if (nextTopics.length) q.set("topics", nextTopics.join(","));
    fetch(`/api/news/top?${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => id === requestId.current && setData(d))
      .catch(() => id === requestId.current && setFailed(true));
  };

  const toggleTopic = (topic: NewsTopic) =>
    load(range, topics.includes(topic) ? topics.filter((x) => x !== topic) : [...topics, topic]);

  const filtered = topics.length > 0;

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        onClick={() => {
          setOpen(true);
          load(range, topics);
        }}
        sx={{ textTransform: "none", borderRadius: 2 }}
      >
        {tr("news.top")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {tr("news.topTitle")}
          <IconButton size="small" onClick={() => setOpen(false)} aria-label={tr("common.close")}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <ToggleButtonGroup exclusive fullWidth size="small" color="primary" value={range} onChange={(_, v) => v && load(v, topics)} sx={{ mb: 1.5 }}>
            <ToggleButton value="24h">{tr("news.window24h")}</ToggleButton>
            <ToggleButton value="7d">{tr("news.window7d")}</ToggleButton>
          </ToggleButtonGroup>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
            {NEWS_TOPICS.map((topic) => (
              <Chip
                key={topic}
                label={tr(`news.topic.${topic}`)}
                color={topics.includes(topic) ? "primary" : "default"}
                variant={topics.includes(topic) ? "filled" : "outlined"}
                onClick={() => toggleTopic(topic)}
                aria-pressed={topics.includes(topic)}
              />
            ))}
          </Box>

          {!data && !failed && <CircularProgress size={24} />}
          {failed && <Typography color="error">{tr("news.none")}</Typography>}
          {data && (
            <>
              {data.items.length === 0 && <Typography color="text.secondary">{tr(filtered ? "news.topicEmpty" : "news.topEmpty")}</Typography>}
              <Box component={filtered ? "ul" : "ol"} sx={{ m: 0, pl: 3, display: "grid", gap: 1.5 }}>
                {data.items.map((a) => (
                  <li key={a.url}>
                    <Link href={a.url} target="_blank" rel="noopener noreferrer" underline="hover" color="text.primary" sx={{ fontWeight: 600 }}>
                      {a.title}
                    </Link>
                    {a.lead && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                        {a.lead}
                      </Typography>
                    )}
                    <Box sx={{ display: "flex", gap: 0.75, alignItems: "center", flexWrap: "wrap", mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {a.category}
                        {a.published ? ` · ${new Date(a.published).toLocaleDateString(locale, { day: "numeric", month: "numeric" })}` : ""}
                      </Typography>
                      {a.alsoOn.length > 0 && <Chip size="small" variant="outlined" label={tr("news.alsoOn", { list: a.alsoOn.join(", ") })} sx={{ height: 20, fontSize: 11 }} />}
                      {a.related > 0 && <Chip size="small" variant="outlined" label={tr("news.related", { n: a.related })} sx={{ height: 20, fontSize: 11 }} />}
                    </Box>
                  </li>
                ))}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
                {filtered ? tr("news.topicBasis") : data.since ? tr("news.topBasis", { date: new Date(data.since).toLocaleDateString(locale) }) : ""}
              </Typography>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
