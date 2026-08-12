import "server-only";

type MetricsCollector = {
  recordRegistrationAttempt(path: "atomic" | "legacy"): void;
  recordRegistrationSuccess(path: "atomic" | "legacy", accountState: "created" | "reused"): void;
  recordRegistrationFailure(path: "atomic" | "legacy", reason: string): void;
  recordRedisOperation(operation: "check-decrement" | "rollback", success: boolean, latencyMs: number): void;
  recordRedisFallback(eventId: string, reason: string): void;
  recordCompensationAttempt(eventId: string, success: boolean): void;
  getMetrics(): MetricsSnapshot;
  reset(): void;
};

type MetricsSnapshot = {
  registrations: {
    atomic: {
      attempts: number;
      succeeded: number;
      failed: number;
      successRate: number;
      accountsCreated: number;
      accountsReused: number;
    };
    legacy: {
      attempts: number;
      succeeded: number;
      failed: number;
      successRate: number;
      accountsCreated: number;
      accountsReused: number;
    };
  };
  redis: {
    checkDecrement: {
      attempts: number;
      succeeded: number;
      failed: number;
      successRate: number;
      avgLatencyMs: number;
    };
    rollback: {
      attempts: number;
      succeeded: number;
      failed: number;
      successRate: number;
      avgLatencyMs: number;
    };
    fallbacks: number;
    compensationSucceeded: number;
    compensationFailed: number;
  };
  timestamp: Date;
};

class InMemoryMetricsCollector implements MetricsCollector {
  private data = {
    registrations: {
      atomic: {
        attempts: 0,
        succeeded: 0,
        failed: 0,
        accountsCreated: 0,
        accountsReused: 0
      },
      legacy: {
        attempts: 0,
        succeeded: 0,
        failed: 0,
        accountsCreated: 0,
        accountsReused: 0
      }
    },
    redis: {
      checkDecrement: {
        attempts: 0,
        succeeded: 0,
        failed: 0,
        latencies: [] as number[]
      },
      rollback: {
        attempts: 0,
        succeeded: 0,
        failed: 0,
        latencies: [] as number[]
      },
      fallbacks: 0,
      compensationSucceeded: 0,
      compensationFailed: 0
    }
  };

  recordRegistrationAttempt(path: "atomic" | "legacy") {
    this.data.registrations[path].attempts += 1;
  }

  recordRegistrationSuccess(path: "atomic" | "legacy", accountState: "created" | "reused") {
    this.data.registrations[path].succeeded += 1;
    if (accountState === "created") {
      this.data.registrations[path].accountsCreated += 1;
    } else {
      this.data.registrations[path].accountsReused += 1;
    }
  }

  recordRegistrationFailure(path: "atomic" | "legacy", reason: string) {
    this.data.registrations[path].failed += 1;
  }

  recordRedisOperation(operation: "check-decrement" | "rollback", success: boolean, latencyMs: number) {
    const key = operation === "check-decrement" ? "checkDecrement" : "rollback";
    this.data.redis[key].attempts += 1;

    if (success) {
      this.data.redis[key].succeeded += 1;
    } else {
      this.data.redis[key].failed += 1;
    }

    this.data.redis[key].latencies.push(latencyMs);
  }

  recordRedisFallback(eventId: string, reason: string) {
    this.data.redis.fallbacks += 1;
  }

  recordCompensationAttempt(eventId: string, success: boolean) {
    if (success) {
      this.data.redis.compensationSucceeded += 1;
    } else {
      this.data.redis.compensationFailed += 1;
    }
  }

  getMetrics(): MetricsSnapshot {
    const atomicReg = this.data.registrations.atomic;
    const legacyReg = this.data.registrations.legacy;
    const checkDec = this.data.redis.checkDecrement;
    const rollback = this.data.redis.rollback;

    return {
      registrations: {
        atomic: {
          attempts: atomicReg.attempts,
          succeeded: atomicReg.succeeded,
          failed: atomicReg.failed,
          successRate: atomicReg.attempts > 0 ? (atomicReg.succeeded / atomicReg.attempts) * 100 : 0,
          accountsCreated: atomicReg.accountsCreated,
          accountsReused: atomicReg.accountsReused
        },
        legacy: {
          attempts: legacyReg.attempts,
          succeeded: legacyReg.succeeded,
          failed: legacyReg.failed,
          successRate: legacyReg.attempts > 0 ? (legacyReg.succeeded / legacyReg.attempts) * 100 : 0,
          accountsCreated: legacyReg.accountsCreated,
          accountsReused: legacyReg.accountsReused
        }
      },
      redis: {
        checkDecrement: {
          attempts: checkDec.attempts,
          succeeded: checkDec.succeeded,
          failed: checkDec.failed,
          successRate: checkDec.attempts > 0 ? (checkDec.succeeded / checkDec.attempts) * 100 : 0,
          avgLatencyMs: checkDec.latencies.length > 0
            ? checkDec.latencies.reduce((a, b) => a + b, 0) / checkDec.latencies.length
            : 0
        },
        rollback: {
          attempts: rollback.attempts,
          succeeded: rollback.succeeded,
          failed: rollback.failed,
          successRate: rollback.attempts > 0 ? (rollback.succeeded / rollback.attempts) * 100 : 0,
          avgLatencyMs: rollback.latencies.length > 0
            ? rollback.latencies.reduce((a, b) => a + b, 0) / rollback.latencies.length
            : 0
        },
        fallbacks: this.data.redis.fallbacks,
        compensationSucceeded: this.data.redis.compensationSucceeded,
        compensationFailed: this.data.redis.compensationFailed
      },
      timestamp: new Date()
    };
  }

  reset() {
    this.data = {
      registrations: {
        atomic: {
          attempts: 0,
          succeeded: 0,
          failed: 0,
          accountsCreated: 0,
          accountsReused: 0
        },
        legacy: {
          attempts: 0,
          succeeded: 0,
          failed: 0,
          accountsCreated: 0,
          accountsReused: 0
        }
      },
      redis: {
        checkDecrement: {
          attempts: 0,
          succeeded: 0,
          failed: 0,
          latencies: []
        },
        rollback: {
          attempts: 0,
          succeeded: 0,
          failed: 0,
          latencies: []
        },
        fallbacks: 0,
        compensationSucceeded: 0,
        compensationFailed: 0
      }
    };
  }
}

export const metricsCollector = new InMemoryMetricsCollector();
