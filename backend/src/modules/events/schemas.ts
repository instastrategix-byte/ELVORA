import { z } from "zod";

export const EVENT_FORMATS = ["in_person", "virtual", "hybrid"] as const;
export const EVENT_VISIBILITIES = ["members", "invite_only"] as const;
export const RSVP_CHOICES = ["going", "interested", "cancelled"] as const;
export const EVENT_FILTERS = ["upcoming", "mine", "hosting"] as const;

export const FORMAT_LABELS: Record<(typeof EVENT_FORMATS)[number], string> = {
  in_person: "In person",
  virtual: "Virtual",
  hybrid: "Hybrid",
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Must be ${max} characters or fewer` })
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const isoDate = z.iso.datetime({ offset: true, error: "Enter a valid date and time" });

export const eventSchema = z
  .object({
    title: z.string().trim().min(3, { error: "At least 3 characters" }).max(120),
    summary: optionalText(280),
    description: optionalText(4000),
    format: z.enum(EVENT_FORMATS),
    venueName: optionalText(120),
    city: optionalText(80),
    country: optionalText(80),
    onlineUrl: z
      .union([z.literal(""), z.url({ protocol: /^https$/, error: "Use a full https:// link" }).max(500)])
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    startsAt: isoDate,
    endsAt: isoDate,
    capacity: z.coerce.number().int().min(1).max(5000).nullable().optional(),
    visibility: z.enum(EVENT_VISIBILITIES),
    coverPath: z.string().max(300).nullable().optional(),
    businessId: z.uuid().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (new Date(v.endsAt) <= new Date(v.startsAt)) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start" });
    }
    if (new Date(v.endsAt).getTime() - new Date(v.startsAt).getTime() > 31 * 86_400_000) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Events can last at most 31 days" });
    }
    if (v.format !== "in_person" && !v.onlineUrl) {
      ctx.addIssue({ code: "custom", path: ["onlineUrl"], message: "Add the joining link for virtual attendees" });
    }
    if (v.format !== "virtual" && !v.city) {
      ctx.addIssue({ code: "custom", path: ["city"], message: "Add the city" });
    }
  });
export type EventInput = z.infer<typeof eventSchema>;

export const eventActionSchema = z.object({ action: z.enum(["publish", "unpublish", "cancel"]) });

export const rsvpSchema = z.object({
  status: z.enum(RSVP_CHOICES),
  note: optionalText(280),
});

export const inviteSchema = z.object({
  handle: z
    .string()
    .trim()
    .transform((h) => h.replace(/^@/, "").toLowerCase())
    .pipe(z.string().regex(/^[a-z0-9_]{3,30}$/, { error: "Enter a member handle" })),
});

export const eventListQuerySchema = z.object({
  filter: z.enum(EVENT_FILTERS).default("upcoming"),
  cursor: z.string().max(200).optional(),
});
