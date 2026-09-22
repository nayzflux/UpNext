import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  eventInputSchema,
  eventSchema,
  calendarSourceSchema,
  calendarSourceInputSchema,
  importedEventSchema,
  importedEventRangeSchema,
  idSchema,
  logInputSchema,
  preferencesSchema,
  sessionInputSchema,
  sessionSchema,
  snapshotSchema,
  suggestionSchema,
  tagNameSchema,
  tagSchema,
  taskFieldsSchema,
  taskSchema,
  workLogSchema,
} from "./schemas";

export * from "./schemas";
export * from "./domain";

const identified = z.object({ id: idSchema });
const deleted = z.object({ success: z.literal(true) });

export const contract = {
  dashboard: { get: oc.output(snapshotSchema) },
  tasks: {
    create: oc.input(taskFieldsSchema).output(taskSchema),
    update: oc
      .input(taskFieldsSchema.extend({ id: idSchema, revision: z.number().int() }))
      .output(taskSchema),
    delete: oc.input(identified).output(deleted),
  },
  tags: {
    create: oc.input(z.object({ name: tagNameSchema })).output(tagSchema),
    rename: oc.input(z.object({ id: idSchema, name: tagNameSchema })).output(tagSchema),
    delete: oc.input(identified).output(deleted),
  },
  sessions: {
    save: oc.input(sessionInputSchema).output(sessionSchema),
    cancel: oc.input(z.object({ id: idSchema, revision: z.number().int() })).output(deleted),
    delete: oc.input(z.object({ id: idSchema, revision: z.number().int() })).output(deleted),
  },
  logs: {
    save: oc
      .input(logInputSchema)
      .output(z.object({ log: workLogSchema, suggestedEstimate: z.number().nullable() })),
  },
  events: {
    save: oc.input(eventInputSchema).output(eventSchema),
    delete: oc.input(identified).output(deleted),
  },
  calendarSources: {
    create: oc.input(calendarSourceInputSchema).output(calendarSourceSchema),
    rename: oc
      .input(z.object({ id: idSchema, name: z.string().trim().min(1).max(100) }))
      .output(calendarSourceSchema),
    delete: oc.input(identified).output(deleted),
    syncDue: oc.route({ method: "POST" }).output(z.array(calendarSourceSchema)),
    sync: oc
      .route({ method: "POST" })
      .input(z.object({ id: idSchema.optional() }))
      .output(z.array(calendarSourceSchema)),
  },
  importedEvents: {
    list: oc.input(importedEventRangeSchema).output(z.array(importedEventSchema)),
  },
  preferences: { save: oc.input(preferencesSchema).output(preferencesSchema) },
  suggestions: {
    get: oc
      .input(z.object({ taskId: idSchema, durationMinutes: z.number().int().min(5).max(480) }))
      .output(z.array(suggestionSchema)),
  },
};
