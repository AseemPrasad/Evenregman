import "server-only";

import mongoose from "mongoose";

import { env } from "@/lib/env";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached = globalThis.mongooseCache ?? {
  conn: null,
  promise: null
};

if (process.env.NODE_ENV !== "production") {
  globalThis.mongooseCache = cached;
}

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export async function disconnectFromDatabase(): Promise<void> {
  cached.promise = null;

  if (cached.conn) {
    await mongoose.disconnect();
    cached.conn = null;
  }
}

export function getDatabaseConnectionState() {
  return {
    connected: Boolean(cached.conn),
    connecting: Boolean(cached.promise)
  };
}