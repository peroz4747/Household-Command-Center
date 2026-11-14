// Države ob poti in kaj potrebuješ za avtoceste (vinjeta, cestnina po km).
// Meje: Natural Earth 1:50m (poenostavljene, lib/data/countries.json) - dovolj za "skozi katere države gre pot".
// Cene se pogosto spreminjajo, zato jih ne navajamo; povezave vodijo na uradne prodajalce.
import countries from "./data/countries.json";
import { CAR_MANUAL } from "./carManual";

export type TollKind = "vignette" | "distance" | "none";
export type TollInfo = {
  country: string; // ISO 3166-1 alpha-2
  kind: TollKind;
  note: string; // ključ prevoda: trip.toll.<country>
  url: string | null;
  status?: "ok" | "expired" | "expiring"; // le za slovensko vinjeto (datum iz kartice avta)
};

type Ring = [number, number][];
const RINGS = Object.entries(countries as unknown as Record<string, Ring[]>).map(([iso, rings]) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rings) for (const [x, y] of r) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { iso, rings, bbox: [minX, minY, maxX, maxY] as const, area: (maxX - minX) * (maxY - minY) };
}).sort((a, b) => a.area - b.area); // majhne države (San Marino, Vatikan, Monako) najprej

function inRing(lon: number, lat: number, ring: Ring): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export function countryAt(lat: number, lon: number): string | null {
  for (const c of RINGS) {
    const [minX, minY, maxX, maxY] = c.bbox;
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
    if (c.rings.some((r) => inRing(lon, lat, r))) return c.iso;
  }
  return null;
}

/**
 * Države po vrstnem redu vožnje. Odsek mora biti dolg vsaj ~3 km, da poenostavljena meja
 * ob cesti tik ob meji (npr. Gorica, Fernetiči) ne doda države, skozi katero ne vozimo.
 */
export function countriesAlong(coords: [number, number][], cumKm: number[]): string[] {
  const runs: { c: string; from: number; to: number }[] = [];
  let lastKm = -Infinity;
  for (let i = 0; i < coords.length; i += 1) {
    if (cumKm[i] - lastKm < 1 && i !== coords.length - 1) continue; // točka na ~1 km
    lastKm = cumKm[i];
    const c = countryAt(coords[i][0], coords[i][1]);
    if (!c) continue;
    const run = runs[runs.length - 1];
    if (run?.c === c) run.to = cumKm[i];
    else runs.push({ c, from: cumKm[i], to: cumKm[i] });
  }
  const kept = runs.filter((r, i) => i === 0 || i === runs.length - 1 || r.to - r.from >= 3);
  return kept.map((r) => r.c).filter((c, i, all) => i === 0 || all[i - 1] !== c);
}

const RULES: Record<string, { kind: TollKind; url: string | null }> = {
  SI: { kind: "vignette", url: "https://evinjeta.dars.si/" },
  AT: { kind: "vignette", url: "https://shop.asfinag.at/" },
  HU: { kind: "vignette", url: "https://ematrica.nemzetiutdij.hu/" },
  CZ: { kind: "vignette", url: "https://edalnice.cz/" },
  SK: { kind: "vignette", url: "https://eznamka.sk/" },
  CH: { kind: "vignette", url: "https://via.admin.ch/shop/" },
  BG: { kind: "vignette", url: "https://web.bgtoll.bg/" },
  RO: { kind: "vignette", url: "https://www.roviniete.ro/" },
  MD: { kind: "vignette", url: null },
  HR: { kind: "distance", url: "https://hac.hr/" },
  IT: { kind: "distance", url: "https://www.autostrade.it/" },
  FR: { kind: "distance", url: "https://www.autoroutes.fr/" },
  ES: { kind: "distance", url: null },
  PT: { kind: "distance", url: null },
  GR: { kind: "distance", url: null },
  RS: { kind: "distance", url: "https://www.putevi-srbije.rs/" },
  MK: { kind: "distance", url: null },
  BA: { kind: "distance", url: null },
  ME: { kind: "distance", url: null },
  AL: { kind: "distance", url: null },
  PL: { kind: "distance", url: "https://etoll.gov.pl/" },
  TR: { kind: "distance", url: null },
};

export function tollsFor(list: string[], tripDate: string): TollInfo[] {
  return list.map((country) => {
    const rule = RULES[country] ?? { kind: "none" as const, url: null };
    const info: TollInfo = { country, kind: rule.kind, note: `trip.toll.${RULES[country] ? country : "none"}`, url: rule.url };
    if (country === "SI") {
      const days = (Date.parse(`${CAR_MANUAL.vignette}T00:00:00Z`) - Date.parse(`${tripDate}T00:00:00Z`)) / 86_400_000;
      info.status = days < 0 ? "expired" : days < 30 ? "expiring" : "ok";
    }
    return info;
  });
}
