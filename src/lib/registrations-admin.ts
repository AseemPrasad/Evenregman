import "server-only";

import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { RegistrationModel } from "@/models/Registration";
import { toObjectId, assertEventOwnership, AuthorizationError } from "@/lib/ownership";

export type RegistrationListItem = {
  id: string;
  status: string;
  registeredAt: Date;
  attendee: {
    id: string;
    name: string;
    email: string;
  };
};

export type RegistrationListResult = {
  total: number;
  page: number;
  limit: number;
  data: RegistrationListItem[];
};

export type RegistrationQueryOptions = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: "newest" | "oldest" | "alpha";
  status?: string | string[];
};

export async function getEventRegistrationsForHost(
  eventId: string | Types.ObjectId,
  hostId: string | Types.ObjectId,
  opts: RegistrationQueryOptions = {}
): Promise<RegistrationListResult> {
  await connectToDatabase();

  // assert ownership - will throw AuthorizationError if not owned
  await assertEventOwnership(eventId, hostId);

  const page = Math.max(1, Number(opts.page || 1));
  const limit = Math.min(200, Math.max(1, Number(opts.limit || 20)));
  const skip = (page - 1) * limit;

  const search = typeof opts.search === "string" && opts.search.trim() ? opts.search.trim() : null;

  const sortMode = opts.sort || "newest";
  let sortStage: Record<string, number> = { registeredAt: -1 };

  if (sortMode === "oldest") sortStage = { registeredAt: 1 };
  if (sortMode === "alpha") sortStage = { "attendee.name": 1 };

  const statusFilter = opts.status
    ? Array.isArray(opts.status)
      ? opts.status
      : [opts.status]
    : ["ACTIVE"];

  const matchStage: any = {
    eventId: toObjectId(eventId),
    status: { $in: statusFilter }
  };

  const pipeline: any[] = [
    { $match: matchStage },
    {
      $lookup: {
        from: "users",
        localField: "attendeeId",
        foreignField: "_id",
        as: "attendee"
      }
    },
    { $unwind: "$attendee" }
  ];

  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), "i");
    pipeline.push({
      $match: {
        $or: [{ "attendee.name": { $regex: regex } }, { "attendee.email": { $regex: regex } }]
      }
    });
  }

  pipeline.push(
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          { $sort: sortStage },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              status: 1,
              registeredAt: 1,
              "attendee._id": 1,
              "attendee.name": 1,
              "attendee.email": 1
            }
          }
        ]
      }
    },
    {
      $project: {
        total: { $arrayElemAt: ["$metadata.total", 0] },
        data: 1
      }
    }
  );

  const result = await RegistrationModel.aggregate(pipeline).allowDiskUse(true).exec();

  const total = (result?.[0]?.total as number) || 0;
  const rawData = (result?.[0]?.data || []) as any[];

  const data: RegistrationListItem[] = rawData.map((r) => ({
    id: r._id.toString(),
    status: r.status,
    registeredAt: r.registeredAt,
    attendee: {
      id: r.attendee._id.toString(),
      name: r.attendee.name,
      email: r.attendee.email
    }
  }));

  return {
    total,
    page,
    limit,
    data
  };
}
