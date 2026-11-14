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
    }).then(async (m) => {
      // Production pre-flight check for MongoDB Replica Set support
      try {
        const adminDb = m.connection.db?.admin();
        if (adminDb) {
          const status = await adminDb.command({ serverStatus: 1 });
          if (!status.repl) {
            console.warn(
              "[DB] ⚠️ WARNING: Connected to a standalone MongoDB node without a replica set (replSet). " +
              "Multi-document ACID transactions and Change Streams require a replica set in production (e.g. MongoDB Atlas or rs.initiate())."
            );
          }
        }
      } catch {
        // Silently pass if restricted by permission
      }
      return m;
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
