import "server-only";

import * as zlib from "zlib";
import { promisify } from "util";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface CompressionStats {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  compressed: boolean;
  compressionTime: number;
}

let compressionStats = {
  totalCompressions: 0,
  totalDecompressions: 0,
  totalOriginalBytes: 0,
  totalCompressedBytes: 0,
  compressionErrors: 0
};

export async function compressData(data: string): Promise<{ buffer: Buffer; stats: CompressionStats }> {
  const originalSize = Buffer.byteLength(data, "utf-8");
  const startTime = Date.now();

  try {
    const compressedBuffer = await gzip(data);
    const compressedSize = compressedBuffer.length;
    const compressionTime = Date.now() - startTime;

    const compressionRatio = (compressedSize / originalSize) * 100;
    const shouldCompress = compressionRatio < 80;

    compressionStats.totalCompressions++;
    compressionStats.totalOriginalBytes += originalSize;
    if (shouldCompress) {
      compressionStats.totalCompressedBytes += compressedSize;
    }

    return {
      buffer: shouldCompress ? compressedBuffer : Buffer.from(data),
      stats: {
        originalSize,
        compressedSize: shouldCompress ? compressedSize : originalSize,
        compressionRatio: Math.round(compressionRatio * 100) / 100,
        compressed: shouldCompress,
        compressionTime
      }
    };
  } catch (err) {
    console.error("[Compression] Error compressing data:", err);
    compressionStats.compressionErrors++;

    return {
      buffer: Buffer.from(data),
      stats: {
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 100,
        compressed: false,
        compressionTime: Date.now() - startTime
      }
    };
  }
}

export async function decompressData(buffer: Buffer, isCompressed: boolean): Promise<string> {
  const startTime = Date.now();

  try {
    if (!isCompressed) {
      return buffer.toString("utf-8");
    }

    const decompressedBuffer = await gunzip(buffer);
    compressionStats.totalDecompressions++;

    return decompressedBuffer.toString("utf-8");
  } catch (err) {
    console.error("[Compression] Error decompressing data:", err);
    compressionStats.compressionErrors++;

    return buffer.toString("utf-8");
  }
}

export function getCompressionStats() {
  const avgCompressionRatio =
    compressionStats.totalCompressions > 0
      ? (compressionStats.totalCompressedBytes / compressionStats.totalOriginalBytes) * 100
      : 0;

  return {
    totalCompressions: compressionStats.totalCompressions,
    totalDecompressions: compressionStats.totalDecompressions,
    totalOriginalBytes: compressionStats.totalOriginalBytes,
    totalCompressedBytes: compressionStats.totalCompressedBytes,
    averageCompressionRatio: Math.round(avgCompressionRatio * 100) / 100,
    compressionErrors: compressionStats.compressionErrors,
    spacesSaved: compressionStats.totalOriginalBytes - compressionStats.totalCompressedBytes
  };
}

export function resetCompressionStats(): void {
  compressionStats = {
    totalCompressions: 0,
    totalDecompressions: 0,
    totalOriginalBytes: 0,
    totalCompressedBytes: 0,
    compressionErrors: 0
  };
}

export function smartSerialize(data: any): string {
  try {
    if (data === null || data === undefined) {
      return "";
    }

    if (typeof data === "string") {
      return data;
    }

    return JSON.stringify(data);
  } catch (err) {
    console.error("[Serialization] Error serializing data:", err);
    return "";
  }
}

export function smartDeserialize<T = any>(data: string): T | null {
  try {
    if (!data) {
      return null;
    }

    return JSON.parse(data) as T;
  } catch (err) {
    console.error("[Serialization] Error deserializing data:", err);
    return null;
  }
}

export function stripNonEssentialFields(data: any, essentialFields: string[]): any {
  if (typeof data !== "object" || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => stripNonEssentialFields(item, essentialFields));
  }

  const stripped: any = {};
  for (const field of essentialFields) {
    if (field in data) {
      stripped[field] = data[field];
    }
  }

  return stripped;
}
