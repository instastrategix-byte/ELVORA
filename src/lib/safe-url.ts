/**
 * True only for an absolute https URL without embedded credentials. Use before sending a browser
 * to an address that came from stored data (ads, links), so javascript:, data: and look-alike
 * "https://bank.com@evil.example" URLs can never get through.
 */
export function isSafeDestination(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
