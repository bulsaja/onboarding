import { readConfig } from './config';

export function buildStartupSummary(env: NodeJS.ProcessEnv = process.env): string {
  const config = readConfig(env);
  return [
    `environment=${config.appEnv}`,
    `api=${config.apiBaseUrl}`,
    `queue=${config.queueName}`,
    `log=${config.logLevel}`
  ].join(' ');
}

if (require.main === module) {
  process.stdout.write(`${buildStartupSummary()}\n`);
}
