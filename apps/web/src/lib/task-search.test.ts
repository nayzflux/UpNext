import { describe, expect, it } from "vitest";
import type { Task } from "@upnext/contracts";
import { matchesTaskSearch } from "./task-search";

const task = {
  title: "Préparer le dossier",
  notes: "Relire les annexes avant lundi",
} as Task;

describe("recherche de tâches", () => {
  it("cherche tous les mots dans le titre, la description et les tags", () => {
    expect(matchesTaskSearch(task, ["Études", "Important"], "etudes ANNEXES preparer")).toBe(true);
    expect(matchesTaskSearch(task, ["Études"], "dossier mardi")).toBe(false);
  });

  it("ignore les espaces superflus et accepte une recherche vide", () => {
    expect(matchesTaskSearch(task, [], "  ")).toBe(true);
    expect(matchesTaskSearch(task, [], "  PREPARER   LUNDI ")).toBe(true);
  });
});
