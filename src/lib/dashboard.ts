import "server-only";

import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { EventModel, type EventStatus } from "@/models/Event";
import { RegistrationModel } from "@/models/Registration";

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

  const hostObjectId = new Types.ObjectId(hostId);

  const [statsAggregate] = await EventModel.aggregate<HostDashboardStats>([
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

  const events = await EventModel.find({ hostId })
    .sort({ createdAt: -1 })
    .select({
      title: 1,
      slug: 1,
      date: 1,
      time: 1,
      location: 1,
      capacity: 1,
      attendeeCount: 1,
      status: 1
    })
    .lean();

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
