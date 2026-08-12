import { env } from './env';

export interface CircuitBreakerConfig {
  name: string;
  timeout: number;
  errorThresholdPercentage: number;
  volumeThreshold: number;
  resetTimeout: number;
  rollingWindow: number;
  enableFallback: boolean;
}

export type CircuitBreakerPreset = 'conservative' | 'normal' | 'aggressive';

const PRESET_CONFIGS: Record<CircuitBreakerPreset, Partial<CircuitBreakerConfig>> = {
  conservative: {
    errorThresholdPercentage: 30,
    volumeThreshold: 50,
    resetTimeout: 60000,
    rollingWindow: 20000,
  },
  normal: {
    errorThresholdPercentage: 50,
    volumeThreshold: 20,
    resetTimeout: 30000,
    rollingWindow: 10000,
  },
  aggressive: {
    errorThresholdPercentage: 70,
    volumeThreshold: 10,
    resetTimeout: 15000,
    rollingWindow: 5000,
  },
};

export function createCircuitBreakerConfig(
  name: string,
  preset: CircuitBreakerPreset = 'normal',
  overrides?: Partial<CircuitBreakerConfig>,
): CircuitBreakerConfig {
  const baseConfig = PRESET_CONFIGS[preset];

  const config: CircuitBreakerConfig = {
    name,
    timeout: env.CIRCUIT_BREAKER_TIMEOUT_MS || 3000,
    errorThresholdPercentage: env.CIRCUIT_BREAKER_ERROR_THRESHOLD_PERCENTAGE || baseConfig.errorThresholdPercentage || 50,
    volumeThreshold: env.CIRCUIT_BREAKER_VOLUME_THRESHOLD || baseConfig.volumeThreshold || 20,
    resetTimeout: env.CIRCUIT_BREAKER_RESET_TIMEOUT_MS || baseConfig.resetTimeout || 30000,
    rollingWindow: env.CIRCUIT_BREAKER_ROLLING_WINDOW_MS || baseConfig.rollingWindow || 10000,
    enableFallback: env.CIRCUIT_BREAKER_ENABLE_FALLBACK !== false,
  };

  if (overrides) {
    Object.assign(config, overrides);
  }

  validateConfig(config);
  return config;
}

function validateConfig(config: CircuitBreakerConfig): void {
  if (config.timeout <= 0) {
    throw new Error(`[CircuitBreaker] Invalid timeout: ${config.timeout}ms (must be > 0)`);
  }

  if (config.errorThresholdPercentage < 0 || config.errorThresholdPercentage > 100) {
    throw new Error(
      `[CircuitBreaker] Invalid error threshold: ${config.errorThresholdPercentage}% (must be 0-100)`,
    );
  }

  if (config.volumeThreshold <= 0) {
    throw new Error(`[CircuitBreaker] Invalid volume threshold: ${config.volumeThreshold} (must be > 0)`);
  }

  if (config.resetTimeout <= 0) {
    throw new Error(`[CircuitBreaker] Invalid reset timeout: ${config.resetTimeout}ms (must be > 0)`);
  }

  if (config.rollingWindow <= 0) {
    throw new Error(`[CircuitBreaker] Invalid rolling window: ${config.rollingWindow}ms (must be > 0)`);
  }

  if (config.timeout >= config.resetTimeout) {
    console.warn(
      `[CircuitBreaker] Warning: request timeout (${config.timeout}ms) is >= reset timeout (${config.resetTimeout}ms)`,
    );
  }
}

export function getDefaultCircuitBreakerConfig(name: string): CircuitBreakerConfig {
  return createCircuitBreakerConfig(name);
}

export const CIRCUIT_BREAKER_PRESETS = {
  CONSERVATIVE: 'conservative' as const,
  NORMAL: 'normal' as const,
  AGGRESSIVE: 'aggressive' as const,
};
