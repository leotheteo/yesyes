import { z } from "zod";
const text = z.string().trim().min(1).max(200);
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const date = new Date(v + "T12:00:00Z");
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v
    );
  }, "Enter a valid date.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const coords = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export const restaurantSchema = z.object({
  name: text,
  cuisine: z.string().trim().max(200).default(""),
  price: z.number().min(0).max(100000).nullable().default(null),
  address: z.string().trim().max(500).default(""),
  coordinates: coords.nullable().default(null),
  placeId: z.string().max(300).optional(),
  visits: z.array(z.iso.datetime()).max(1000).default([]),
});
export const preferenceSchema = z.object({
  userId: text,
  restaurantId: text,
  value: z.enum(["like", "neutral", "exclude"]),
});
export const voteSessionSchema = z
  .object({
    title: text,
    participants: z.array(text).min(1).max(100),
    budget: z.number().positive().max(100000).nullable().default(null),
    maxDistance: z.number().positive().max(10000).nullable().default(null),
    home: coords.nullable().default(null),
    closesAt: z.iso.datetime(),
    votes: z
      .record(
        z.string(),
        z.record(z.string(), z.enum(["yes", "neutral", "no"])),
      )
      .default({}),
    vetoes: z.record(z.string(), z.string()).default({}),
    draws: z.array(z.string()).default([]),
    selectedId: z.string().nullable().default(null),
    finalized: z.boolean().default(false),
    visited: z.boolean().default(false),
  })
  .refine(
    (s) => !s.maxDistance || s.home !== null,
    "Enter home coordinates to filter by distance.",
  )
  .refine(
    (s) => new Set(s.participants).size === s.participants.length,
    "Each participant can be selected only once.",
  );
const eventFields = z.object({
  title: text,
  category: z.enum([
    "Game day",
    "Practice",
    "Café",
    "Birthday",
    "Gathering",
    "Other",
  ]),
  date: dateOnly,
  time: time.default("09:00"),
  endTime: time.nullable().default(null),
  allDay: z.boolean().default(false),
  location: z.string().trim().max(500).default(""),
  notes: z.string().trim().max(10000).default(""),
});
export const eventPatchSchema = eventFields.omit({ date: true }).partial();
export const eventSchema = eventFields
  .extend({
    recurrence: z
      .enum(["none", "daily", "weekly", "monthly", "yearly"])
      .default("none"),
    until: dateOnly.nullable().default(null),
    exceptions: z
      .array(
        z.object({
          date: dateOnly,
          cancelled: z.boolean().default(false),
          patch: eventPatchSchema.optional(),
        }),
      )
      .max(1000)
      .default([]),
  })
  .refine(
    (e) => !e.until || e.until >= e.date,
    "Repeat end date must follow the event date.",
  )
  .refine(
    (e) => e.allDay || !e.endTime || e.endTime > e.time,
    "End time must follow start time on the same day.",
  );
export const listSchema = z.object({ name: text });
export const itemSchema = z.object({
  listId: text,
  name: text,
  quantity: z.number().positive().max(100000),
  unit: z.string().trim().max(40).default(""),
  category: z.string().trim().max(80).default(""),
  store: z.string().trim().max(100).default(""),
  price: z.number().min(0).max(100000).nullable().default(null),
  checked: z.boolean().default(false),
});
export const schemas = {
  restaurant: restaurantSchema,
  preference: preferenceSchema,
  voteSession: voteSessionSchema,
  event: eventSchema,
  list: listSchema,
  item: itemSchema,
};
export type Kind = keyof typeof schemas;
export const kindSchema = z.enum([
  "restaurant",
  "preference",
  "voteSession",
  "event",
  "list",
  "item",
]);
export type Restaurant = z.infer<typeof restaurantSchema>;
export type Preference = z.infer<typeof preferenceSchema>;
export type VoteSession = z.infer<typeof voteSessionSchema>;
export type FamilyEvent = z.infer<typeof eventSchema>;
export type ShoppingItem = z.infer<typeof itemSchema>;
export type HubRecord<K extends Kind = Kind> = {
  id: string;
  kind: K;
  data: z.infer<(typeof schemas)[K]>;
  revision: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
export type Person = { id: string; name: string; email: string };
export type Snapshot = {
  revision: number;
  household: string;
  user: Person;
  isOwner: boolean;
  people: Person[];
  records: HubRecord[];
  attachments: {
    id: string;
    eventId: string;
    filename: string;
    contentType: string;
    size: number;
    uploadedBy: string;
  }[];
  notifications: {
    id: string;
    title: string;
    eventId: string;
    read: boolean;
    createdAt: string;
  }[];
  requests: {
    id: string;
    title: string;
    mediaType: string;
    season: number;
    status: string;
    error: string | null;
    userId: string;
  }[];
  integrations: string[];
};
