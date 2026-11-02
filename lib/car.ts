// Avto: shranjeno stanje (data/car.json) + podatki iz uradnega Škoda API-ja.
// API: https://public.api.connect.skoda-auto.cz/docs (ključ iz aplikacije MyŠkoda → Manage API keys).
// Omejitev je 20 klicev na uro na VIN, zato se API kliče samo ob kliku na "Refresh" (refreshCar),
// največ vsakih MIN_REFRESH_MS; zadnji podatki se hranijo v data/car.json in se prikazujejo iz njega.
import storage from "./storage";

export type TyreSeason = "summer" | "winter";
export type Tyres = { mounted: TyreSeason; changedOn: string | null };

export type CarLive = {
  vin: string;
  name: string | null;
  licensePlate: string | null;
  renderUrl: string | null;
  locked: boolean | null; // null = neznano / ni podprto
  doorsOpen: boolean | null;
  windowsOpen: boolean | null;
  fuelPercent: number | null;
  rangeKm: number | null;
  adBlueRangeKm: number | null;
  odometerKm: number | null;
  monthKm: number | null; // izračunano iz posnetka števca na začetku meseca
  parking: {
    state: "PARKED" | "IN_MOTION" | null;
    lat: number | null;
    lon: number | null;
    address: string | null;
    // true = koordinate so zadnja znana lokacija (avto je trenutno v vožnji)
    lastKnown: boolean;
  };
  capturedAt: string | null; // kdaj je avto nazadnje poslal podatke
  fetchedAt: string; // kdaj jih je dashboard prebral iz API-ja
  keyExpiresAt: string | null;
  partErrors: string[]; // deli, ki jih API ni vrnil (npr. PARKING_POSITION_UNSUPPORTED)
};

type StoredState = {
  tyres: Tyres;
  odometerMonth?: { month: string; startKm: number };
  lastParked?: { lat: number; lon: number; address: string | null; at: string };
  live?: CarLive;
  nextFetchAt?: number; // ms; po 429 (Retry-After)
  lastAttemptAt?: number; // ms; zadnji klic na API
  lastError?: CarError | null;
};

const DEFAULT_STATE: StoredState = { tyres: { mounted: "summer", changedOn: null } };
const API_URL = process.env.SKODA_API_URL ?? "https://public.api.connect.skoda-auto.cz";
const MIN_REFRESH_MS = 30_000;
const INCLUDE = ["info", "status", "fuelStatus", "odometer", "parkingPosition"].join(",");

export const skodaConfigured = () => Boolean(process.env.SKODA_API_KEY && process.env.SKODA_VIN);

async function readState(): Promise<StoredState> {
  const raw = await storage.readItems("car");
  return raw && !Array.isArray(raw) && raw.tyres ? { ...DEFAULT_STATE, ...raw } : { ...DEFAULT_STATE };
}

async function writeState(state: StoredState) {
  await storage.writeItems("car", state);
}

export async function setTyres(tyres: Tyres): Promise<Tyres> {
  const state = await readState();
  await writeState({ ...state, tyres });
  return tyres;
}

/* ---------------- Škoda API ---------------- */

