/**
 * Mobile numbers for SMS sign-in. Client-safe. Numbers are stored by Supabase Auth in E.164
 * (+<country><number>) and are never shown on profiles.
 */
export const DIAL_CODES = [
  { iso: "IN", dial: "+91", name: "India" },
  { iso: "AE", dial: "+971", name: "United Arab Emirates" },
  { iso: "US", dial: "+1", name: "United States / Canada" },
  { iso: "GB", dial: "+44", name: "United Kingdom" },
  { iso: "SG", dial: "+65", name: "Singapore" },
  { iso: "SA", dial: "+966", name: "Saudi Arabia" },
  { iso: "QA", dial: "+974", name: "Qatar" },
  { iso: "KW", dial: "+965", name: "Kuwait" },
  { iso: "BH", dial: "+973", name: "Bahrain" },
  { iso: "OM", dial: "+968", name: "Oman" },
  { iso: "HK", dial: "+852", name: "Hong Kong" },
  { iso: "AU", dial: "+61", name: "Australia" },
  { iso: "DE", dial: "+49", name: "Germany" },
  { iso: "FR", dial: "+33", name: "France" },
  { iso: "IT", dial: "+39", name: "Italy" },
  { iso: "ES", dial: "+34", name: "Spain" },
  { iso: "CH", dial: "+41", name: "Switzerland" },
  { iso: "NL", dial: "+31", name: "Netherlands" },
  { iso: "MC", dial: "+377", name: "Monaco" },
  { iso: "JP", dial: "+81", name: "Japan" },
  { iso: "CN", dial: "+86", name: "China" },
  { iso: "ZA", dial: "+27", name: "South Africa" },
  { iso: "NG", dial: "+234", name: "Nigeria" },
  { iso: "BR", dial: "+55", name: "Brazil" },
] as const;

export const DEFAULT_DIAL = "+91";
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Builds an E.164 number from a dial code and what the member typed. Accepts spaces, dashes,
 * brackets and a national leading 0; a number typed with its own "+" wins over the dial code.
 * Returns null when the result isn't a plausible international number.
 */
export function toE164(dial: string, typed: string): string | null {
  const raw = typed.trim();
  let candidate: string;
  if (raw.startsWith("+")) candidate = `+${raw.slice(1).replace(/[^\d]/g, "")}`;
  else if (raw.startsWith("00")) candidate = `+${raw.slice(2).replace(/[^\d]/g, "")}`;
  else {
    const digits = raw.replace(/[^\d]/g, "").replace(/^0+/, "");
    const code = dial.replace(/[^\d]/g, "");
    if (!code || !digits) return null;
    candidate = `+${code}${digits}`;
  }
  return E164.test(candidate) ? candidate : null;
}

export function isE164(value: string): boolean {
  return E164.test(value);
}

/** "+91 •••••• 3210" — enough to recognise your own number without revealing it on screen. */
export function maskPhone(e164: string): string {
  const n = e164.startsWith("+") ? e164 : `+${e164}`;
  const dial = DIAL_CODES.map((d) => d.dial)
    .sort((a, b) => b.length - a.length)
    .find((d) => n.startsWith(d));
  const rest = dial ? n.slice(dial.length) : n.slice(1);
  return `${dial ?? "+"} ${"•".repeat(Math.max(0, rest.length - 4))} ${rest.slice(-4)}`.replace("+ ", "+");
}
