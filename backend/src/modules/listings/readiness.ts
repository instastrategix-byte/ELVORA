/**
 * What a business profile still needs before it can be sent for verification. Client-safe, so
 * the checklist on /business and the server-side submit check use the same rules.
 */
export type ReadinessInput = {
  name: string | null;
  category: string | null;
  description: string | null;
  location: string | null;
  website: string | null;
  contactEmail: string | null;
  registrationNumber: string | null;
  logoPath: string | null;
  evidencePaths: string[];
};

export type ReadinessItem = { key: keyof ReadinessInput; label: string; hint: string; required: boolean; done: boolean };

export const MIN_DESCRIPTION_CHARS = 80;

const filled = (v: string | null | undefined) => Boolean(v && v.trim());

export function businessReadiness(b: ReadinessInput): ReadinessItem[] {
  return [
    { key: "name", label: "Registered business name", hint: "Exactly as on your registration documents.", required: true, done: filled(b.name) },
    { key: "category", label: "Category", hint: "What kind of business you are.", required: true, done: filled(b.category) },
    {
      key: "description",
      label: "Description",
      hint: `At least ${MIN_DESCRIPTION_CHARS} characters about what you offer and who you serve.`,
      required: true,
      done: (b.description?.trim().length ?? 0) >= MIN_DESCRIPTION_CHARS,
    },
    { key: "location", label: "Location", hint: "City and country you operate from.", required: true, done: filled(b.location) },
    { key: "contactEmail", label: "Inquiry contact email", hint: "Where member inquiries are sent.", required: true, done: filled(b.contactEmail) },
    {
      key: "registrationNumber",
      label: "Company registration number",
      hint: "From your certificate of incorporation or trade licence (e.g. CIN, GSTIN, company number).",
      required: true,
      done: filled(b.registrationNumber),
    },
    {
      key: "evidencePaths",
      label: "Verification documents",
      hint: "Certificate of incorporation or trade licence, plus proof you may represent the business.",
      required: true,
      done: b.evidencePaths.length > 0,
    },
    { key: "website", label: "Website", hint: "An https:// address — helps reviewers and members trust you.", required: false, done: filled(b.website) },
    { key: "logoPath", label: "Logo", hint: "Shown on your profile, listings and sponsored ads.", required: false, done: filled(b.logoPath) },
  ];
}

/** Labels of required items that are still missing (empty = ready to submit). */
export function missingRequired(b: ReadinessInput): string[] {
  return businessReadiness(b)
    .filter((i) => i.required && !i.done)
    .map((i) => i.label);
}
