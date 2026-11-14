import type { Metadata } from "next";
import Kiosk from "../components/Kiosk";

export const metadata: Metadata = { title: "Dom · kiosk" };

/** Stenski prikaz za tablico ali TV: ura, vreme, dogodki; ponoči zatemnjen. */
export default function KioskPage() {
  return <Kiosk />;
}
