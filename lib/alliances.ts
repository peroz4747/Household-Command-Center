// Zavezništva, bloki in znani sovražni odnosi (stanje 2025). Wikidata ima članstva nepopolna,
// zato so seznami vodeni ročno - ob spremembah (nove članice, izstopi) jih posodobi tukaj.
export type Bloc = { id: string; name: string; kind: "military" | "political"; members: string[] };

export const BLOCS: Bloc[] = [
  {
    id: "NATO",
    name: "NATO",
    kind: "military",
    members: ["AL", "BE", "BG", "CA", "HR", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IT", "LV", "LT", "LU", "ME", "NL", "MK", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "TR", "GB", "US"],
  },
  // Armenija je leta 2024 zamrznila sodelovanje v OVKP, zato ni med članicami.
  { id: "CSTO", name: "OVKP (CSTO)", kind: "military", members: ["RU", "BY", "KZ", "KG", "TJ"] },
  {
    id: "EU",
    name: "EU",
    // Pogodba EU ima klavzulo o vzajemni pomoči (člen 42(7)), zato šteje kot zavezništvo.
    kind: "military",
    members: ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"],
  },
  { id: "SCO", name: "ŠOS (SCO)", kind: "political", members: ["CN", "RU", "IN", "PK", "KZ", "KG", "TJ", "UZ", "IR", "BY"] },
  { id: "BRICS", name: "BRICS", kind: "political", members: ["BR", "RU", "IN", "CN", "ZA", "EG", "ET", "IR", "AE", "ID"] },
  { id: "ASEAN", name: "ASEAN", kind: "political", members: ["BN", "KH", "ID", "LA", "MY", "MM", "PH", "SG", "TH", "VN", "TL"] },
  { id: "GCC", name: "Zalivski svet (GCC)", kind: "political", members: ["SA", "AE", "QA", "KW", "BH", "OM"] },
  {
    id: "AL",
    name: "Arabska liga",
    kind: "political",
    members: ["DZ", "BH", "KM", "DJ", "EG", "IQ", "JO", "KW", "LB", "LY", "MR", "MA", "OM", "PS", "QA", "SA", "SO", "SD", "SY", "TN", "AE", "YE"],
  },
  { id: "MERCOSUR", name: "Mercosur", kind: "political", members: ["AR", "BR", "PY", "UY", "BO"] },
  { id: "EAEU", name: "Evrazijska gospodarska unija", kind: "political", members: ["RU", "BY", "KZ", "KG", "AM"] },
  {
    id: "AU",
    name: "Afriška unija",
    kind: "political",
    members: [
      "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CG", "CD", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR",
      "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "ZM", "ZW", "EH",
    ],
  },
];

/** Dvostranske obrambne pogodbe (vzajemna obramba), ki niso del zgornjih zavezništev. */
export const DEFENCE_TREATIES: [string, string, string][] = [
  ["US", "JP", "Pogodba ZDA–Japonska (1960)"],
  ["US", "KR", "Pogodba ZDA–Južna Koreja (1953)"],
  ["US", "AU", "ANZUS (1951)"],
  ["AU", "NZ", "ANZUS (1951)"],
  ["US", "PH", "Pogodba ZDA–Filipini (1951)"],
  ["US", "TH", "Manilski pakt (1954)"],
  ["CN", "KP", "Pogodba Kitajska–Severna Koreja (1961)"],
  ["RU", "KP", "Pogodba Rusija–Severna Koreja (2024)"],
  ["RU", "BY", "Zvezna država Rusija–Belorusija"],
];

/** Dolgotrajno sovražni odnosi brez trenutnega oboroženega spopada (kratek, dokumentiran seznam). */
export const ADVERSARIES: [string, string, string][] = [
  ["IL", "IR", "brez diplomatskih odnosov, sovražna retorika in napadi"],
  ["KP", "KR", "formalno še v vojnem stanju (premirje 1953)"],
  ["KP", "US", "brez diplomatskih odnosov"],
  ["US", "IR", "brez diplomatskih odnosov od 1980"],
  ["CN", "TW", "Kitajska ne priznava Tajvana"],
  ["IN", "PK", "spor glede Kašmirja"],
  ["AM", "AZ", "spor glede Gorskega Karabaha (mirovni sporazum parafiran avgusta 2025)"],
  ["MA", "DZ", "diplomatski odnosi prekinjeni 2021"],
];
