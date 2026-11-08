"use client";

import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Dialog,
  IconButton,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useI18n } from "../i18n";
import { PICK_GENRES, type Pick, type PickProvider, type PickType } from "../../lib/tvPicks";

const APP_LABEL = { netflix: "Netflix", hbomax: "HBO Max" } as const;

/** Predlogi filmov/serij: izbira vrste, žanra in ponudnika, klik na naslov ga odpre na TV-ju. */
export default function TvPicks({ open, onClose, tvOn }: { open: boolean; onClose: () => void; tvOn: boolean }) {
  const { t } = useI18n();
  const tr = t as (k: string) => string;
  const [type, setType] = useState<PickType>("movie");
  const [provider, setProvider] = useState<PickProvider>("all");
  const [genre, setGenre] = useState("");
  const [items, setItems] = useState<Pick[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const search = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const q = new URLSearchParams({ type, provider, ...(genre ? { genre } : {}) });
      const res = await fetch(`/api/tv/picks?${q}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setItems(((await res.json()) as { items: Pick[] }).items);
    } catch {
      setItems(null);
      setMessage({ ok: false, text: tr("picks.loadError") });
    } finally {
      setLoading(false);
    }
  };

  const launch = async (item: Pick) => {
    setLaunching(item.id);
    setMessage(null);
    try {
      const res = await fetch("/api/tv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "title", url: item.url }),
      });
      if (!res.ok) throw new Error();
      setMessage({ ok: true, text: `${tr("picks.opened")}: ${item.title}` });
    } catch {
      setMessage({ ok: false, text: tr("tv.err.unreachable") });
    } finally {
      setLaunching(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { borderRadius: "20px", p: 2.5, m: 2, background: "linear-gradient(180deg, #111c2e 0%, #0a1220 100%)" } } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {tr("picks.title")}
        </Typography>
        <IconButton onClick={onClose} size="small" aria-label={tr("meals.close")}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ display: "grid", gap: 1.5 }}>
        <ToggleButtonGroup exclusive fullWidth size="small" color="primary" value={type} onChange={(_, v) => v && setType(v)}>
          <ToggleButton value="movie">{tr("picks.movie")}</ToggleButton>
          <ToggleButton value="show">{tr("picks.show")}</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup exclusive fullWidth size="small" color="primary" value={provider} onChange={(_, v) => v && setProvider(v)}>
          <ToggleButton value="all">{tr("picks.providerAll")}</ToggleButton>
          <ToggleButton value="netflix">Netflix</ToggleButton>
          <ToggleButton value="hbo">HBO Max</ToggleButton>
        </ToggleButtonGroup>
        <TextField select size="small" label={tr("picks.genre")} value={genre} onChange={(e) => setGenre(e.target.value)}>
          <MenuItem value="">{tr("picks.genreAny")}</MenuItem>
          {PICK_GENRES.map((g) => (
            <MenuItem key={g} value={g}>
              {tr(`picks.genre.${g}`)}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" onClick={() => void search()} disabled={loading}>
          {items ? tr("picks.again") : tr("picks.find")}
        </Button>
      </Box>

      {message && (
        <Alert severity={message.ok ? "success" : "error"} sx={{ mt: 2 }}>
          {message.text}
        </Alert>
      )}
      {!tvOn && items && items.length > 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          {tr("picks.tvOff")}
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", my: 3 }}>
          <CircularProgress />
        </Box>
      )}
      {!loading && items?.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 2, textAlign: "center" }}>
          {tr("picks.none")}
        </Typography>
      )}
      {!loading && items && items.length > 0 && (
        <Box sx={{ display: "grid", gap: 1, mt: 2, overflowY: "auto", maxHeight: "50vh" }}>
          {items.map((item) => (
            <ButtonBase
              key={item.id}
              disabled={!tvOn || launching !== null}
              onClick={() => void launch(item)}
              sx={{ display: "flex", gap: 1.5, p: 1, borderRadius: 2, justifyContent: "flex-start", textAlign: "left", bgcolor: "rgba(148,163,184,0.08)", "&:hover": { bgcolor: "rgba(148,163,184,0.16)" } }}
            >
              {item.poster && <Box component="img" src={item.poster} alt="" loading="lazy" sx={{ width: 54, height: 80, objectFit: "cover", borderRadius: 1, flexShrink: 0 }} />}
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontWeight: 700 }} noWrap>
                  {item.title}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center", my: 0.25 }}>
                  <Typography variant="caption" color="text.secondary">
                    {item.year ?? ""} {item.imdb ? `· IMDb ${item.imdb.toFixed(1)}` : ""}
                  </Typography>
                  <Chip size="small" label={APP_LABEL[item.app]} sx={{ height: 18, fontSize: 11 }} />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {item.description}
                </Typography>
              </Box>
              {launching === item.id && <CircularProgress size={20} />}
            </ButtonBase>
          ))}
        </Box>
      )}
    </Dialog>
  );
}
