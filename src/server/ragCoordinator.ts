import { Response } from 'express';
import { ragRetrievalService, RetrieveChunksParams } from './ragRetrievalService';
import {
  buildInsufficientEvidenceResponse,
  hasSufficientLexicalEvidence,
  ragGenerationService,
} from './ragGenerationService';
import { Citation, RagInspectionTelemetry, RetrievalChunkResult } from '../types';
import { createGroundedChatStream, pipeGroundedStreamToResponse } from './ai';
import { sanitizeDashes } from '../domain/engine';

export interface RunGroundedRagParams {
  query: string;
  studentId: string;
  subject?: string;
  topics?: string[];
  documentId?: string;
  weakestTopic?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  studentMemories?: string[];
  token?: string;
}

export interface GroundedRagResponse {
  answer: string;
  citations: Citation[];
  grounded: boolean;
  insufficientEvidence: boolean;
  debugTelemetry: RagInspectionTelemetry;
}

/**
 * RAG Coordinator:
 * Keeps Retrieval and Generation completely separate and decoupled while providing
 * unified end-to-end execution and full telemetry capture for the developer inspection panel.
 */
export const ragCoordinator = {
  async runGroundedRag(params: RunGroundedRagParams): Promise<GroundedRagResponse> {
    const startTime = Date.now();
    const { query, studentId, subject, topics, documentId, weakestTopic, token } = params;

    // 1. Decoupled Retrieval Step (Gemini Embedding 2 + pgvector)
    const retrievalResult = await ragRetrievalService.retrieveChunks({
      query,
      studentId,
      subject,
      topics,
      documentId,
      topK: 5,
      minScore: 0.12,
      token,
    });

    // 2. Decoupled Generation Step (Groq LLM inference + citation verification)
    const generationResult = await ragGenerationService.generateGroundedAnswer({
      query,
      retrievedChunks: retrievalResult.chunks,
      subject,
      weakestTopic,
    });

    const totalTimeMs = Date.now() - startTime;

    // 3. Assemble complete inspection telemetry
    const debugTelemetry: RagInspectionTelemetry = {
      query: retrievalResult.query,
      queryEmbeddingStatus: {
        provider: 'Google Gemini (text-embedding-004)',
        model: retrievalResult.embeddingModel,
        dimensions: retrievalResult.embeddingDimensions,
        preview: retrievalResult.embeddingPreview,
        generatedAt: new Date().toISOString(),
      },
      filtersApplied: retrievalResult.filtersApplied,
      retrievedChunks: retrievalResult.chunks,
      contextPassedToGroq: generationResult.telemetry.contextPassedToGroq,
      groqModel: generationResult.telemetry.groqModel,
      groqResponse: generationResult.telemetry.groqResponse,
      citationMapping: generationResult.telemetry.citationMapping,
      grounded: generationResult.grounded,
      insufficientEvidence: generationResult.insufficientEvidence,
      executionTimeMs: totalTimeMs,
    };

    return {
      answer: generationResult.answer,
      citations: generationResult.citations,
      grounded: generationResult.grounded,
      insufficientEvidence: generationResult.insufficientEvidence,
      debugTelemetry,
    };
  },

  /**
   * Streaming RAG execution powered by Vercel AI SDK (streamText).
   * Retrieves relevant chunks with Gemini Embedding 2 + pgvector,
   * then streams tokens immediately as Server-Sent Events to the client.
   */
  async streamGroundedRag(params: RunGroundedRagParams & { res: Response }): Promise<void> {
    const { query, studentId, subject, topics, documentId, weakestTopic, token, res } = params;

    // 1. Retrieval
    const retrievalResult = await ragRetrievalService.retrieveChunks({
      query,
      studentId,
      subject,
      topics,
      documentId,
      topK: 5,
      minScore: 0.12,
      token,
    });

    // Check insufficient evidence
    const hasEvidence = hasSufficientLexicalEvidence(query, retrievalResult.chunks);
    if (retrievalResult.chunks.length === 0 || !hasEvidence) {
      const refusalAnswer = buildInsufficientEvidenceResponse(query, subject);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.write(`data: ${JSON.stringify({ type: 'token', text: refusalAnswer })}\n\n`);
      res.write(
        `data: ${JSON.stringify({
          type: 'done',
          content: refusalAnswer,
          citations: [],
          grounded: false,
          insufficientEvidence: true,
        })}\n\n`
      );
      res.end();
      return;
    }

    // Build verified citations from retrieved chunks
    const citations: Citation[] = retrievalResult.chunks.slice(0, 3).map((c) => ({
      chunkId: c.chunkId,
      documentName: c.documentName,
      chapter: c.chapter,
      pageNumber: c.pageNumber,
      section: c.section,
      excerpt: sanitizeDashes(c.content),
      similarityScore: c.similarityScore,
    }));

    // 2. Stream with Vercel AI SDK
    const memoryGuidance = params.studentMemories && params.studentMemories.length > 0
      ? `Student Verified Learning Insights & Profile:\n${params.studentMemories.map((m) => `- ${m}`).join('\n')}`
      : undefined;

    const stream = await createGroundedChatStream({
      query,
      retrievedChunks: retrievalResult.chunks,
      subject,
      weakestTopic,
      intentInstructions: memoryGuidance,
      conversationHistory: params.conversationHistory,
    });

    await pipeGroundedStreamToResponse(stream, res, citations, {
      embeddingModel: retrievalResult.embeddingModel,
      chunksRetrieved: retrievalResult.chunks.length,
    });
  },

  /**
   * Standalone Retrieval Inspection:
   * Returns query embedding, matched chunks, similarity scores, and filters without running LLM generation.
   */
  async inspectRetrievalOnly(params: RetrieveChunksParams): Promise<RetrievalResultTelemetry> {
    const result = await ragRetrievalService.retrieveChunks(params);
    return {
      query: result.query,
      queryEmbeddingStatus: {
        provider: 'Google Gemini (text-embedding-004)',
        model: result.embeddingModel,
        dimensions: result.embeddingDimensions,
        preview: result.embeddingPreview,
        generatedAt: new Date().toISOString(),
      },
      filtersApplied: result.filtersApplied,
      retrievedChunks: result.chunks,
      totalAvailable: result.totalAvailable,
      executionTimeMs: result.executionTimeMs,
    };
  },
};

export interface RetrievalResultTelemetry {
  query: string;
  queryEmbeddingStatus: {
    provider: string;
    model: string;
    dimensions: number;
    preview: number[];
    generatedAt: string;
  };
  filtersApplied: {
    studentId: string;
    subject?: string;
    topics?: string[];
    documentId?: string;
  };
  retrievedChunks: RetrievalChunkResult[];
  totalAvailable: number;
  executionTimeMs: number;
}

