import { eq } from "drizzle-orm";
import { addCalendarDays, localDate, zonedInstant } from "@upnext/contracts";
import { db, pool } from "./index";
import { user } from "./schema";
import { getSnapshot } from "../data";
import { saveEvent, saveLog, savePreferences, saveSession, saveTask } from "../mutations";

// Add optional sample tasks to an existing, empty account. Never create tags.
async function seed() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage : pnpm db:demo adresse@exemple.fr (compte déjà inscrit)");
  const [owner] = await db.select().from(user).where(eq(user.email, email));
  if (!owner) throw new Error("Inscris d’abord ce compte dans l’application.");
  const snapshot = await getSnapshot(owner.id);
  if (snapshot.tasks.length || snapshot.sessions.length || snapshot.events.length) {
    throw new Error(
      "Le compte contient déjà des données. La démonstration nécessite un compte vide.",
    );
  }
  const timeZone = snapshot.preferences.timeZone;
  const today = localDate(new Date(), timeZone);
  const at = (days: number, time: string) =>
    zonedInstant(addCalendarDays(today, days), time, timeZone);
  const examples = [
    {
      title: "Préparer le DS de vendredi",
      notes: "Revoir les exercices du dernier chapitre, puis refaire un sujet sans les notes.",
      estimate: 240,
      due: 5,
      priority: "high" as const,
    },
    {
      title: "Avancer le dossier de projet",
      notes: "Terminer le plan et rédiger l’introduction.",
      estimate: 180,
      due: 7,
      priority: "normal" as const,
    },
    {
      title: "Préparer mon entretien de stage",
      notes: "Relire l’offre et préparer trois questions.",
      estimate: 90,
      due: 3,
      priority: "high" as const,
    },
    {
      title: "Ranger mon espace de travail",
      notes: "",
      estimate: 30,
      due: 2,
      priority: "low" as const,
    },
    {
      title: "Relire le compte rendu",
      notes: "Vérifier les références avant l’envoi.",
      estimate: 45,
      due: 1,
      priority: "normal" as const,
    },
  ];
  const created = [];
  for (const example of examples) {
    created.push(
      await saveTask(owner.id, {
        title: example.title,
        notes: example.notes,
        priority: example.priority,
        dueAt: at(example.due, "23:59"),
        dateOnly: true,
        estimatedMinutes: example.estimate,
        tagIds: [],
        eventId: null,
      }),
    );
  }
  const past = await saveSession(owner.id, {
    taskId: created[0].id,
    startAt: at(-1, "17:00"),
    endAt: at(-1, "18:00"),
    allowOverlap: false,
  });
  await saveLog(owner.id, {
    requestId: crypto.randomUUID(),
    taskId: created[0].id,
    taskRevision: 0,
    sessionId: past.id,
    actualMinutes: 90,
    progressAfter: 25,
    note: "Les exercices prennent un peu plus de temps que prévu.",
    missed: false,
  });
  await saveSession(owner.id, {
    taskId: created[0].id,
    startAt: at(0, "18:00"),
    endAt: at(0, "19:00"),
    allowOverlap: false,
  });
  await saveSession(owner.id, {
    taskId: created[1].id,
    startAt: at(1, "14:00"),
    endAt: at(1, "15:30"),
    allowOverlap: false,
  });
  await saveSession(owner.id, {
    taskId: created[2].id,
    startAt: at(-1, "10:00"),
    endAt: at(-1, "10:45"),
    allowOverlap: false,
  });
  await saveEvent(owner.id, {
    title: "Cours en amphithéâtre",
    startAt: at(1, "09:00"),
    endAt: at(1, "11:00"),
    weekly: true,
    repeatUntil: addCalendarDays(today, 60),
    timeZone,
    allowOverlap: false,
  });
  await savePreferences(owner.id, {
    ...snapshot.preferences,
    availability: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startTime: "17:00",
      endTime: "20:00",
    })),
  });
  console.log("Démonstration ajoutée : 5 tâches, 4 séances, 1 événement. Aucun tag créé.");
}

try {
  await seed();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
