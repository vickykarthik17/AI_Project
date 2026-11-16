import { streamText } from 'ai';
import { Response } from 'express';
import { sanitizeDashes } from '../../domain/engine';
import { Citation, RetrievalChunkResult } from '../../types';
import { getGroqModel } from './provider';
import { PROMPTS, sanitizeUntrustedStudyText } from './prompts';
import { aiTelemetry } from './usage';

export interface CreateStreamParams {
  query: string;
  retrievedChunks: RetrievalChunkResult[];
  subject?: string;
  weakestTopic?: string;
  intentInstructions?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  modelId?: string;
  maxOutputTokens?: number;
  temperature?: number;
}

/**
 * Creates an AI SDK text stream using streamText() and Groq.
 */
export async function createGroundedChatStream(params: CreateStreamParams) {
  const {
    query,
    retrievedChunks,
    weakestTopic,
    intentInstructions,
    conversationHistory,
    modelId,
    maxOutputTokens = 2048,
    temperature = 0.2,
  } = params;

  const untrustedContext = retrievedChunks
    .map(
      (c) =>
        `<untrusted_student_context chunk_id="${c.chunkId}" doc="${c.documentName}" page="${c.pageNumber}" chapter="${c.chapter}" section="${c.section}">\n${sanitizeUntrustedStudyText(c.content)}\n</untrusted_student_context>`
    )
    .join('\n\n');

  const system = PROMPTS.ragSystemPrompt;

  const userPrompt = [
    `Student Query: "${query}"`,
    weakestTopic ? `Student Diagnosed Weakest Topic: ${weakestTopic}` : '',
    intentInstructions ? `Study Mode Guidance: ${intentInstructions}` : '',
    `Retrieved Study Material Excerpts:\n${untrustedContext}`,
    `Instructions: Answer strictly using the excerpts above. Reference document, page, and chapter, and tag claims with [Chunk: <chunk_id>]. Never use em dashes or en dashes.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const model = getGroqModel(modelId);

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: system },
  ];

  if (conversationHistory && conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-4);
    for (const msg of recent) {
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: sanitizeDashes(msg.content),
      });
    }
  }

  messages.push({ role: 'user', content: userPrompt });

  const startTime = Date.now();

  const streamResult = streamText({
    model,
    messages,
    maxOutputTokens,
    temperature,
    onFinish: (event) => {
      const durationMs = Date.now() - startTime;
      const usage = event.usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      aiTelemetry.record({
        operation: 'createGroundedChatStream',
        model: modelId || 'llama-3.3-70b-versatile',
        promptTokens: usage.inputTokens || 0,
        completionTokens: usage.outputTokens || 0,
        totalTokens: usage.totalTokens || 0,
        durationMs,
        success: true,
      });
    },
  });

  return streamResult;
}

/**
 * Pipes a streaming response directly to an Express HTTP response as Server-Sent Events (SSE).
 * Streams token by token to the browser, with metadata and verified citations emitted at the end.
 */
export async function pipeGroundedStreamToResponse(
  streamResult: any,
  res: Response,
  citations: Citation[],
  telemetryMeta?: Record<string, any>
): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let fullContent = '';

  try {
    for await (const textPart of streamResult.textStream) {
      const sanitized = sanitizeDashes(textPart);
      fullContent += sanitized;
      res.write(`data: ${JSON.stringify({ type: 'token', text: sanitized })}\n\n`);
    }

    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        content: fullContent,
        citations,
        grounded: true,
        telemetry: telemetryMeta,
      })}\n\n`
    );
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: err?.message || 'Streaming interrupted' })}\n\n`);
  } finally {
    res.end();
  }
}
