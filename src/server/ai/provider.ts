import { createGroq } from '@ai-sdk/groq';
import { sanitizeDashes } from '../../domain/engine';

export const GROQ_DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

/**
 * Checks whether valid Groq credentials are configured in the environment.
 */
export function isGroqConfigured(): boolean {
  const key = process.env.GROQ_API_KEY;
  if (!key || key === 'MY_GROQ_API_KEY' || key.trim() === '') {
    return false;
  }
  return true;
}

/**
 * Creates and returns the Vercel AI SDK Groq provider instance.
 */
export function getGroqProvider() {
  const apiKey = process.env.GROQ_API_KEY?.trim() || '';
  return createGroq({
    apiKey,
  });
}

/**
 * Returns a configured model instance from the Vercel AI SDK Groq provider.
 */
export function getGroqModel(modelId: string = GROQ_DEFAULT_MODEL) {
  const provider = getGroqProvider();
  return provider(modelId);
}

