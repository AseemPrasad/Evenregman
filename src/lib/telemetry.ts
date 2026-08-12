import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { Tracer, TracerProvider, NoopTracerProvider, trace } from '@opentelemetry/api';
import { env } from './env';

let tracerInstance: Tracer | null = null;
let tracerProviderInstance: TracerProvider | null = null;

function isTracingEnabled(): boolean {
  return env.ENABLE_OTEL_TRACING === true;
}

function createTracerProvider(): TracerProvider {
  if (!isTracingEnabled()) {
    return new NoopTracerProvider();
  }

  const resource = Resource.default().merge(
    new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: env.OTEL_SERVICE_NAME || 'evenregman',
      [SemanticResourceAttributes.SERVICE_VERSION]: env.OTEL_SERVICE_VERSION || '1.0.0',
      environment: env.NODE_ENV || 'development',
    }),
  );

  const exporter = new OTLPTraceExporter({
    url: env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter: exporter,
    instrumentations: [getNodeAutoInstrumentations()],
    sampler: {
      shouldSample: () => {
        const sampleRate = parseFloat(env.OTEL_SAMPLE_RATE || '1.0');
        return Math.random() < sampleRate;
      },
      toString: () => `ProbabilitySampler{${env.OTEL_SAMPLE_RATE || '1.0'}}`,
    },
  });

  return sdk.start();
}

export function getTracerProvider(): TracerProvider {
  if (!tracerProviderInstance) {
    tracerProviderInstance = createTracerProvider();
  }
  return tracerProviderInstance;
}

export function getTracer(name: string = 'evenregman'): Tracer {
  if (!tracerInstance) {
    const provider = getTracerProvider();
    tracerInstance = provider.getTracer(name);
  }
  return tracerInstance;
}

export function initializeTracing(): void {
  if (isTracingEnabled()) {
    getTracerProvider();
  }
}

export async function shutdownTracing(): Promise<void> {
  if (tracerProviderInstance && !(tracerProviderInstance instanceof NoopTracerProvider)) {
    try {
      await (tracerProviderInstance as any).shutdown?.();
    } catch (err) {
      console.error('[OTel] Tracer shutdown error:', err);
    }
  }
}

export { trace };