// Vrednosti API-ja: YES / NO / UNKNOWN / UNSUPPORTED …
const yesNo = (v: unknown, yes = "YES", no = "NO"): boolean | null => (v === yes ? true : v === no ? false : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Napake se shranijo kot koda (prevod je v lib/i18n, ključi car.err.*).
export type CarErrorCode =
  | "api-key-expired"
  | "api-key-not-authorized"
  | "rate-limit-exceeded"
  | "vehicle-not-accepting-requests"
  | "not-found"
  | "other";
export type CarError = { code: CarErrorCode; detail?: string };

const KNOWN_PROBLEMS: CarErrorCode[] = [
  "api-key-expired",
  "api-key-not-authorized",
  "rate-limit-exceeded",
  "vehicle-not-accepting-requests",
];

class SkodaError extends Error {
  constructor(
    public error: CarError,
    public retryAfterMs: number | null,
  ) {
    super(error.code);
  }
}

async function fetchVehicle(): Promise<{ body: any; keyExpiresAt: string | null }> {
  const vin = process.env.SKODA_VIN!;
  const res = await fetch(`${API_URL}/api/v1/vehicles/${encodeURIComponent(vin)}?include=${INCLUDE}`, {
    headers: { "X-API-Key": process.env.SKODA_API_KEY!, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    let type = "";
    let detail = "";
    try {
      const problem = await res.json();
      type = String(problem.type ?? "").split("/").pop() ?? "";
      detail = problem.detail ?? problem.title ?? "";
    } catch {
      /* ni JSON */
    }
    const retryAfter = Number(res.headers.get("Retry-After"));
    const error: CarError = (KNOWN_PROBLEMS as string[]).includes(type)
      ? { code: type as CarErrorCode }
      : res.status === 404
        ? { code: "not-found" }
        : { code: "other", detail: `${res.status}${detail ? ` ${detail}` : ""}` };
    throw new SkodaError(error, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null);
  }
  return { body: await res.json(), keyExpiresAt: res.headers.get("X-API-Key-Expires-At") };
}

function mapVehicle(body: any, keyExpiresAt: string | null, state: StoredState): { live: CarLive; next: StoredState } {
  const v = body?.vehicle ?? {};
  const fuel = v.fuelStatus ?? {};
  // Pri hibridih je gorivo lahko v primarnem ali sekundarnem motorju.
  const engines = [fuel.primaryEngineRange, fuel.secondaryEngineRange].filter(Boolean);
  const combustion = engines.find((e: any) => e.engineType && e.engineType !== "ELECTRIC") ?? engines[0] ?? {};
  const odometerKm = num(v.odometer?.mileageInKm);

  const next: StoredState = { ...state };

  // Kilometri v tem mesecu: posnetek števca ob prvem branju v mesecu.
  const month = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Ljubljana" }).slice(0, 7);
  if (odometerKm !== null && next.odometerMonth?.month !== month) {
    next.odometerMonth = { month, startKm: odometerKm };
  }
  const monthKm = odometerKm !== null && next.odometerMonth ? odometerKm - next.odometerMonth.startKm : null;

  // Lokacija: API vrne koordinate samo, ko je avto parkiran; med vožnjo pokažemo zadnjo znano.
  const pp = v.parkingPosition;
  const gps = pp?.gpsCoordinates;
  if (pp?.state === "PARKED" && gps) {
    next.lastParked = {
      lat: gps.latitude,
      lon: gps.longitude,
      address: pp.formattedAddress ?? null,
      at: new Date().toISOString(),
    };
  }
  const usingLastKnown = !(pp?.state === "PARKED" && gps) && Boolean(next.lastParked);
  const position = pp?.state === "PARKED" && gps ? next.lastParked : usingLastKnown ? next.lastParked : undefined;

  const captured = [v.status?.carCapturedTimestamp, fuel.carCapturedTimestamp, v.odometer?.carCapturedTimestamp]
    .filter(Boolean)
    .sort()
    .pop();

  const live: CarLive = {
    vin: v.vin ?? process.env.SKODA_VIN ?? "",
    name: v.name ?? null,
    licensePlate: v.licensePlate ?? null,
    renderUrl: v.renderUrl ?? null,
    locked: yesNo(v.status?.overall?.locked),
    doorsOpen: yesNo(v.status?.overall?.doors, "OPEN", "CLOSED"),
    windowsOpen: yesNo(v.status?.overall?.windows, "OPEN", "CLOSED"),
    fuelPercent: num(combustion.currentFuelLevelInPercent) ?? num(combustion.currentSoCInPercent),
    rangeKm: num(fuel.totalRangeInKm) ?? num(combustion.remainingRangeInKm),
    adBlueRangeKm: num(fuel.adBlueRange),
    odometerKm,
    monthKm,
    parking: {
      state: pp?.state ?? null,
      lat: position?.lat ?? null,
      lon: position?.lon ?? null,
      address: position?.address ?? null,
      lastKnown: usingLastKnown,
    },
    capturedAt: captured ?? null,
    fetchedAt: new Date().toISOString(),
    keyExpiresAt,
    partErrors: (body?.errors ?? []).map((e: any) => String(e.type)),
  };
  next.live = live;
  return { live, next };
}

let inFlight: Promise<void> | null = null;

/** Kdaj je naslednje ročno osveževanje dovoljeno (ms), upošteva Retry-After po 429. */
function nextRefreshAt(state: StoredState): number {
  const last = state.lastAttemptAt ?? 0;
  return Math.max(last + MIN_REFRESH_MS, state.nextFetchAt ?? 0);
}

async function fetchAndStore(): Promise<void> {
  const current = await readState();
  const attempt = { ...current, lastAttemptAt: Date.now() };
  try {
    const { body, keyExpiresAt } = await fetchVehicle();
    const { next } = mapVehicle(body, keyExpiresAt, attempt);
    await writeState({ ...next, nextFetchAt: undefined, lastError: null });
  } catch (e) {
    const err = e as SkodaError;
    await writeState({
      ...attempt,
      // Po 429 počakaj, kolikor zahteva API; pri drugih napakah velja le običajni razmik.
      nextFetchAt: err.retryAfterMs ? Date.now() + err.retryAfterMs : undefined,
      lastError: err instanceof SkodaError ? err.error : { code: "other", detail: (err as Error).message },
    });
  }
}

export type CarResponse = {
  tyres: Tyres;
  source: "skoda" | "demo";
  live: CarLive | null;
  error: CarError | null;
  nextRefreshAt: number | null; // ms; null = Škoda API ni nastavljen
};

function toResponse(state: StoredState): CarResponse {
  if (!skodaConfigured()) {
    return { tyres: state.tyres, source: "demo", live: null, error: null, nextRefreshAt: null };
  }
  return {
    tyres: state.tyres,
    source: "skoda",
    live: state.live ?? null,
    // Starejši zapis (besedilo namesto kode) se prikaže kot splošna napaka.
    error: typeof state.lastError === "string" ? { code: "other", detail: state.lastError } : (state.lastError ?? null),
    nextRefreshAt: nextRefreshAt(state),
  };
}

/** Zadnji shranjeni podatki - brez klica na Škoda API. */
export async function getCar(): Promise<CarResponse> {
  return toResponse(await readState());
}

/** Prebere sveže podatke iz Škoda API-ja (če razmik to dovoli) in vrne novo stanje. */
export async function refreshCar(): Promise<CarResponse> {
  if (!skodaConfigured()) return getCar();
  const state = await readState();
  if (Date.now() >= nextRefreshAt(state)) {
    if (!inFlight) inFlight = fetchAndStore().finally(() => (inFlight = null));
    await inFlight;
  }
  return getCar();
}
