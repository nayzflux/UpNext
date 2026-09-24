import { z } from "zod";

export const idSchema = z.string().uuid();
export const instantSchema = z.iso.datetime({ offset: true });
export const prioritySchema = z.enum(["low", "normal", "high"]);
export const timeZoneSchema = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Fuseau horaire invalide.");

export const tagSchema = z.object({ id: idSchema, name: z.string() });
export const tagNameSchema = z
  .string()
  .transform((name) => name.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1).max(50));

export const eventLinkSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("local"),
    eventId: idSchema,
    occurrenceIndex: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("imported"),
    sourceId: idSchema,
    uid: z.string().min(1),
    recurrenceId: z.string().nullable(),
  }),
]);

export const taskFieldsSchema = z.object({
  title: z.string().trim().min(1, "Ajoute un titre.").max(200),
  notes: z.string().max(10000).default(""),
  priority: prioritySchema.default("normal"),
  dueAt: instantSchema,
  dateOnly: z.boolean().default(true),
  estimatedMinutes: z.number().int().min(5).max(100000),
  tagIds: z.array(idSchema).max(30).default([]),
  eventLink: eventLinkSchema.nullable().default(null),
});

export const taskSchema = taskFieldsSchema.extend({
  id: idSchema,
  progress: z.number().min(0).max(100),
  revision: z.number().int(),
  createdAt: instantSchema,
});

export const sessionSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  startAt: instantSchema,
  endAt: instantSchema,
  plannedPercent: z.number().min(0).max(100),
  status: z.enum(["planned", "completed", "missed", "expired", "cancelled"]),
  cancellationReason: z.enum(["manual", "task-completed"]).nullable(),
  revision: z.number().int(),
});

export const sessionInputSchema = z
  .object({
    id: idSchema.optional(),
    revision: z.number().int().optional(),
    taskId: idSchema,
    startAt: instantSchema,
    endAt: instantSchema,
    plannedPercent: z.number().min(0).max(100).optional(),
    allowOverlap: z.boolean().default(false),
  })
  .refine(
    (value) => new Date(value.endAt) > new Date(value.startAt),
    "La fin doit suivre le début.",
  )
  .refine(
    (value) => new Date(value.endAt).getTime() - new Date(value.startAt).getTime() <= 86400000,
    "Une séance ne peut pas dépasser 24 h.",
  );

export const workLogSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  sessionId: idSchema.nullable(),
  actualStartAt: instantSchema,
  actualMinutes: z.number().int().min(0),
  progressBefore: z.number().min(0).max(100),
  progressAfter: z.number().min(0).max(100),
  note: z.string(),
  missed: z.boolean(),
  createdAt: instantSchema,
});

export const logInputSchema = z
  .object({
    id: idSchema.optional(),
    requestId: idSchema,
    taskId: idSchema,
    taskRevision: z.number().int(),
    sessionId: idSchema.nullable().default(null),
    actualMinutes: z.number().int().min(0).max(1440).optional(),
    progressAfter: z.number().min(0).max(100).optional(),
    note: z.string().max(2000).default(""),
    missed: z.boolean().default(false),
  })
  .refine(
    (value) => !value.missed || value.sessionId !== null,
    "Une séance manquée doit être liée au planning.",
  )
  .refine(
    (value) =>
      value.missed || (value.actualMinutes !== undefined && value.progressAfter !== undefined),
    "Indique le temps passé et l’avancement de la tâche.",
  );

export const eventFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  startAt: instantSchema,
  endAt: instantSchema,
  weekly: z.boolean().default(false),
  repeatUntil: z.iso.date().nullable().default(null),
  timeZone: timeZoneSchema,
});

export const eventSchema = eventFieldsSchema.extend({
  id: idSchema,
  revision: z.number().int(),
});

export const calendarSourceSchema = z.object({
  id: idSchema,
  name: z.string(),
  url: z.url(),
  attemptedAt: instantSchema.nullable(),
  succeededAt: instantSchema.nullable(),
  error: z.string().nullable(),
});
export const calendarSourceInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: z.url(),
});
export const importedEventSchema = z.object({
  id: z.string(),
  occurrenceId: z.string(),
  sourceId: idSchema,
  uid: z.string(),
  recurrenceId: z.string().nullable(),
  sourceName: z.string(),
  title: z.string(),
  startAt: instantSchema,
  endAt: instantSchema,
  allDay: z.boolean(),
});
export const importedEventRangeSchema = z.object({
  startAt: instantSchema,
  endAt: instantSchema,
});
export const eventInputSchema = eventFieldsSchema
  .extend({
    id: idSchema.optional(),
    revision: z.number().int().optional(),
    allowOverlap: z.boolean().default(false),
  })
  .refine(
    (value) => new Date(value.endAt) > new Date(value.startAt),
    "La fin doit suivre le début.",
  )
  .refine(
    (value) => new Date(value.endAt).getTime() - new Date(value.startAt).getTime() <= 86400000,
    "Un événement ne peut pas dépasser 24 h.",
  );

export const availabilitySchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .refine((value) => value.endTime > value.startTime, "La fin doit suivre le début.");

export const preferencesSchema = z.object({
  timeZone: timeZoneSchema.default("Europe/Paris"),
  theme: z.enum(["light", "dark", "system"]).default("system"),
  availability: z.array(availabilitySchema).max(35).default([]),
});

export const snapshotSchema = z.object({
  tasks: z.array(taskSchema),
  tags: z.array(tagSchema),
  sessions: z.array(sessionSchema),
  logs: z.array(workLogSchema),
  events: z.array(eventSchema),
  calendarSources: z.array(calendarSourceSchema),
  preferences: preferencesSchema,
  serverNow: instantSchema,
});

export const suggestionSchema = z.object({
  startAt: instantSchema,
  endAt: instantSchema,
  reason: z.string(),
  learned: z.boolean(),
});

export type Task = z.infer<typeof taskSchema>;
export type EventLink = z.infer<typeof eventLinkSchema>;
export type Tag = z.infer<typeof tagSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type WorkLog = z.infer<typeof workLogSchema>;
export type CalendarEvent = z.infer<typeof eventSchema>;
export type CalendarSource = z.infer<typeof calendarSourceSchema>;
export type ImportedEvent = z.infer<typeof importedEventSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Suggestion = z.infer<typeof suggestionSchema>;
