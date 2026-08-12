import "server-only";

import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { EventModel, type Event, type EventStatus } from "@/models/Event";
import { RegistrationModel } from "@/models/Registration";
import { env } from "@/lib/env";
import { analyticsMetricsCalculator } from "@/lib/analytics-metrics";

export type HostDashboardStats = {
  totalEvents: number;
  activeEvents: number;
  closedEvents: number;
  totalRegistrations: number;
};

export type HostEventRow = {
  id: string;
  title: string;
  slug: string;
  date: Date;
  time: string;
  location: string;
  capacity: number;
  attendeeCount: number;
  status: EventStatus;
  registrationCount: number;
};

export async function getHostDashboardData(hostId: string) {
  await connectToDatabase();

  // If CDC pipeline enabled, use pre-aggregated analytics
  if (env.ENABLE_CDC_PIPELINE) {
    try {
      return await getHostDashboardDataFromAnalytics(hostId);
    } catch (err) {
      console.warn(
        "[Dashboard] Error fetching from analytics, falling back to on-demand:",
        err,
      );
    }
  }

  // Fallback to on-demand aggregation
  return await getHostDashboardDataOnDemand(hostId);
}

async function getHostDashboardDataFromAnalytics(hostId: string) {
  const metrics = await analyticsMetricsCalculator.calculateHostDashboardMetrics(hostId);

  const events = (await EventModel.find({ hostId })
    .sort({ createdAt: -1 })
    .select({
      _id: 1,
      title: 1,
      slug: 1,
      date: 1,
      time: 1,
      location: 1,
      capacity: 1,
      attendeeCount: 1,
      status: 1,
    })
    .lean()) as unknown as Array<
    Pick<
      Event,
      "_id" | "title" | "slug" | "date" | "time" | "location" | "capacity" | "attendeeCount" | "status"
    >
  >;

  const rows: HostEventRow[] = events.map((event) => ({
    id: event._id.toString(),
    title: event.title,
    slug: event.slug,
    date: event.date,
    time: event.time,
    location: event.location,
    capacity: event.capacity,
    attendeeCount: event.attendeeCount,
    status: event.status,
    registrationCount: metrics.totalRegistrations,
  }));

  return {
    stats: {
      totalEvents: events.length,
      activeEvents: events.filter((e) => e.status === "OPEN").length,
      closedEvents: events.filter((e) => e.status === "CLOSED").length,
      totalRegistrations: metrics.totalRegistrations,
    },
    events: rows,
  };
}

async function getHostDashboardDataOnDemand(hostId: string) {

  const hostObjectId = new Types.ObjectId(hostId);

  const [statsAggregate] = await EventModel.aggregate<{ counts?: HostDashboardStats[] }>([
    { $match: { hostId: hostObjectId } },
    {
      $facet: {
        counts: [
          {
            $group: {
              _id: null,
              totalEvents: { $sum: 1 },
              activeEvents: {
                $sum: { $cond: [{ $eq: ["$status", "OPEN"] }, 1, 0] }
              },
              closedEvents: {
                $sum: { $cond: [{ $eq: ["$status", "CLOSED"] }, 1, 0] }
              }
            }
          }
        ]
      }
    }
  ]);

  const registrationsByEvent = await RegistrationModel.aggregate<{
    _id: string;
    registrationCount: number;
  }>([
    { $match: { status: "ACTIVE" } },
    {
      $lookup: {
        from: "events",
        localField: "eventId",
        foreignField: "_id",
        as: "event"
      }
    },
    { $unwind: "$event" },
    { $match: { "event.hostId": hostObjectId } },
    {
      $group: {
        _id: "$eventId",
        registrationCount: { $sum: 1 }
      }
    }
  ]);

  const registrationCountMap = new Map(
    registrationsByEvent.map((item) => [item._id.toString(), item.registrationCount])
  );

  const events = (await EventModel.find({ hostId })
    .sort({ createdAt: -1 })
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
    .lean()) as unknown as Array<
    Pick<
      Event,
      "_id" | "title" | "slug" | "date" | "time" | "location" | "capacity" | "attendeeCount" | "status"
    >
  >;

  const stats: HostDashboardStats = statsAggregate?.counts?.[0] ?? {
    totalEvents: 0,
    activeEvents: 0,
    closedEvents: 0,
    totalRegistrations: 0
  };

  const totalRegistrations = registrationsByEvent.reduce(
    (sum, item) => sum + item.registrationCount,
    0
  );

  const rows: HostEventRow[] = events.map((event) => ({
    id: event._id.toString(),
    title: event.title,
    slug: event.slug,
    date: event.date,
    time: event.time,
    location: event.location,
    capacity: event.capacity,
    attendeeCount: event.attendeeCount,
    status: event.status,
    registrationCount: registrationCountMap.get(event._id.toString()) ?? 0
  }));

  return {
    stats: {
      ...stats,
      totalRegistrations
    },
    events: rows
  };
}
