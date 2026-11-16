import { tool } from 'ai';
import { z } from 'zod';
import { sanitizeDashes } from '../../domain/engine';
import { ragRetrievalService } from '../ragRetrievalService';
import { repo } from '../repository';

/**
 * Creates scoped AI SDK tools for the authenticated student.
 * Multi-tenant safety: The studentId is strictly bound at tool creation time from the verified session.
 * The model CANNOT alter or override the studentId.
 */
export function getStudyAssistantTools(studentId: string, subject = 'Biology', token?: string) {
  if (!studentId || typeof studentId !== 'string') {
    throw new Error('Security Invariant: Authenticated studentId is required to construct study tools.');
  }

  return {
    searchUploadedDocuments: tool({
      description:
        'Search verified textbook and study material excerpts uploaded by this student. Use to retrieve factual evidence, page numbers, chapters, and sections.',
      inputSchema: z.object({
        query: z.string().describe('Specific conceptual query to search in the uploaded study documents'),
        topK: z.number().min(1).max(5).default(3).describe('Number of most relevant excerpts to retrieve'),
      }),
      execute: async ({ query, topK }: { query: string; topK?: number }) => {
        const cleanQuery = sanitizeDashes(query.trim());
        const result = await ragRetrievalService.retrieveChunks({
          query: cleanQuery,
          studentId,
          subject,
          topK: topK || 3,
          token,
        });

        return {
          query: result.query,
          chunksCount: result.chunks.length,
          chunks: result.chunks.map((c) => ({
            chunkId: c.chunkId,
            documentName: c.documentName,
            chapter: c.chapter,
            pageNumber: c.pageNumber,
            section: c.section,
            excerpt: sanitizeDashes(c.content.slice(0, 300)),
            similarityScore: c.similarityScore,
          })),
        };
      },
    }),

    fetchTopicPerformance: tool({
      description:
        'Fetch the authenticated student knowledge gap analysis, mastery classifications (Weak, Medium, Strong), and accuracy percentages.',
      inputSchema: z.object({
        topicName: z.string().optional().describe('Optional topic name to filter performance data'),
      }),
      execute: async ({ topicName }: { topicName?: string }) => {
        const diagnoses = await repo.getGapDiagnoses(studentId, subject, token);

        if (topicName) {
          const match = diagnoses.find(
            (d) => d.topicName.toLowerCase() === topicName.toLowerCase().trim()
          );
          if (match) {
            return {
              topic: match.topicName,
              status: match.status,
              accuracyPercent: match.accuracyPercent,
              questionsAttempted: match.questionsAttempted,
              repeatedMistakesCount: match.repeatedMistakesCount,
              recommendedAction: match.recommendedAction,
            };
          }
        }

        return {
          diagnoses: diagnoses.slice(0, 5).map((d) => ({
            topic: d.topicName,
            status: d.status,
            accuracyPercent: d.accuracyPercent,
            questionsAttempted: d.questionsAttempted,
            repeatedMistakesCount: d.repeatedMistakesCount,
          })),
        };
      },
    }),

    fetchPreviousMistakes: tool({
      description:
        'Retrieve recent incorrect answers and misconceptions from the student completed diagnostic quizzes.',
      inputSchema: z.object({
        topicName: z.string().optional().describe('Optional topic name to filter mistakes'),
      }),
      execute: async ({ topicName }: { topicName?: string }) => {
        const quizzes = await repo.getQuizzes(studentId, subject, token);
        const incorrectAnswers: Array<{
          topic: string;
          subtopic: string;
          studentResponse: string;
          correctAnswer: string;
          evaluationExplanation: string;
        }> = [];

        for (const qz of quizzes) {
          if (!qz.answers) continue;
          for (const ans of qz.answers) {
            if (!ans.isCorrect) {
              if (
                !topicName ||
                ans.topic.toLowerCase().includes(topicName.toLowerCase().trim())
              ) {
                incorrectAnswers.push({
                  topic: ans.topic,
                  subtopic: ans.subtopic,
                  studentResponse: sanitizeDashes(ans.studentResponse),
                  correctAnswer: sanitizeDashes(ans.correctAnswer),
                  evaluationExplanation: sanitizeDashes(ans.evaluationExplanation),
                });
              }
            }
          }
        }

        return {
          totalMistakesFound: incorrectAnswers.length,
          mistakes: incorrectAnswers.slice(0, 4),
        };
      },
    }),
  };
}
