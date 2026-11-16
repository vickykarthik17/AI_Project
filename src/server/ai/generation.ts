import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { sanitizeDashes } from '../../domain/engine';
import { getGroqModel, isGroqConfigured } from './provider';
import { safeAIExecution } from './errors';
import { aiTelemetry } from './usage';

export interface GenerateStructuredParams<T> {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  modelId?: string;
  maxOutputTokens?: number;
  temperature?: number;
  fallback: () => T | Promise<T>;
  operationName?: string;
}

/**
 * Generates schema-validated structured data using the Vercel AI SDK (generateObject).
 * Automatically falls back to deterministic logic if the provider is offline or returns an error.
 */
export async function generateStructuredData<T>(
  params: GenerateStructuredParams<T>
): Promise<T> {
  const {
    schema,
    system,
    prompt,
    modelId,
    maxOutputTokens = 2048,
    temperature = 0.1,
    fallback,
    operationName = 'generateStructuredData',
  } = params;

  if (!isGroqConfigured()) {
    return await fallback();
  }

  return await safeAIExecution(
    async () => {
      const startTime = Date.now();
      const model = getGroqModel(modelId);

      const result = await generateObject({
        model,
        schema,
        system: sanitizeDashes(system),
        prompt: sanitizeDashes(prompt),
        maxOutputTokens,
        temperature,
      });

      const durationMs = Date.now() - startTime;
      const usage = result.usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

      aiTelemetry.record({
        operation: operationName,
        model: modelId || 'llama-3.3-70b-versatile',
        promptTokens: usage.inputTokens || 0,
        completionTokens: usage.outputTokens || 0,
        totalTokens: usage.totalTokens || 0,
        durationMs,
        success: true,
      });

      return result.object as T;
    },
    fallback,
    operationName
  );
}

export interface GenerateTextParams {
  system: string;
  prompt: string;
  modelId?: string;
  maxOutputTokens?: number;
  temperature?: number;
  fallback: () => string | Promise<string>;
  operationName?: string;
}

/**
 * Generates text using the Vercel AI SDK (generateText).
 * Automatically falls back to deterministic logic if the provider is offline or errors.
 */
export async function generateTextData(params: GenerateTextParams): Promise<string> {
  const {
    system,
    prompt,
    modelId,
    maxOutputTokens = 2048,
    temperature = 0.2,
    fallback,
    operationName = 'generateTextData',
  } = params;

  if (!isGroqConfigured()) {
    return await fallback();
  }

  return await safeAIExecution(
    async () => {
      const startTime = Date.now();
      const model = getGroqModel(modelId);

      const result = await generateText({
        model,
        system: sanitizeDashes(system),
        prompt: sanitizeDashes(prompt),
        maxOutputTokens,
        temperature,
      });

      const durationMs = Date.now() - startTime;
      const usage = result.usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

      aiTelemetry.record({
        operation: operationName,
        model: modelId || 'llama-3.3-70b-versatile',
        promptTokens: usage.inputTokens || 0,
        completionTokens: usage.outputTokens || 0,
        totalTokens: usage.totalTokens || 0,
        durationMs,
        success: true,
      });

      return sanitizeDashes(result.text.trim());
    },
    fallback,
    operationName
  );
}
