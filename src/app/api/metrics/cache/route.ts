import "server-only";

import { getCacheStats, resetCacheStats } from "@/lib/cache-service";
import { getCompressionStats, resetCompressionStats } from "@/lib/cache-compression";
import { env } from "@/lib/env";

export async function GET(req: Request) {
  if (env.ENABLE_L2_CACHE !== "true") {
    return new Response(
      JSON.stringify({ error: "Cache disabled" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const cacheStats = getCacheStats();
    const compressionStats = getCompressionStats();

    const response = {
      cache: {
        enabled: true,
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        writes: cacheStats.writes,
        deletes: cacheStats.deletes,
        errors: cacheStats.errors,
        hitRate: cacheStats.hitRate,
        total: cacheStats.total
      },
      compression: {
        totalCompressions: compressionStats.totalCompressions,
        totalDecompressions: compressionStats.totalDecompressions,
        totalOriginalBytes: compressionStats.totalOriginalBytes,
        totalCompressedBytes: compressionStats.totalCompressedBytes,
        averageCompressionRatio: compressionStats.averageCompressionRatio,
        compressionErrors: compressionStats.compressionErrors,
        bytesSaved: compressionStats.spacesSaved
      },
      timestamp: new Date()
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to fetch cache metrics" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function DELETE(req: Request) {
  if (env.ENABLE_L2_CACHE !== "true") {
    return new Response(
      JSON.stringify({ error: "Cache disabled" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    resetCacheStats();
    resetCompressionStats();

    return new Response(
      JSON.stringify({ message: "Cache metrics reset successfully" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to reset cache metrics" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
