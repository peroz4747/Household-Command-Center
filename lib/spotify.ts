// Predvajanje playliste na TV-ju prek uradnega Spotify Web API-ja (zahteva Premium).
// TV-ju samemu playliste ni mogoče poslati. Žetoni so v data/spotify.json.
import fs from "node:fs/promises";
import storage from "./storage";

type Tokens = { accessToken?: string; refreshToken?: string; expiresAt?: number };
const API = "https://api.spotify.com/v1";
const SCOPES = "user-modify-playback-state user-read-playback-state";
const redirectUri = () => process.env.SPOTIFY_REDIRECT_URI ?? "https://dashboard.home/api/spotify/callback";
const basic = () => Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");

export const spotifyConfigured = () => Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);

export function spotifyAuthUrl(state: string): string {
  const q = new URLSearchParams({ response_type: "code", client_id: process.env.SPOTIFY_CLIENT_ID ?? "", scope: SCOPES, redirect_uri: redirectUri(), state });
  return `https://accounts.spotify.com/authorize?${q}`;
}

async function readTokens(): Promise<Tokens> {
  const raw = await storage.readItems("spotify");
  return raw && !Array.isArray(raw) ? (raw as Tokens) : {};
}

async function requestToken(params: Record<string, string>, previousRefresh?: string): Promise<Tokens> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Basic ${basic()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) throw new Error("not-connected");
  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  const tokens: Tokens = { accessToken: data.access_token, refreshToken: data.refresh_token ?? previousRefresh, expiresAt: Date.now() + data.expires_in * 1000 };
  await storage.writeItems("spotify", tokens);
  await fs.chmod("data/spotify.json", 0o600).catch(() => {});
  return tokens;
}

export async function connectSpotify(code: string): Promise<void> {
  await requestToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
}

export async function spotifyConnected(): Promise<boolean> {
  return spotifyConfigured() && Boolean((await readTokens()).refreshToken);
}

async function accessToken(): Promise<string> {
  const tokens = await readTokens();
  if (tokens.accessToken && (tokens.expiresAt ?? 0) - 60_000 > Date.now()) return tokens.accessToken;
  if (!tokens.refreshToken) throw new Error("not-connected");
  return (await requestToken({ grant_type: "refresh_token", refresh_token: tokens.refreshToken }, tokens.refreshToken)).accessToken!;
}

async function api(method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    method,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 403) throw new Error("premium");
  if (!res.ok) throw new Error("failed");
  return res;
}

/** Počaka, da se TV pojavi med napravami, nato tja prenese predvajanje in zažene playlisto na shuffle. */
export async function playPlaylistOnTv(playlist: string): Promise<void> {
  const id = playlist.match(/playlist[/:]([A-Za-z0-9]+)/)?.[1];
  if (!id) throw new Error("failed");
  type Device = { id: string; type: string };
  let tv: Device | undefined;
  for (let i = 0; i < 12 && !tv; i += 1) {
    const { devices } = (await (await api("GET", "/me/player/devices")).json()) as { devices: Device[] };
    tv = devices.find((d) => d.type.toLowerCase() === "tv");
    if (!tv) await new Promise((r) => setTimeout(r, 1500));
  }
  if (!tv) throw new Error("no-device");
  const device = encodeURIComponent(tv.id);
  await api("PUT", "/me/player", { device_ids: [tv.id], play: false });
  await api("PUT", `/me/player/shuffle?state=true&device_id=${device}`);
  await api("PUT", `/me/player/play?device_id=${device}`, { context_uri: `spotify:playlist:${id}` });
}
