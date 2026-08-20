type ErrorType = 'UNEXPECTED' | 'AI_UPSTREAM' | 'AI_FATAL' | 'CLIENT_VOICE';

interface LogContext {
  route?: string;
  errorType?: ErrorType;
  databaseCode?: string;
  failureCode?: string;
  upstreamStatus?: number;
  attemptCount?: number;
  inputLength?: number;
  durationMs?: number;
  nodeCount?: number;
  primaryCount?: number;
  secondaryCount?: number;
  backgroundCount?: number;
  incremental?: boolean;
}

function write(level: 'error' | 'info', event: string, context: LogContext = {}) {
  const entry = JSON.stringify({ level, event, ...context });
  if (level === 'error') {
    console.error(entry);
    return;
  }
  console.info(entry);
}

// Intentionally accepts only whitelisted metadata, never an Error or request payload.
export function logError(event: string, context?: LogContext) {
  write('error', event, context);
}

export function logInfo(event: string, context?: LogContext) {
  write('info', event, context);
}
