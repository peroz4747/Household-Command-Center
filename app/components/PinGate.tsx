"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { useI18n } from "../i18n";

/** Ko strežnik zahteva PIN (401 {error:"pin"}), vpraša zanj in zahtevo ponovi; komponente za to ne vedo. */
export default function PinGate() {
  const { t } = useI18n();
  const tr = t as unknown as (key: string) => string;
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ promise: Promise<boolean>; resolve: (ok: boolean) => void } | null>(null);
  const originalFetch = useRef<typeof window.fetch | null>(null);

  useEffect(() => {
    const original = window.fetch.bind(window);
    originalFetch.current = original;
    const ask = () => {
      if (!pending.current) {
        let resolve = (_: boolean) => {};
        const promise = new Promise<boolean>((r) => (resolve = r));
        pending.current = { promise, resolve };
        setPin("");
        setError(null);
        setOpen(true);
      }
      return pending.current.promise;
    };
    window.fetch = async (input, init) => {
      const res = await original(input, init);
      if (res.status !== 401) return res;
      const body = await res.clone().json().catch(() => null);
      if (body?.error !== "pin") return res;
      return (await ask()) ? original(input, init) : res;
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  const finish = (ok: boolean) => {
    setOpen(false);
    pending.current?.resolve(ok);
    pending.current = null;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await originalFetch.current!("/api/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) finish(true);
      else {
        setPin("");
        setError(tr(res.status === 429 ? "pin.blocked" : "pin.wrong"));
      }
    } catch {
      setError(tr("pin.wrong"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => finish(false)} maxWidth="xs" fullWidth>
      <form onSubmit={(e) => void submit(e)}>
        <DialogTitle>{tr("pin.title")}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField autoFocus fullWidth type="password" label={tr("pin.label")} value={pin} onChange={(e) => setPin(e.target.value)} slotProps={{ htmlInput: { inputMode: "numeric", autoComplete: "off" } }} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => finish(false)}>{tr("common.cancel")}</Button>
          <Button type="submit" variant="contained" disabled={busy || !pin}>
            {tr("pin.confirm")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
