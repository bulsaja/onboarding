export interface SecretMetadata {
  secretId: string;
  owner: string;
  lastRotatedAt: string;
  rotationIntervalDays: number;
}

export interface SecretRotationPlanItem {
  secretId: string;
  owner: string;
  lastRotatedAt: string;
  dueAt: string;
  overdue: boolean;
  daysUntilDue: number;
}

function assertIsoDatetime(value: string, label: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`${label} must be a valid ISO-8601 datetime`);
  }

  return new Date(timestamp).toISOString();
}

function assertPositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return value;
}

export function buildSecretsRotationPlan(input: {
  now: string;
  secrets: SecretMetadata[];
}): SecretRotationPlanItem[] {
  const now = assertIsoDatetime(input.now, 'now');

  return input.secrets
    .map((secret): SecretRotationPlanItem => {
      const lastRotatedAt = assertIsoDatetime(secret.lastRotatedAt, `secret ${secret.secretId} lastRotatedAt`);
      const rotationIntervalDays = assertPositiveInteger(
        secret.rotationIntervalDays,
        `secret ${secret.secretId} rotationIntervalDays`
      );

      const dueAt = new Date(
        Date.parse(lastRotatedAt) + rotationIntervalDays * 24 * 60 * 60 * 1000
      ).toISOString();

      const daysUntilDue = Math.floor((Date.parse(dueAt) - Date.parse(now)) / (24 * 60 * 60 * 1000));

      return {
        secretId: secret.secretId,
        owner: secret.owner,
        lastRotatedAt,
        dueAt,
        overdue: Date.parse(now) > Date.parse(dueAt),
        daysUntilDue
      };
    })
    .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt));
}
