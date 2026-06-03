import "server-only";

import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { type EventStatus } from "@/models/Event";
import { RegistrationModel, type RegistrationStatus } from "@/models/Registration";

export type AttendeeRegistrationRow = {
  id: string;
  status: RegistrationStatus;
  registeredAt: Date;
  cancelledAt: Date | null;
  event: {
    id: string;
    slug: string;
    title: string;
    date: Date;
    time: string;
    location: string;
    status: EventStatus;
  };
};

export type AttendeeDashboardStats = {
  totalRegistrations: number;
  activeRegistrations: number;
  cancelledRegistrations: number;
};

export type AttendeeDashboardData = {
  stats: AttendeeDashboardStats;
  registrations: AttendeeRegistrationRow[];
};

export async function getAttendeeDashboardData(attendeeId: string): Promise<AttendeeDashboardData> {
  await connectToDatabase();

  const attendeeObjectId = new Types.ObjectId(attendeeId);

  const registrations = await RegistrationModel.aggregate<{
    _id: Types.ObjectId;
    status: RegistrationStatus;
    registeredAt: Date;
    cancelledAt: Date | null;
    event: {
      _id: Types.ObjectId;
      slug: string;
      title: string;
      date: Date;
      time: string;
      location: string;
      status: EventStatus;
    };
  }>([
    { $match: { attendeeId: attendeeObjectId } },
    {
      $lookup: {
        from: "events",
        localField: "eventId",
        foreignField: "_id",
        as: "event"
      }
    },
    { $unwind: "$event" },
    {
      $project: {
        _id: 1,
        status: 1,
        registeredAt: 1,
        cancelledAt: 1,
        "event._id": 1,
        "event.slug": 1,
        "event.title": 1,
        "event.date": 1,
        "event.time": 1,
        "event.location": 1,
        "event.status": 1
      }
    },
    { $sort: { registeredAt: -1 } }
  ]);

  const stats: AttendeeDashboardStats = {
    totalRegistrations: registrations.length,
    activeRegistrations: registrations.filter((item) => item.status === "ACTIVE").length,
    cancelledRegistrations: registrations.filter((item) => item.status === "CANCELLED").length
  };

  return {
    stats,
    registrations: registrations.map((item) => ({
      id: item._id.toString(),
      status: item.status,
      registeredAt: item.registeredAt,
      cancelledAt: item.cancelledAt ?? null,
      event: {
        id: item.event._id.toString(),
        slug: item.event.slug,
        title: item.event.title,
        date: item.event.date,
        time: item.event.time,
        location: item.event.location,
        status: item.event.status
      }
    }))
  };
}
