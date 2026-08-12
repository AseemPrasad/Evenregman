import { connectToDatabase } from './db';
import { env } from './env';
import { FallbackContext } from './fallback-strategies';

export interface FallbackQueueItem {
  _id?: string;
  serviceName: string;
  operationName: string;
  requestData: any;
  error: string;
  metadata?: Record<string, any>;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date;
  createdAt: Date;
  updatedAt: Date;
  processedAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

const collectionName = 'fallback_queue';

export class FallbackQueueService {
  async enqueueFallback(context: FallbackContext, maxRetries: number = 5): Promise<string> {
    await connectToDatabase();

    const now = new Date();
    const item: FallbackQueueItem = {
      serviceName: context.serviceName,
      operationName: context.operationName,
      requestData: context.requestData,
      error: context.error.message,
      metadata: context.metadata,
      retryCount: 0,
      maxRetries,
      nextRetryAt: new Date(now.getTime() + 60000),
      createdAt: now,
      updatedAt: now,
      status: 'pending',
    };

    try {
      const db = await connectToDatabase();
      const collection = db.collection(collectionName);
      const result = await collection.insertOne(item);
      return result.insertedId.toString();
    } catch (err) {
      console.error('[FallbackQueue] Error enqueuing fallback:', err);
      throw err;
    }
  }

  async dequeueFallbacks(serviceName?: string, limit: number = 10): Promise<FallbackQueueItem[]> {
    await connectToDatabase();

    try {
      const db = await connectToDatabase();
      const collection = db.collection(collectionName);

      const filter: any = {
        status: 'pending',
        nextRetryAt: { $lte: new Date() },
      };

      if (serviceName) {
        filter.serviceName = serviceName;
      }

      const items = await collection
        .find(filter)
        .sort({ nextRetryAt: 1 })
        .limit(limit)
        .toArray();

      return items as FallbackQueueItem[];
    } catch (err) {
      console.error('[FallbackQueue] Error dequeueing fallbacks:', err);
      throw err;
    }
  }

  async markAsProcessing(itemId: string): Promise<void> {
    await connectToDatabase();

    try {
      const db = await connectToDatabase();
      const collection = db.collection(collectionName);
      await collection.updateOne(
        { _id: itemId },
        { $set: { status: 'processing', updatedAt: new Date() } },
      );
    } catch (err) {
      console.error('[FallbackQueue] Error marking as processing:', err);
      throw err;
    }
  }

  async markAsCompleted(itemId: string): Promise<void> {
    await connectToDatabase();

    try {
      const db = await connectToDatabase();
      const collection = db.collection(collectionName);
      await collection.updateOne(
        { _id: itemId },
        { $set: { status: 'completed', processedAt: new Date(), updatedAt: new Date() } },
      );
    } catch (err) {
      console.error('[FallbackQueue] Error marking as completed:', err);
      throw err;
    }
  }

  async markAsFailed(itemId: string, error: string): Promise<boolean> {
    await connectToDatabase();

    try {
      const db = await connectToDatabase();
      const collection = db.collection(collectionName);

      const item = (await collection.findOne({ _id: itemId })) as FallbackQueueItem | null;

      if (!item) {
        return false;
      }

      const retryCount = (item.retryCount || 0) + 1;

      if (retryCount >= item.maxRetries) {
        await collection.updateOne(
          { _id: itemId },
          {
            $set: {
              status: 'failed',
              error,
              retryCount,
              updatedAt: new Date(),
            },
          },
        );
        return false;
      }

      const nextRetryDelay = Math.min(60000 * Math.pow(2, retryCount - 1), 3600000);
      await collection.updateOne(
        { _id: itemId },
        {
          $set: {
            status: 'pending',
            error,
            retryCount,
            nextRetryAt: new Date(Date.now() + nextRetryDelay),
            updatedAt: new Date(),
          },
        },
      );
      return true;
    } catch (err) {
      console.error('[FallbackQueue] Error marking as failed:', err);
      throw err;
    }
  }

  async getQueueStats(serviceName?: string): Promise<Record<string, number>> {
    await connectToDatabase();

    try {
      const db = await connectToDatabase();
      const collection = db.collection(collectionName);

      const filter: any = {};
      if (serviceName) {
        filter.serviceName = serviceName;
      }

      const stats = {
        pending: await collection.countDocuments({ ...filter, status: 'pending' }),
        processing: await collection.countDocuments({ ...filter, status: 'processing' }),
        completed: await collection.countDocuments({ ...filter, status: 'completed' }),
        failed: await collection.countDocuments({ ...filter, status: 'failed' }),
      };

      return stats;
    } catch (err) {
      console.error('[FallbackQueue] Error getting stats:', err);
      throw err;
    }
  }

  async cleanupExpired(): Promise<number> {
    await connectToDatabase();

    const retentionDays = env.CIRCUIT_BREAKER_FALLBACK_QUEUE_RETENTION_DAYS || 7;
    const expirationDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    try {
      const db = await connectToDatabase();
      const collection = db.collection(collectionName);

      const result = await collection.deleteMany({
        createdAt: { $lt: expirationDate },
        status: { $in: ['completed', 'failed'] },
      });

      return result.deletedCount || 0;
    } catch (err) {
      console.error('[FallbackQueue] Error cleaning up expired items:', err);
      throw err;
    }
  }
}

export const fallbackQueueService = new FallbackQueueService();
