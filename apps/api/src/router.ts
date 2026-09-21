import { implement, ORPCError } from "@orpc/server";
import { contract, suggestSlots } from "@upnext/contracts";
import { auth } from "./auth";
import { getSnapshot } from "./data";
import {
  cancelSession,
  deleteEvent,
  deleteTag,
  deleteTask,
  saveEvent,
  saveLog,
  savePreferences,
  saveSession,
  saveTag,
  saveTask,
} from "./mutations";

const implementation = implement(contract).$context<{ headers: Headers }>();
const authenticated = implementation.use(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers });
  if (!session?.user.emailVerified) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Connecte-toi avec une adresse vérifiée pour continuer.",
    });
  }
  return next({ context: { userId: session.user.id } });
});

export const router = implementation.router({
  dashboard: {
    get: authenticated.dashboard.get.handler(({ context }) => getSnapshot(context.userId)),
  },
  tasks: {
    create: authenticated.tasks.create.handler(({ context, input }) =>
      saveTask(context.userId, input),
    ),
    update: authenticated.tasks.update.handler(({ context, input }) =>
      saveTask(context.userId, input),
    ),
    delete: authenticated.tasks.delete.handler(({ context, input }) =>
      deleteTask(context.userId, input.id),
    ),
  },
  tags: {
    create: authenticated.tags.create.handler(({ context, input }) =>
      saveTag(context.userId, input.name),
    ),
    rename: authenticated.tags.rename.handler(({ context, input }) =>
      saveTag(context.userId, input.name, input.id),
    ),
    delete: authenticated.tags.delete.handler(({ context, input }) =>
      deleteTag(context.userId, input.id),
    ),
  },
  sessions: {
    save: authenticated.sessions.save.handler(({ context, input }) =>
      saveSession(context.userId, input),
    ),
    cancel: authenticated.sessions.cancel.handler(({ context, input }) =>
      cancelSession(context.userId, input.id, input.revision),
    ),
  },
  logs: {
    save: authenticated.logs.save.handler(({ context, input }) =>
      saveLog(context.userId, input),
    ),
  },
  events: {
    save: authenticated.events.save.handler(({ context, input }) =>
      saveEvent(context.userId, input),
    ),
    delete: authenticated.events.delete.handler(({ context, input }) =>
      deleteEvent(context.userId, input.id),
    ),
  },
  preferences: {
    save: authenticated.preferences.save.handler(({ context, input }) =>
      savePreferences(context.userId, input),
    ),
  },
  suggestions: {
    get: authenticated.suggestions.get.handler(async ({ context, input }) => {
      const snapshot = await getSnapshot(context.userId);
      const task = snapshot.tasks.find((task) => task.id === input.taskId);
      if (!task) throw new ORPCError("NOT_FOUND");
      return suggestSlots({ ...snapshot, task, durationMinutes: input.durationMinutes });
    }),
  },
});
