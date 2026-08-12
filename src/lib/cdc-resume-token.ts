import { connectToDatabase } from "./db";
import { env } from "./env";

export interface ResumeTokenData {
  token: string;
  timestamp: Date;
  collectionName: string;
  schemaVersion: number;
}

class ResumeTokenManager {
  private tokenCache = new Map<string, ResumeTokenData>();
  private readonly storage: "redis" | "mongodb";
  private readonly maxTokenAgeSeconds: number;

  constructor() {
    this.storage = (env.CDC_RESUME_TOKEN_STORAGE as "redis" | "mongodb") || "redis";
    this.maxTokenAgeSeconds = parseInt(env.CDC_MAX_RESUME_TOKEN_AGE_SECONDS || "604800");
  }

  async saveToken(collectionName: string, token: string): Promise<void> {
    const data: ResumeTokenData = {
      token,
      timestamp: new Date(),
      collectionName,
      schemaVersion: 1,
    };

    this.tokenCache.set(collectionName, data);

    if (this.storage === "mongodb") {
      await this.saveToMongoDB(collectionName, data);
    } else {
      await this.saveToRedis(collectionName, data);
    }
  }

  async loadToken(collectionName: string): Promise<string | null> {
    // Check cache first
    const cached = this.tokenCache.get(collectionName);
    if (cached) {
      if (this.isTokenFresh(cached)) {
        return cached.token;
      }
      this.tokenCache.delete(collectionName);
    }

    // Load from storage
    const data = await this.loadFromStorage(collectionName);

    if (!data) {
      console.log(`[ResumeToken] No token found for ${collectionName}, starting fresh`);
      return null;
    }

    if (!this.isTokenFresh(data)) {
      console.warn(
        `[ResumeToken] Token for ${collectionName} is stale (${this.getTokenAgeDays(data)} days), starting fresh`,
      );
      await this.deleteToken(collectionName);
      return null;
    }

    this.tokenCache.set(collectionName, data);
    return data.token;
  }

  private isTokenFresh(data: ResumeTokenData): boolean {
    const ageSeconds = (Date.now() - data.timestamp.getTime()) / 1000;
    return ageSeconds < this.maxTokenAgeSeconds;
  }

  private getTokenAgeDays(data: ResumeTokenData): number {
    const ageSeconds = (Date.now() - data.timestamp.getTime()) / 1000;
    return Math.floor(ageSeconds / 86400);
  }

  private async saveToMongoDB(collectionName: string, data: ResumeTokenData): Promise<void> {
    try {
      const db = await connectToDatabase();
      const collection = db.collection("cdc_resume_tokens");

      await collection.updateOne(
        { collectionName },
        { $set: data },
        { upsert: true },
      );
    } catch (err) {
      console.error("[ResumeToken] Error saving to MongoDB:", err);
    }
  }

  private async saveToRedis(collectionName: string, data: ResumeTokenData): Promise<void> {
    try {
      // Redis support would be implemented here
      // For now, fallback to MongoDB if Redis not available
      await this.saveToMongoDB(collectionName, data);
    } catch (err) {
      console.error("[ResumeToken] Error saving to Redis:", err);
    }
  }

  private async loadFromStorage(collectionName: string): Promise<ResumeTokenData | null> {
    try {
      if (this.storage === "mongodb") {
        const db = await connectToDatabase();
        const collection = db.collection("cdc_resume_tokens");

        const doc = await collection.findOne({ collectionName });
        return doc as ResumeTokenData | null;
      } else {
        // Redis support would be implemented here
        const db = await connectToDatabase();
        const collection = db.collection("cdc_resume_tokens");
        const doc = await collection.findOne({ collectionName });
        return doc as ResumeTokenData | null;
      }
    } catch (err) {
      console.error("[ResumeToken] Error loading from storage:", err);
      return null;
    }
  }

  async deleteToken(collectionName: string): Promise<void> {
    this.tokenCache.delete(collectionName);

    try {
      const db = await connectToDatabase();
      const collection = db.collection("cdc_resume_tokens");
      await collection.deleteOne({ collectionName });
    } catch (err) {
      console.error("[ResumeToken] Error deleting token:", err);
    }
  }

  async clearAllTokens(): Promise<void> {
    this.tokenCache.clear();

    try {
      const db = await connectToDatabase();
      const collection = db.collection("cdc_resume_tokens");
      await collection.deleteMany({});
    } catch (err) {
      console.error("[ResumeToken] Error clearing all tokens:", err);
    }
  }

  getStorageType(): string {
    return this.storage;
  }

  getMaxTokenAge(): string {
    return `${Math.floor(this.maxTokenAgeSeconds / 86400)} days`;
  }
}

export const resumeTokenManager = new ResumeTokenManager();
