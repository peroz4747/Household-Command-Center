// Klima prek MELCloud Home (Mitsubishi Electric). API je neuraden: enak kot ga uporablja mobilna aplikacija.
// Prijava: OAuth 2.0 PKCE prek IdentityServerja in AWS Cognita. Žetoni so v data/melcloud.json.
// Oblika API-ja po projektu github.com/andrew-blake/melcloudhome.
import { createHash, randomBytes } from "node:crypto";
import storage from "./storage";
import { CLIMATE_MODES, type ClimateMode } from "./climateModes";

export { CLIMATE_MODES, type ClimateMode };
export type ClimateStatus = {
  name: string;
  power: boolean;
  mode: ClimateMode;
  setTemperature: number | null;
  roomTemperature: number | null;
  error: boolean;
  minTemperature: number;
  maxTemperature: number;
};
export type ClimateCommand = { power?: boolean; mode?: ClimateMode; temperature?: number };
export class ClimateError extends Error {}

const AUTH = "https://auth.melcloudhome.com";
const API = "https://mobile.bff.melcloudhome.com";
const CLIENT_ID = "homemobile";
const REDIRECT_URI = "melcloudhome://";
const SCOPES = "openid profile email offline_access IdentityServerApi";
const UA = "MonitorAndControl.App.Mobile/52 CFNetwork/3860.400.51 Darwin/25.3.0";
const BROWSER_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76";
const CACHE_MS = 60_000;
// Ponavljanje neuspele prijave bi lahko zaklenilo račun.
const LOGIN_RETRY_MS = 15 * 60_000;

type Tokens = { accessToken?: string; refreshToken?: string; expiresAt?: number };

export const melcloudConfigured = () => Boolean(process.env.MELCLOUD_EMAIL && process.env.MELCLOUD_PASSWORD);

const b64url = (b: Buffer) => b.toString("base64url");
const form = (data: Record<string, string>) => new URLSearchParams(data).toString();
const FORM_HEADERS = { "Content-Type": "application/x-www-form-urlencoded" };

async function readTokens(): Promise<Tokens> {
  const raw = await storage.readItems("melcloud");
  return raw && !Array.isArray(raw) ? (raw as Tokens) : {};
}

async function saveTokens(data: any, previousRefresh?: string): Promise<Tokens> {
  const tokens: Tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? previousRefresh,
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
  };
  await storage.writeItems("melcloud", tokens);
  return tokens;
}

