import { z } from "zod";

const terms = z.array(z.string().trim().min(1).max(80)).max(50).default([]);
const audienceIds = z.array(z.uuid()).max(50).default([]);

/**
 * Audience targeting. Unknown keys are rejected (`strict`), which is what blocks sensitive
 * characteristics such as age, gender, religion, health, ethnicity, sexuality or politics: they
 * can't be expressed at all. The database applies the same allow-list.
 */
export const targetingSchema = z
  .object({
    countries: terms,
    regions: terms,
    cities: terms,
    industries: terms,
    member_types: terms,
    job_titles: terms,
    business_types: terms,
    interests: terms,
    // Members don't record a language yet, so language targeting can't be honoured.
    languages: z.array(z.string()).max(0, { error: "Language targeting isn't available yet" }).default([]),
    include_audience_ids: audienceIds,
    exclude_audience_ids: audienceIds,
  })
  // Unknown keys (age, gender, religion, …) fail validation with an "unrecognized key" issue.
  .strict();

export type Targeting = z.infer<typeof targetingSchema>;

/** Drops empty arrays so stored targeting stays minimal. */
export function compactTargeting(t: Targeting): Partial<Targeting> {
  return Object.fromEntries(Object.entries(t).filter(([, v]) => Array.isArray(v) && v.length > 0)) as Partial<Targeting>;
}
