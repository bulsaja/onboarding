export type CriticalFlow =
  | 'brief_to_plan'
  | 'content_generation_approval'
  | 'publish_delivery'
  | 'report_refresh';

export interface FlowSloDefinition {
  flow: CriticalFlow;
  p99LatencyMs: number;
  maxErrorRate: number;
  maxQueueDepth: number;
}

export interface FlowObservation {
  flow: CriticalFlow;
  observedAt: string;
  latencyMs: number;
  success: boolean;
  queueDepth: number;
}

export interface FlowSnapshot {
  flow: CriticalFlow;
  sampleCount: number;
  errorRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  maxQueueDepth: number;
}

export interface SloEvaluationResult {
  flow: CriticalFlow;
  met: boolean;
  snapshot: FlowSnapshot;
  breaches: string[];
}

export const defaultFlowSloDefinitions: FlowSloDefinition[] = [
  {
    flow: 'brief_to_plan',
    p99LatencyMs: 750,
    maxErrorRate: 0.02,
    maxQueueDepth: 25
  },
  {
    flow: 'content_generation_approval',
    p99LatencyMs: 900,
    maxErrorRate: 0.02,
    maxQueueDepth: 30
  },
  {
    flow: 'publish_delivery',
    p99LatencyMs: 1200,
    maxErrorRate: 0.03,
    maxQueueDepth: 35
  },
  {
    flow: 'report_refresh',
    p99LatencyMs: 2000,
    maxErrorRate: 0.02,
    maxQueueDepth: 20
  }
];

function assertIsoDatetime(value: string, label: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`${label} must be a valid ISO-8601 datetime`);
  }

  return new Date(timestamp).toISOString();
}

function assertNonNegative(value: number, label: string): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }

  return value;
}

function percentile(values: number[], target: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(target * sorted.length) - 1));
  return sorted[index];
}

export class FlowMonitor {
  private readonly observationsByFlow = new Map<CriticalFlow, FlowObservation[]>();

  record(observation: FlowObservation): FlowObservation {
    const normalized: FlowObservation = {
      flow: observation.flow,
      observedAt: assertIsoDatetime(observation.observedAt, 'observation.observedAt'),
      latencyMs: assertNonNegative(observation.latencyMs, 'observation.latencyMs'),
      success: Boolean(observation.success),
      queueDepth: assertNonNegative(observation.queueDepth, 'observation.queueDepth')
    };

    const existing = this.observationsByFlow.get(normalized.flow) ?? [];
    this.observationsByFlow.set(normalized.flow, [...existing, normalized]);
    return normalized;
  }

  snapshot(flow: CriticalFlow, input: { now: string; windowMs: number }): FlowSnapshot {
    const now = assertIsoDatetime(input.now, 'now');
    const windowMs = assertNonNegative(input.windowMs, 'windowMs');

    const events = (this.observationsByFlow.get(flow) ?? []).filter((observation) => {
      const observedAtMs = Date.parse(observation.observedAt);
      return observedAtMs >= Date.parse(now) - windowMs && observedAtMs <= Date.parse(now);
    });

    const latencies = events.map((entry) => entry.latencyMs);
    const failures = events.filter((entry) => !entry.success).length;
    const maxQueueDepth = events.reduce((max, entry) => Math.max(max, entry.queueDepth), 0);

    return {
      flow,
      sampleCount: events.length,
      errorRate: events.length === 0 ? 0 : failures / events.length,
      p50LatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: percentile(latencies, 0.95),
      p99LatencyMs: percentile(latencies, 0.99),
      maxQueueDepth
    };
  }

  evaluateSlo(flow: CriticalFlow, input: { now: string; windowMs: number }): SloEvaluationResult {
    const definition = defaultFlowSloDefinitions.find((entry) => entry.flow === flow);
    if (!definition) {
      throw new Error(`No SLO definition configured for flow ${flow}`);
    }

    const snapshot = this.snapshot(flow, input);
    const breaches: string[] = [];

    if (snapshot.p99LatencyMs > definition.p99LatencyMs) {
      breaches.push(
        `p99 latency ${snapshot.p99LatencyMs}ms exceeded target ${definition.p99LatencyMs}ms`
      );
    }

    if (snapshot.errorRate > definition.maxErrorRate) {
      breaches.push(
        `error rate ${(snapshot.errorRate * 100).toFixed(2)}% exceeded target ${(
          definition.maxErrorRate * 100
        ).toFixed(2)}%`
      );
    }

    if (snapshot.maxQueueDepth > definition.maxQueueDepth) {
      breaches.push(
        `queue depth ${snapshot.maxQueueDepth} exceeded target ${definition.maxQueueDepth}`
      );
    }

    return {
      flow,
      met: breaches.length === 0,
      snapshot,
      breaches
    };
  }
}
