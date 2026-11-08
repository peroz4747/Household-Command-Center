// Načini klime, skupni strežniku in vmesniku.
export const CLIMATE_MODES = ["Cool", "Heat", "Automatic", "Dry", "Fan"] as const;
export type ClimateMode = (typeof CLIMATE_MODES)[number];
