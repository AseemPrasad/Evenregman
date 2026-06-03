import "server-only";

import { connectToDatabase } from "@/lib/db";
import { EventModel, type Event } from "@/models/Event";

export type PublicEvent = {
  title: string;
  slug: string;
  description: string;
  date: Date;
  time: string;
  location: string;
  capacity: number;
  attendeeCount: number;
  registrationCutoff: Date;
  status: "OPEN" | "FULL" | "CLOSED" | "DELETED";
};

export type PublicEventSummary = Pick<
  PublicEvent,
  "title" | "slug" | "date" | "time" | "location" | "capacity" | "attendeeCount" | "status"
>;

export async function getPublicEventBySlug(slug: string): Promise<PublicEvent | null> {
  await connectToDatabase();

  const event = (await EventModel.findOne({
    slug: slug.trim().toLowerCase(),
    status: { $ne: "DELETED" }
  })
    .select({
      _id: 1,
      title: 1,
      slug: 1,
      description: 1,
      date: 1,
      time: 1,
      location: 1,
      capacity: 1,
      attendeeCount: 1,
      registrationCutoff: 1,
      status: 1
    })
    .lean()) as
    | (Pick<
        Event,
        "_id" | "title" | "slug" | "description" | "date" | "time" | "location" | "capacity" | "attendeeCount" | "registrationCutoff" | "status"
      >)
    | null;

  if (!event) {
    return null;
  }

  return {
    title: event.title,
    slug: event.slug,
    description: event.description,
    date: event.date,
    time: event.time,
    location: event.location,
    capacity: event.capacity,
    attendeeCount: event.attendeeCount,
    registrationCutoff: event.registrationCutoff,
    status: event.status
  };
}

export async function getPublicEvents(): Promise<PublicEventSummary[]> {
  await connectToDatabase();

  const events = (await EventModel.find({
    status: { $ne: "DELETED" }
  })
    .select({
      _id: 1,
      title: 1,
      slug: 1,
      date: 1,
      time: 1,
      location: 1,
      capacity: 1,
      attendeeCount: 1,
      status: 1
    })
    .sort({ date: 1, createdAt: -1 })
    .lean()) as unknown as Array<
    Pick<Event, "_id" | "title" | "slug" | "date" | "time" | "location" | "capacity" | "attendeeCount" | "status">
  >;

  return events.map((event) => ({
    title: event.title,
    slug: event.slug,
    date: event.date,
    time: event.time,
    location: event.location,
    capacity: event.capacity,
    attendeeCount: event.attendeeCount,
    status: event.status
  }));
}

export function formatPublicEventDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);
}

export function buildPublicEventMetadata(event: PublicEvent) {
  const remainingSeats = Math.max(event.capacity - event.attendeeCount, 0);
  const description = `${event.description.slice(0, 160)}${event.description.length > 160 ? "..." : ""}`;

  return {
    title: `${event.title} | Event Registration`,
    description: `${description} ${remainingSeats} seat${remainingSeats === 1 ? "" : "s"} left.`,
    openGraph: {
      title: event.title,
      description: `${description} ${remainingSeats} seat${remainingSeats === 1 ? "" : "s"} left.`,
      type: "website",
      url: `/events/${event.slug}`
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description: `${description} ${remainingSeats} seat${remainingSeats === 1 ? "" : "s"} left.`
    }
  };
}
