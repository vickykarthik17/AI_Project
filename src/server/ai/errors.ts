import { sanitizeDashes } from '../../domain/engine';

export class AIServerError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly isRetryable: boolean;

  constructor(message: string, code = 'AI_ERROR', status = 500, isRetryable = false) {
    super(sanitizeDashes(message));
    this.name = 'AIServerError';
    this.code = code;
    this.status = status;
    this.isRetryable = isRetryable;
  }
}

export class AIProviderError extends AIServerError {
  constructor(message: string, provider = 'groq', isRetryable = true) {
    super(`Provider ${provider} error: ${message}`, 'AI_PROVIDER_ERROR', 502, isRetryable);
  }
}

export class AIRateLimitError extends AIServerError {
  constructor(message = 'Rate limit exceeded with AI provider.') {
    super(message, 'AI_RATE_LIMIT_ERROR', 429, true);
  }
}

export class AISchemaValidationError extends AIServerError {
  constructor(details: string) {
    super(`Schema validation failed: ${details}`, 'AI_SCHEMA_VALIDATION_ERROR', 422, false);
  }
}

/**
 * Safely executes an AI SDK operation with error classification and fallback support.
 */
export async function safeAIExecution<T>(
  operation: () => Promise<T>,
  fallback: () => T | Promise<T>,
  contextName = 'AI Operation'
): Promise<T> {
  try {
    return await operation();
  } catch (err: any) {
    console.warn(`[safeAIExecution] ${contextName} caught error:`, err?.message || err);
    return await fallback();
  }
}

