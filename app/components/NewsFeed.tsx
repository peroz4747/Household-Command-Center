"use client";
import React, { useEffect, useState } from "react";
import { Box, Typography, Link, List, ListItem, IconButton } from "@mui/material";
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';

type NewsItem = { title: string; link?: string; pubDate?: string; image?: string };

export default function NewsFeed() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);

  const [visibleCount, setVisibleCount] = useState(Math.min(5, items.length || 1));
  const [paused, setPaused] = useState(false);
  const pauseTimerRef = React.useRef<number | null>(null);

  const pages = Math.max(1, Math.ceil(items.length / visibleCount));
  const pagesArr = Array.from({ length: pages }).map((_, p) => items.slice(p * visibleCount, p * visibleCount + visibleCount));

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      let v = 1;
      if (w >= 1536) v = 5;
      else if (w >= 1200) v = 4;
      else if (w >= 900) v = 3;
      else if (w >= 600) v = 2;
      else v = 1;
      setVisibleCount(Math.min(v, Math.max(1, items.length)));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [items.length]);

  useEffect(() => {
    if (!items || items.length === 0) return;
    if (paused) return;
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % pages);
    }, 5000);
    return () => window.clearInterval(t);
  }, [pages, paused]);

  useEffect(() => {
    return () => {
      if (pauseTimerRef.current) window.clearTimeout(pauseTimerRef.current);
    };
  }, []);

  // clamp index when visibleCount or items length changes
  useEffect(() => {
    const max = Math.max(0, pages - 1);
    setIndex((i) => Math.min(i, max));
  }, [pages]);

  const pauseAuto = () => {
    setPaused(true);
    if (pauseTimerRef.current) window.clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = window.setTimeout(() => {
      setPaused(false);
      pauseTimerRef.current = null;
    }, 10000);
  };

  useEffect(() => {
    let mounted = true;
    fetch("/api/news")
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return;
        if (Array.isArray(data)) setItems(data.slice(0, 20));
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);
  

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
        <Typography variant="h6">Todays news</Typography>
        <Typography variant="caption" color="text.secondary">source: 24ur</Typography>
      </Box>

      {loading ? (
        <Typography variant="body2">Nalaganje...</Typography>
      ) : items.length === 0 ? (
        <Typography variant="body2">Ni novic za danes.</Typography>
      ) : (
        <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: 1 }}>
          <Box
            sx={{
              display: 'flex',
              transition: 'transform 400ms ease',
              width: `${pages * 100}%`,
              transform: `translateX(-${index * (100 / pages)}%)`
            }}
          >
            {pagesArr.map((pageItems, p) => (
              <Box key={p} sx={{ flex: `0 0 ${100 / pages}%`, display: 'flex' }}>
                {pageItems.map((it, i) => (
                  <Box key={i} sx={{ flex: `0 0 ${100 / visibleCount}%`, height: { xs: 220, md: 260 }, p: 1, boxSizing: 'border-box' }}>
                    <Box
                      component="a"
                      href={it.link || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: 2,
                        overflow: 'hidden',
                        bgcolor: 'background.paper',
                        boxShadow: 2,
                        textDecoration: 'none',
                        color: 'inherit'
                      }}
                    >
                      {it.image ? (
                        <Box component="img" src={it.image} alt={it.title} sx={{ width: '100%', height: { xs: 110, md: 140 }, objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <Box sx={{ width: '100%', height: { xs: 110, md: 140 }, backgroundColor: 'grey.800' }} />
                      )}

                      <Box sx={{ p: 1.25, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{it.title}</Typography>
                        {it.pubDate ? (
                          <Typography variant="caption" color="text.secondary">
                            {new Date(it.pubDate).toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        ) : null}
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>

          <IconButton
            size="small"
            onClick={() => {
              pauseAuto();
              setIndex((i) => (i - 1 + pages) % pages);
            }}
            sx={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'common.white', bgcolor: 'rgba(0,0,0,0.3)' }}
          >
            <ArrowBackIosIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => {
              pauseAuto();
              setIndex((i) => (i + 1) % pages);
            }}
            sx={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'common.white', bgcolor: 'rgba(0,0,0,0.3)' }}
          >
            <ArrowForwardIosIcon fontSize="small" />
          </IconButton>

          {/* dots */}
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 1 }}>
            {Array.from({ length: pages }).map((_, p) => (
              <Box
                key={p}
                onClick={() => { pauseAuto(); setIndex(p); }}
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  bgcolor: p === index ? 'primary.main' : 'rgba(255,255,255,0.25)',
                  cursor: 'pointer'
                }}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
