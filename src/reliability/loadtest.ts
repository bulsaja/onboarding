import { CriticalFlow, FlowMonitor, FlowObservation, SloEvaluationResult } from './monitoring';

export interface LoadScenario {
  name: string;
  flow: CriticalFlow;
  sampleCount: number;
  baseLatencyMs: number;
  jitterMs: number;
  failureRate: number;
  queueDepthBase: number;
  queueDepthJitter: number;
}

export interface LoadScenarioResult {
  scenario: string;
  flow: CriticalFlow;
  observations: FlowObservation[];
}

export interface LoadSuiteResult {
  scenarioResults: LoadScenarioResult[];
  evaluations: SloEvaluationResult[];
}

function createDeterministicRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function assertNonNegative(value: number, label: string): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }

  return value;
}

function clampToNonNegative(value: number): number {
  return Math.max(0, value);
}

export function runLoadScenario(
  scenario: LoadScenario,
  input: {
    seed: number;
    startedAt: string;
  }
): LoadScenarioResult {
  assertNonNegative(scenario.sampleCount, 'scenario.sampleCount');
  assertNonNegative(scenario.baseLatencyMs, 'scenario.baseLatencyMs');
  assertNonNegative(scenario.jitterMs, 'scenario.jitterMs');
  assertNonNegative(scenario.failureRate, 'scenario.failureRate');
  assertNonNegative(scenario.queueDepthBase, 'scenario.queueDepthBase');
  assertNonNegative(scenario.queueDepthJitter, 'scenario.queueDepthJitter');

  const random = createDeterministicRandom(input.seed);
  const startedAtMs = Date.parse(input.startedAt);
  if (Number.isNaN(startedAtMs)) {
    throw new Error('startedAt must be a valid ISO-8601 datetime');
  }

  const observations: FlowObservation[] = [];
  for (let index = 0; index < scenario.sampleCount; index += 1) {
    const latencyOffset = (random() * 2 - 1) * scenario.jitterMs;
    const queueDepthOffset = Math.round((random() * 2 - 1) * scenario.queueDepthJitter);

    const observation: FlowObservation = {
      flow: scenario.flow,
      observedAt: new Date(startedAtMs + index * 1000).toISOString(),
      latencyMs: clampToNonNegative(scenario.baseLatencyMs + latencyOffset),
      success: random() >= scenario.failureRate,
      queueDepth: clampToNonNegative(scenario.queueDepthBase + queueDepthOffset)
    };

    observations.push(observation);
  }

  return {
    scenario: scenario.name,
    flow: scenario.flow,
    observations
  };
}

export function runLoadSuite(
  scenarios: LoadScenario[],
  input: {
    seed: number;
    startedAt: string;
    windowMs: number;
  }
): LoadSuiteResult {
  const monitor = new FlowMonitor();

  const scenarioResults = scenarios.map((scenario, index) =>
    runLoadScenario(scenario, {
      seed: input.seed + index,
      startedAt: input.startedAt
    })
  );

  for (const scenarioResult of scenarioResults) {
    for (const observation of scenarioResult.observations) {
      monitor.record(observation);
    }
  }

  const now = new Date(Date.parse(input.startedAt) + input.windowMs).toISOString();
  const flows = Array.from(new Set(scenarios.map((scenario) => scenario.flow)));
  const evaluations = flows.map((flow) => monitor.evaluateSlo(flow, { now, windowMs: input.windowMs }));

  return {
    scenarioResults,
    evaluations
  };
}

export function injectFailureScenario(
  scenario: LoadScenario,
  injection: {
    failureRate?: number;
    latencyMultiplier?: number;
    queueDepthMultiplier?: number;
  }
): LoadScenario {
  return {
    ...scenario,
    failureRate:
      injection.failureRate !== undefined
        ? Math.min(1, Math.max(0, injection.failureRate))
        : scenario.failureRate,
    baseLatencyMs:
      injection.latencyMultiplier !== undefined
        ? scenario.baseLatencyMs * Math.max(0, injection.latencyMultiplier)
        : scenario.baseLatencyMs,
    queueDepthBase:
      injection.queueDepthMultiplier !== undefined
        ? scenario.queueDepthBase * Math.max(0, injection.queueDepthMultiplier)
        : scenario.queueDepthBase
  };
}
