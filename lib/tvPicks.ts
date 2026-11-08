// Predlogi filmov in serij za TV: katalog Netflixa in HBO Max za Slovenijo iz JustWatcha.
// JustWatchov GraphQL je javen, a neuraden - ob spremembi njihovega API-ja je treba popraviti le to datoteko.
export const PICK_GENRES = ["act", "ani", "cmy", "crm", "doc", "drm", "fml", "fnt", "hrr", "rma", "scf", "trl"] as const;
export type PickGenre = (typeof PICK_GENRES)[number];
export type PickType = "movie" | "show";
export type PickProvider = "all" | "netflix" | "hbo";
export type PickApp = "netflix" | "hbomax";

export type Pick = {
  id: string;
  title: string;
  year: number | null;
  imdb: number | null;
  poster: string | null;
  description: string;
  app: PickApp;
  url: string;
};

const ENDPOINT = "https://apis.justwatch.com/graphql";
const COUNTRY = "SI";
const POOL_SIZE = 100;
const RESULT_COUNT = 10;
const CACHE_MS = 30 * 60_000;
const PACKAGES: Record<PickProvider, string[]> = { all: ["nfx", "mxx"], netflix: ["nfx"], hbo: ["mxx"] };
const APP_BY_PACKAGE: Record<string, PickApp> = { nfx: "netflix", mxx: "hbomax" };

const QUERY = `query Picks($country:Country!,$language:Language!,$first:Int!,$filter:TitleFilter,$offerFilter:OfferFilter!){
  popularTitles(country:$country,first:$first,filter:$filter,sortBy:POPULAR){edges{node{id
    content(country:$country,language:$language){title originalReleaseYear posterUrl shortDescription scoring{imdbScore}}
    offers(country:$country,platform:WEB,filter:$offerFilter){standardWebURL package{shortName}}
  }}}
}`;

const cache = new Map<string, { at: number; items: Pick[] }>();

async function fetchPool(type: PickType, genre: PickGenre | null, provider: PickProvider): Promise<Pick[]> {
  const key = `${type}:${genre ?? ""}:${provider}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;

  const packages = PACKAGES[provider];
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      operationName: "Picks",
      query: QUERY,
      variables: {
        country: COUNTRY,
        language: "en",
        first: POOL_SIZE,
        filter: {
          objectTypes: [type === "movie" ? "MOVIE" : "SHOW"],
          packages,
          imdbScore: { min: 7 },
          imdbVotes: { min: 5000 },
          ...(genre ? { genres: [genre] } : {}),
        },
        offerFilter: { packages, monetizationTypes: ["FLATRATE"] },
      },
    }),
  });
  if (!res.ok) throw new Error(`JustWatch HTTP ${res.status}`);
  const body: any = await res.json();
  if (body.errors?.length) throw new Error(String(body.errors[0]?.message ?? "JustWatch error"));

  const items: Pick[] = [];
  for (const { node } of body.data?.popularTitles?.edges ?? []) {
    // Netflix ima prednost, če je naslov na obeh.
    const offers: any[] = node.offers ?? [];
    const offer =
      offers.find((o) => o.package?.shortName === "nfx") ?? offers.find((o) => APP_BY_PACKAGE[o.package?.shortName]);
    if (!offer?.standardWebURL) continue;
    const c = node.content ?? {};
    items.push({
      id: String(node.id),
      title: String(c.title ?? ""),
      year: c.originalReleaseYear ?? null,
      imdb: c.scoring?.imdbScore ?? null,
      poster: c.posterUrl
        ? `https://images.justwatch.com${String(c.posterUrl).replace("{profile}", "s166").replace("{format}", "jpg")}`
        : null,
      description: String(c.shortDescription ?? ""),
      app: APP_BY_PACKAGE[offer.package.shortName],
      url: String(offer.standardWebURL),
    });
  }
  cache.set(key, { at: Date.now(), items });
  return items;
}

/** Naključnih 10 iz bazena bolje ocenjenih in priljubljenih naslovov, razvrščenih po oceni IMDb. */
export async function getPicks(type: PickType, genre: PickGenre | null, provider: PickProvider): Promise<Pick[]> {
  const pool = [...(await fetchPool(type, genre, provider))];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, RESULT_COUNT).sort((a, b) => (b.imdb ?? 0) - (a.imdb ?? 0));
}
