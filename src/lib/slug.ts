import "server-only";

import { EventModel } from "@/models/Event";

function removeDiacritics(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

export function createSlugBase(value: string) {
  const normalized = removeDiacritics(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || "event";
}

export function createSlugCandidate(base: string, attempt: number) {
  return attempt === 0 ? base : `${base}-${attempt}`;
}

export async function generateUniqueEventSlug(title: string, maxAttempts = 25) {
  const base = createSlugBase(title);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = createSlugCandidate(base, attempt);
    const existingEvent = await EventModel.exists({ slug: candidate });

    if (!existingEvent) {
      return candidate;
    }
  }

  throw new Error("Unable to generate a unique event slug");
}
