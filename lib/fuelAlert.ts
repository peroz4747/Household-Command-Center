// Meja za obvestilo o ceni bencina (nastavi se v kartici avta); shranjeno v data/fuel-alert.json.
import storage from "./storage";

export type FuelAlert = { below: number | null };

export async function getFuelAlert(): Promise<FuelAlert> {
  const raw = await storage.readItems("fuel-alert");
  const below = raw && !Array.isArray(raw) ? Number((raw as FuelAlert).below) : NaN;
  return { below: Number.isFinite(below) && below > 0 ? below : null };
}

export async function setFuelAlert(below: number | null): Promise<FuelAlert> {
  const value = below !== null && Number.isFinite(below) && below > 0.5 && below < 5 ? Math.round(below * 1000) / 1000 : null;
  await storage.writeItems("fuel-alert", { below: value });
  return { below: value };
}
