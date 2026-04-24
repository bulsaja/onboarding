export type AppEnv = 'dev' | 'staging';

export interface AppConfig {
  appEnv: AppEnv;
  apiBaseUrl: string;
  queueName: string;
  logLevel: string;
}

const allowedEnvironments = new Set<AppEnv>(['dev', 'staging']);

function requireValue(key: string, env: NodeJS.ProcessEnv): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const appEnv = requireValue('APP_ENV', env) as AppEnv;
  if (!allowedEnvironments.has(appEnv)) {
    throw new Error(`APP_ENV must be one of: ${Array.from(allowedEnvironments).join(', ')}`);
  }

  return {
    appEnv,
    apiBaseUrl: requireValue('API_BASE_URL', env),
    queueName: requireValue('QUEUE_NAME', env),
    logLevel: requireValue('LOG_LEVEL', env)
  };
}