/** HTTP z ročnimi preusmeritvami in piškotki; preusmeritev na melcloudhome:// vrne kodo. */
function browser() {
  const jar = new Map<string, Map<string, string>>();
  return async function go(start: string, init: RequestInit = {}): Promise<{ res: Response; url: string; code: string | null }> {
    let url = start;
    let current = init;
    for (let hop = 0; hop < 12; hop += 1) {
      const host = new URL(url).hostname;
      const cookies = jar.get(host) ?? new Map<string, string>();
      jar.set(host, cookies);
      const cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
      const res = await fetch(url, {
        ...current,
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: { "User-Agent": UA, ...(current.headers ?? {}), ...(cookie ? { Cookie: cookie } : {}) },
      });
      for (const line of res.headers.getSetCookie()) {
        const [pair] = line.split(";");
        const eq = pair.indexOf("=");
        if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
      const location = res.headers.get("location");
      if (res.status < 300 || res.status >= 400 || !location) return { res, url, code: null };
      if (location.startsWith("melcloudhome:")) return { res, url, code: location.match(/code=([^&]+)/)?.[1] ?? null };
      url = new URL(location, url).toString();
      current = { headers: current.headers };
    }
    throw new ClimateError("login");
  };
}

async function login(): Promise<Tokens> {
  const go = browser();
  const verifier = b64url(randomBytes(32));
  const par = await go(`${AUTH}/connect/par`, {
    method: "POST",
    headers: FORM_HEADERS,
    body: form({
      response_type: "code",
      state: b64url(randomBytes(16)),
      code_challenge: b64url(createHash("sha256").update(verifier).digest()),
      code_challenge_method: "S256",
      client_id: CLIENT_ID,
      scope: SCOPES,
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (par.res.status !== 201) throw new ClimateError("login");
  const { request_uri: requestUri } = (await par.res.json()) as { request_uri: string };

  const page = await go(`${AUTH}/connect/authorize?client_id=${CLIENT_ID}&request_uri=${encodeURIComponent(requestUri)}`);
  let code = page.code;
  let body = code ? "" : await page.res.text();
  if (!code && new URL(page.url).hostname.endsWith(".amazoncognito.com")) {
    const csrf = body.match(/name="_csrf"[^>]*value="([^"]+)"/)?.[1] ?? body.match(/value="([^"]+)"[^>]*name="_csrf"/)?.[1];
    if (!csrf) throw new ClimateError("login");
    const submitted = await go(page.url, {
      method: "POST",
      headers: { ...FORM_HEADERS, "User-Agent": BROWSER_UA, Origin: new URL(page.url).origin, Referer: page.url },
      body: form({ _csrf: csrf, username: process.env.MELCLOUD_EMAIL!, password: process.env.MELCLOUD_PASSWORD!, cognitoAsfData: "" }),
    });
    code = submitted.code;
    if (!code && new URL(submitted.url).hostname.endsWith(".amazoncognito.com")) throw new ClimateError("credentials");
    body = code ? "" : await submitted.res.text();
  }
  if (!code) {
    const query = body.match(/\/connect\/authorize\/callback\?([^"' ]+)/)?.[1]?.replace(/&amp;/g, "&");
    code = query ? (await go(`${AUTH}/connect/authorize/callback?${query}`)).code : null;
  }
  if (!code) throw new ClimateError("login");

  const token = await go(`${AUTH}/connect/token`, {
    method: "POST",
    headers: FORM_HEADERS,
    body: form({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: verifier, client_id: CLIENT_ID }),
  });
  if (token.res.status !== 200) throw new ClimateError("login");
  return saveTokens(await token.res.json());
}

let loginBlockedUntil = 0;

async function freshLogin(): Promise<Tokens> {
  if (Date.now() < loginBlockedUntil) throw new ClimateError("login-wait");
  try {
    return await login();
  } catch (e) {
    loginBlockedUntil = Date.now() + LOGIN_RETRY_MS;
    throw e instanceof ClimateError ? e : new ClimateError("login");
  }
}

async function accessToken(force = false): Promise<string> {
  const tokens = await readTokens();
  if (!force && tokens.accessToken && (tokens.expiresAt ?? 0) - 60_000 > Date.now()) return tokens.accessToken;
  if (tokens.refreshToken) {
    const res = await fetch(`${AUTH}/connect/token`, {
      method: "POST",
      headers: { ...FORM_HEADERS, "User-Agent": UA },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      body: form({ grant_type: "refresh_token", refresh_token: tokens.refreshToken, client_id: CLIENT_ID }),
    }).catch(() => null);
    if (res?.status === 200) return (await saveTokens(await res.json(), tokens.refreshToken)).accessToken!;
    if (res === null || res.status >= 500) throw new ClimateError("unavailable");
  }
  return (await freshLogin()).accessToken!;
}

async function api(method: string, path: string, body?: unknown): Promise<Response> {
  const send = async (token: string) =>
    fetch(`${API}${path}`, {
      method,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": UA, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  let res = await send(await accessToken());
  if (res.status === 401) res = await send(await accessToken(true));
  if (!res.ok) throw new ClimateError("unavailable");
  return res;
}

let cache: { at: number; id: string; status: ClimateStatus } | null = null;

async function load(): Promise<{ id: string; status: ClimateStatus }> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const context: any = await (await api("GET", "/context")).json();
  const unit = (context.buildings ?? []).flatMap((b: any) => b.airToAirUnits ?? [])[0];
  if (!unit) throw new ClimateError("no-unit");
  const settings = Object.fromEntries((unit.settings ?? []).map((s: any) => [s.name, s.value]));
  const number = (v: unknown) => {
    const n = Number.parseFloat(String(v));
    return Number.isNaN(n) ? null : n;
  };
  const mode = (CLIMATE_MODES as readonly string[]).includes(settings.OperationMode) ? (settings.OperationMode as ClimateMode) : "Automatic";
  const status: ClimateStatus = {
    name: String(unit.givenDisplayName ?? "Klima").trim(),
    power: String(settings.Power).toLowerCase() === "true",
    mode,
    setTemperature: number(settings.SetTemperature),
    roomTemperature: number(settings.RoomTemperature),
    error: String(settings.IsInError).toLowerCase() === "true",
    minTemperature: mode === "Heat" ? Number(unit.capabilities?.minTempHeat ?? 10) : Number(unit.capabilities?.minTempCoolDry ?? 16),
    maxTemperature: Number(unit.capabilities?.maxTempHeat ?? 31),
  };
  cache = { at: Date.now(), id: String(unit.id), status };
  return cache;
}

export async function getClimate(): Promise<ClimateStatus> {
  return (await load()).status;
}

export async function setClimate(command: ClimateCommand): Promise<ClimateStatus> {
  const { id, status } = await load();
  await api("PUT", `/monitor/ataunit/${encodeURIComponent(id)}`, {
    power: command.power ?? null,
    operationMode: command.mode ?? null,
    setFanSpeed: null,
    vaneHorizontalDirection: null,
    vaneVerticalDirection: null,
    setTemperature: command.temperature ?? null,
    temperatureIncrementOverride: null,
    inStandbyMode: null,
  });
  // Oblak stanje posodobi z zamikom, zato do naslednjega branja kažemo poslano.
  const next: ClimateStatus = {
    ...status,
    power: command.power ?? status.power,
    mode: command.mode ?? status.mode,
    setTemperature: command.temperature ?? status.setTemperature,
  };
  cache = { at: Date.now(), id, status: next };
  return next;
}
