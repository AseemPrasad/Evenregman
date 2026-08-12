import "server-only";

import { logAuditEventAsync } from "@/lib/audit-logger";
import { env } from "@/lib/env";
import type { AuditAction, AuditTargetType } from "@/models/AuditLog";
import type { Types } from "mongoose";

export interface AuditInterceptorOptions {
  action: AuditAction;
  targetType: AuditTargetType;
  targetIdExtractor?: (result: any, ...args: any[]) => string | Types.ObjectId;
  orgIdExtractor?: (result: any, ...args: any[]) => Types.ObjectId | string;
  beforeExtractor?: (result: any, ...args: any[]) => Promise<any>;
  afterExtractor?: (result: any, ...args: any[]) => any;
}

export function withAuditLogging<T extends any[], R>(
  action: (...args: T) => Promise<R>,
  options: AuditInterceptorOptions,
  getUserId?: (...args: T) => Promise<Types.ObjectId | string> | Types.ObjectId | string
) {
  return async (...args: T): Promise<R> => {
    let before: any = undefined;
    let after: any = undefined;
    let targetId: string | undefined;
    let orgId: string | Types.ObjectId | undefined;

    if (env.ENABLE_RBAC_ENGINE === "true") {
      try {
        if (options.beforeExtractor) {
          before = await options.beforeExtractor(undefined, ...args);
        }
      } catch (err) {
        console.error("[AuditInterceptor] Error in beforeExtractor:", err);
      }
    }

    const result = await action(...args);

    if (env.ENABLE_RBAC_ENGINE === "true") {
      try {
        const userId = getUserId ? await Promise.resolve(getUserId(...args)) : undefined;

        if (options.targetIdExtractor) {
          targetId = options.targetIdExtractor(result, ...args).toString();
        }

        if (options.orgIdExtractor) {
          orgId = options.orgIdExtractor(result, ...args);
        }

        if (options.afterExtractor) {
          after = options.afterExtractor(result, ...args);
        }

        if (targetId && orgId) {
          await logAuditEventAsync({
            actorId: userId,
            action: options.action,
            targetType: options.targetType,
            targetId,
            targetOrgId: orgId,
            before,
            after,
            context: { timestamp: new Date().toISOString() }
          });
        }
      } catch (err) {
        console.error("[AuditInterceptor] Error in audit logging:", err);
      }
    }

    return result;
  };
}

export function createAuditEventWrapper(
  getUserId: (args: any[]) => Promise<Types.ObjectId | string> | Types.ObjectId | string,
  options: AuditInterceptorOptions
) {
  return function <T extends any[], R>(action: (...args: T) => Promise<R>) {
    return withAuditLogging(action, options, () => getUserId((arguments as any)[0]));
  };
}
