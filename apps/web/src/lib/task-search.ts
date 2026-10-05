import type { Task } from "@upnext/contracts";

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");
}

export function matchesTaskSearch(task: Task, tagNames: string[], search: string) {
  const words = normalizeSearchText(search).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const content = normalizeSearchText([task.title, task.notes, ...tagNames].join(" "));
  return words.every((word) => content.includes(word));
}
