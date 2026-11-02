import { cookies } from "next/headers";
import { LANG_COOKIE, langFromCookie, type Lang } from "./index";

/** Jezik trenutnega zahtevka (piškotek "lang"), za strežniške komponente in API route. */
export async function getLang(): Promise<Lang> {
  return langFromCookie((await cookies()).get(LANG_COOKIE)?.value);
}
