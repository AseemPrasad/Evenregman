import "server-only";

import { isValidObjectId, Types } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { EventModel, type Event } from "@/models/Event";
import { RegistrationModel, type Registration } from "@/models/Registration";

export class AuthorizationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.statusCode = statusCode;
  }
}

export function toObjectId(value: string | Types.ObjectId): Types.ObjectId {
  if (value instanceof Types.ObjectId) {
    return value;
  }

  if (!isValidObjectId(value)) {
    throw new AuthorizationError("Invalid identifier", 400);
  }

  return new Types.ObjectId(value);
}

export async function assertEventOwnership(eventId: string | Types.ObjectId, hostId: string | Types.ObjectId) {
  await connectToDatabase();

  const ownedEvent = (await EventModel.findOne({
    _id: toObjectId(eventId),
    hostId: toObjectId(hostId)
  })
    .select({ _id: 1, hostId: 1 })
    .lean()) as Pick<Event, "_id" | "hostId"> | null;

  if (!ownedEvent) {
    throw new AuthorizationError("Forbidden", 403);
  }

  return ownedEvent;
}

export async function assertEventOwnershipBySlug(slug: string, hostId: string | Types.ObjectId) {
  await connectToDatabase();

  const ownedEvent = (await EventModel.findOne({
    slug: slug.trim().toLowerCase(),
    hostId: toObjectId(hostId)
  })
    .select({ _id: 1, hostId: 1 })
    .lean()) as Pick<Event, "_id" | "hostId"> | null;

  if (!ownedEvent) {
    throw new AuthorizationError("Forbidden", 403);
  }

  return ownedEvent;
}

export async function assertRegistrationOwnership(
  registrationId: string | Types.ObjectId,
  attendeeId: string | Types.ObjectId
) {
  await connectToDatabase();

  const ownedRegistration = (await RegistrationModel.findOne({
    _id: toObjectId(registrationId),
    attendeeId: toObjectId(attendeeId)
  })
    .select({ _id: 1, attendeeId: 1, eventId: 1, status: 1 })
    .lean()) as Pick<Registration, "_id" | "attendeeId" | "eventId" | "status"> | null;

  if (!ownedRegistration) {
    throw new AuthorizationError("Forbidden", 403);
  }

  return ownedRegistration;
}

export async function assertHostOwnsEventRegistration(
  eventId: string | Types.ObjectId,
  hostId: string | Types.ObjectId,
  registrationId: string | Types.ObjectId
) {
  await connectToDatabase();

  const ownedRegistration = (await RegistrationModel.findOne({
    _id: toObjectId(registrationId),
    eventId: toObjectId(eventId)
  })
    .populate({
      path: "eventId",
      match: { hostId: toObjectId(hostId) },
      select: { _id: 1, hostId: 1 }
    })
    .select({ _id: 1, attendeeId: 1, eventId: 1, status: 1 })
    .lean()) as
    | (Pick<Registration, "_id" | "attendeeId" | "eventId" | "status"> & { eventId?: Pick<Event, "_id" | "hostId"> })
    | null;

  if (!ownedRegistration || !ownedRegistration.eventId) {
    throw new AuthorizationError("Forbidden", 403);
  }

  return ownedRegistration;
}
