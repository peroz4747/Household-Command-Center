// Teme novic, skupne strežniku in vmesniku.
export const NEWS_TOPICS = ["maribor", "vojska", "medicina", "gospodarstvo"] as const;
export type NewsTopic = (typeof NEWS_TOPICS)[number];

// Začetki besed brez strešic; kratice se morajo ujemati v celoti.
// inSummary: išči tudi v opisu; pri širših temah bi to dalo preveč napačnih zadetkov.
export const TOPIC_WORDS: Record<NewsTopic, { prefixes: string[]; exact?: string[]; inSummary?: boolean }> = {
  maribor: { prefixes: ["maribor"], inSummary: true },
  vojska: { prefixes: ["vojsk", "vojak", "vojas", "vojn", "obrambn", "orozj", "raket", "dron"] },
  medicina: {
    prefixes: ["medicin", "zdravnik", "zdravstv", "zdravil", "bolnisn", "bolezn", "cepiv", "kirurg", "pacient", "onkolog", "klinik", "virus", "epidemij"],
    exact: ["ukc"],
  },
  gospodarstvo: {
    prefixes: ["gospodar", "inflacij", "delnic", "borz", "podjetj", "bank", "obrest", "izvoz", "davk", "davc", "stecaj", "proracun", "brezposeln"],
    exact: ["bdp"],
  },
};
