/**
 * Next.js Instrumentation Hook
 *
 * Called automatically by Next.js server at startup.
 * Initializes OpenTelemetry SDK and auto-instrumentations.
 *
 * Only activates when ENABLE_OTEL_TRACING=true.
 * Zero impact on existing server behavior when disabled.
 */

export async function register() {
  const { env } = await import('./lib/env');

  if (env.ENABLE_OTEL_TRACING !== true) {
    return;
  }

  try {
    await import('./lib/telemetry');
  } catch (err) {
    console.error('[OTel] Instrumentation initialization failed:', err);
  }
}
