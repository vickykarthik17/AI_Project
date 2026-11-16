import crypto from 'node:crypto';
import { z } from 'zod';
import { sanitizeDashes } from '../domain/engine';
import { DocumentChunk, PastPaperIntelligence, PastPaperQuestion, TopicNode } from '../types';
import { getGroqClient, GROQ_DEFAULT_MODEL } from './groqService';
import { ragRetrievalService } from './ragRetrievalService';
import { repo } from './repository';
import { generateStructuredData, PROMPTS } from './ai';

const pastPaperExtractSchema = z.object({
  questions: z.array(
    z.object({
      pageNumber: z.number().default(1),
      questionText: z.string(),
      year: z.string().nullable().optional(),
      marks: z.number().nullable().optional(),
      questionType: z.string().default('ShortAnswer'),
      suggestedTopic: z.string().optional(),
      suggestedSubtopic: z.string().optional(),
      mappingConfidence: z.enum(['High', 'Medium', 'Uncertain']).default('High'),
    })
  ),
});

export interface AnalyzePastPaperParams {
  userId: string;
  materialId: string;
  sourceDocument: string;
  subject: string;
  chunks: DocumentChunk[];
  existingTopics: TopicNode[];
  token?: string;
}

export const pastPaperService = {
  /**
   * Extracts examination questions from uploaded past paper chunks,
   * validates topic mapping using Gemini Embedding 2 retrieval,
   * flags uncertain mappings for student review, and preserves years and marks without fabrication.
   */
  async analyzePastPaperDocument(params: AnalyzePastPaperParams): Promise<PastPaperQuestion[]> {
    const { userId, materialId, sourceDocument, subject, chunks, existingTopics, token } = params;
    const cleanSubject = sanitizeDashes(subject || 'Biology');
    const cleanDoc = sanitizeDashes(sourceDocument || 'Past_Paper.pdf');

    // Step 1: Extract individual examination questions using Groq structured JSON
    const extractedRaw = await this.extractQuestionsFromExcerpts({
      userId,
      materialId,
      sourceDocument: cleanDoc,
      subject: cleanSubject,
      chunks,
      existingTopics,
    });

    // Step 2: Validate topic mapping using retrieved syllabus and textbook chunks via Gemini embeddings
    const validatedQuestions: PastPaperQuestion[] = [];
    for (const q of extractedRaw) {
      const validated = await this.validateTopicWithRetrievedChunks({
        question: q,
        userId,
        subject: cleanSubject,
        existingTopics,
        token,
      });
      validatedQuestions.push(validated);
    }

    // Step 3: Persist validated questions
    if (validatedQuestions.length > 0) {
      await repo.savePastPaperQuestions(validatedQuestions, userId, token);
    }

    // Step 4: Dynamically calculate and update topic frequency from actual uploaded papers
    await this.updateTopicFrequencies(userId, cleanSubject, token);

    return validatedQuestions;
  },

  /**
   * Uses Groq structured JSON output to parse individual questions, types, marks, and years.
   */
  async extractQuestionsFromExcerpts(params: {
    userId: string;
    materialId: string;
    sourceDocument: string;
    subject: string;
    chunks: DocumentChunk[];
    existingTopics: TopicNode[];
  }): Promise<PastPaperQuestion[]> {
    const { userId, materialId, sourceDocument, subject, chunks, existingTopics } = params;
    const groq = getGroqClient();
    const candidateTopicNames = existingTopics.map((t) => t.topicName).join(', ');

    const contextText = chunks
      .slice(0, 12)
      .map(
        (c) =>
          `<untrusted_exam_paper_excerpt page="${c.pageNumber}" section="${c.section}">\n${c.content}\n</untrusted_exam_paper_excerpt>`
      )
      .join('\n\n');

    if (contextText.length > 25) {
      try {
        const systemPrompt = `You are an expert examination paper analyst. Your job is to extract individual examination questions from past paper excerpts and map each question to the most appropriate syllabus topic.

CRITICAL FACTUAL INTEGRITY RULES:
1. Examination Year: Extract ONLY if explicitly printed in the text (e.g. "2024", "May/June 2023", "Summer 2022"). If no examination year is stated, you MUST return null. NEVER invent or fabricate an examination year.
2. Marks: Extract ONLY if explicit marks are printed (e.g. "[3 marks]", "(4 marks)", "[2]"). If no marks are specified, you MUST return null. NEVER guess or invent marks.
3. Question Type: Classify as "MCQ", "ShortAnswer", "LongAnswer", "Structured", "FillBlank", or "TrueFalse".
4. Never use em dashes or en dashes.
5. If the question does not clearly fit any of the candidate syllabus topics, assign the most plausible topic and set "mappingConfidence" to "Uncertain".`;

        const userPrompt = `Extract all distinct examination questions from the following past paper excerpts for subject "${subject}". Candidate syllabus topics: [${candidateTopicNames || subject}].\n\n${contextText}`;

        const structured = await generateStructuredData({
          schema: pastPaperExtractSchema,
          system: systemPrompt,
          prompt: userPrompt,
          fallback: () => ({ questions: [] }),
          operationName: 'extractPastPaperQuestions',
        });

        const list = structured.questions || [];

        if (Array.isArray(list) && list.length > 0) {
          return list.map((item: any, i: number) => {
            const isUncertain = item.mappingConfidence === 'Uncertain';
            return {
              id: `pp_${crypto.randomUUID().slice(0, 8)}_${i}`,
              userId,
              materialId,
              sourceDocument,
              pageNumber: Math.max(1, Number(item.pageNumber) || 1),
              subject,
              topic: sanitizeDashes(item.suggestedTopic || existingTopics[0]?.topicName || subject),
              subtopic: sanitizeDashes(item.suggestedSubtopic || 'Core Examination Question'),
              questionText: sanitizeDashes(item.questionText || ''),
              year: item.year ? sanitizeDashes(String(item.year)) : null,
              marks: item.marks !== undefined && item.marks !== null ? Number(item.marks) : null,
              questionType: sanitizeDashes(item.questionType || 'ShortAnswer'),
              needsReview: isUncertain,
              mappingConfidence: isUncertain ? 'Uncertain' : 'High',
              isSample: false,
            };
          });
        }
      } catch (err: any) {
        console.warn('Notice: Groq past paper extraction notice:', err.message);
      }
    }

    // Deterministic extraction fallback for offline / test environments
    const extracted: PastPaperQuestion[] = [];
    for (const c of chunks) {
      // Split on explicit question markers (e.g. "Question 1", "Q1.", "1.") or sentence boundaries
      const rawBlocks = c.content.split(/(?=(?:Question\s*\d+|Q\d+[:.]|\b\d{1,2}[.)]\s+[A-Z]))/i);
      const candidates: string[] = [];
      for (const b of rawBlocks) {
        if (/^(?:Question\s*\d+|Q\d+[:.]|\b\d{1,2}[.)]\s+)/i.test(b.trim())) {
          candidates.push(b.trim());
        } else {
          candidates.push(...b.split(/(?<=[?.\n])\s+/).map((s) => s.trim()).filter(Boolean));
        }
      }

      for (const cleanS of candidates) {
        if (
          cleanS.length > 20 &&
          (cleanS.includes('?') ||
            /^(?:Q\d+[:.]|Question\s*\d+|\d{1,2}[.)]|Explain|Describe|State|Calculate|Define|Compare|Analyze|Identify|Discuss)/i.test(cleanS))
        ) {
          const yearMatch = cleanS.match(/\b(20\d{2})\b/);
          const marksMatch = cleanS.match(/\[?(\d+)\s*marks?\]?/i);

          const matchedTopic =
            existingTopics.find((t) => cleanS.toLowerCase().includes(t.topicName.toLowerCase()))?.topicName ||
            c.topic ||
            existingTopics[0]?.topicName ||
            subject;

          extracted.push({
            id: `pp_${crypto.randomUUID().slice(0, 8)}_${extracted.length}`,
            userId,
            materialId,
            sourceDocument,
            pageNumber: c.pageNumber,
            subject,
            topic: sanitizeDashes(matchedTopic),
            subtopic: sanitizeDashes(c.section || 'General Exam Question'),
            questionText: sanitizeDashes(cleanS),
            year: yearMatch ? yearMatch[1] : null,
            marks: marksMatch ? parseInt(marksMatch[1], 10) : null,
            questionType: /choose|which of the following/i.test(cleanS) ? 'MCQ' : 'ShortAnswer',
            needsReview: false,
            mappingConfidence: 'High',
            isSample: false,
          });
        }
      }
    }

    return extracted;
  },

  /**
   * Validates topic mapping using retrieved syllabus and textbook chunks via Gemini Embedding 2.
   * If semantic similarity is low or topic match is ambiguous, marks the question for student review.
   */
  async validateTopicWithRetrievedChunks(params: {
    question: PastPaperQuestion;
    userId: string;
    subject: string;
    existingTopics: TopicNode[];
    token?: string;
  }): Promise<PastPaperQuestion> {
    const { question, userId, subject, existingTopics, token } = params;

    try {
      // Retrieve relevant curriculum chunks using Gemini Embedding 2
      const retrieval = await ragRetrievalService.retrieveChunks({
        query: question.questionText,
        studentId: userId,
        subject,
        topK: 6,
        minScore: 0.15,
        token,
      });

      // Filter out chunks from the past paper itself to validate against syllabus and textbook chunks
      const curriculumChunks = retrieval.chunks.filter(
        (c) => c.documentId !== question.materialId && !c.documentName.toLowerCase().includes('past') && !c.documentName.toLowerCase().includes('exam')
      );
      const topChunk = curriculumChunks[0] || (retrieval.chunks.find((c) => c.documentId !== question.materialId));

      // Check if question text directly mentions an existing syllabus topic
      const directMatchTopic = existingTopics.find((t) =>
        question.questionText.toLowerCase().includes(t.topicName.toLowerCase())
      );

      if (directMatchTopic) {
        return {
          ...question,
          topic: directMatchTopic.topicName,
          subtopic: topChunk?.section || question.subtopic,
          mappingConfidence: 'High',
          needsReview: false,
          validationEvidence: topChunk
            ? `Direct topic match validated against ${topChunk.documentName} (Page ${topChunk.pageNumber}, ${topChunk.chapter}: ${topChunk.section}) [Similarity: ${(topChunk.similarityScore * 100).toFixed(1)}%]`
            : `Direct syllabus topic match found for "${directMatchTopic.topicName}".`,
        };
      }

      if (topChunk && topChunk.similarityScore >= 0.38) {
        // High confidence semantic match against textbook/syllabus
        const matchingSyllabusTopic = existingTopics.find(
          (t) =>
            t.topicName.toLowerCase() === topChunk.topic.toLowerCase() ||
            topChunk.content.toLowerCase().includes(t.topicName.toLowerCase()) ||
            topChunk.chapter.toLowerCase().includes(t.topicName.toLowerCase())
        );

        const resolvedTopic = matchingSyllabusTopic ? matchingSyllabusTopic.topicName : topChunk.topic;

        return {
          ...question,
          topic: resolvedTopic,
          subtopic: topChunk.section || question.subtopic,
          mappingConfidence: 'High',
          needsReview: false,
          validationEvidence: `Validated against ${topChunk.documentName} (Page ${topChunk.pageNumber}, ${topChunk.chapter}: ${topChunk.section}) [Similarity: ${(topChunk.similarityScore * 100).toFixed(1)}%]`,
        };
      }

      if (topChunk && topChunk.similarityScore >= 0.28) {
        // Moderate confidence match
        return {
          ...question,
          topic: question.topic || topChunk.topic,
          mappingConfidence: 'Medium',
          needsReview: false,
          validationEvidence: `Validated against ${topChunk.documentName} (Page ${topChunk.pageNumber}, ${topChunk.section}) [Similarity: ${(topChunk.similarityScore * 100).toFixed(1)}%]`,
        };
      }

      // Uncertain match: Low similarity against syllabus or out-of-syllabus content -> mark for student review
      return {
        ...question,
        mappingConfidence: 'Uncertain',
        needsReview: true,
        validationEvidence: `Uncertain topic mapping: low semantic similarity (${topChunk ? (topChunk.similarityScore * 100).toFixed(1) + '%' : 'no match'}). Marked for student review.`,
      };
    } catch {
      // If retrieval is unavailable, fallback to existing mapping
      return {
        ...question,
        mappingConfidence: question.mappingConfidence || 'Medium',
        needsReview: Boolean(question.needsReview),
      };
    }
  },

  /**
   * Calculates topic frequency dynamically using actual uploaded past paper questions
   * and updates pastPaperFrequency on every syllabus topic in the database.
   * Never invents question frequencies.
   */
  async updateTopicFrequencies(userId: string, subject: string, token?: string): Promise<Record<string, number>> {
    const allQuestions = await repo.getPastPaperQuestions(userId, subject, token);
    const existingTopics = await repo.getTopics(userId, subject, token);

    const freqMap: Record<string, number> = {};
    for (const q of allQuestions) {
      const topicKey = q.topic.toLowerCase();
      freqMap[topicKey] = (freqMap[topicKey] || 0) + 1;
    }

    // Update each topic's pastPaperFrequency strictly based on actual counts
    for (const topic of existingTopics) {
      const actualCount = freqMap[topic.topicName.toLowerCase()] || 0;
      if (topic.pastPaperFrequency !== actualCount) {
        await repo.saveTopic({ ...topic, pastPaperFrequency: actualCount }, token);
      }
    }

    return freqMap;
  },

  /**
   * Compiles the comprehensive Past Paper Intelligence Analytics payload.
   */
  async getIntelligenceSummary(userId: string, subject?: string, token?: string): Promise<PastPaperIntelligence> {
    const questions = await repo.getPastPaperQuestions(userId, subject, token);
    const topics = await repo.getTopics(userId, subject, token);

    const totalQuestions = questions.length;

    // 1. Calculate question counts per topic
    const topicCountMap = new Map<string, number>();
    for (const q of questions) {
      const t = q.topic;
      topicCountMap.set(t, (topicCountMap.get(t) || 0) + 1);
    }

    // 2. Frequently tested topics ranked descending
    const frequentlyTestedTopics = Array.from(topicCountMap.entries())
      .map(([topicName, questionCount]) => {
        const matchedNode = topics.find((t) => t.topicName.toLowerCase() === topicName.toLowerCase());
        const percentage = totalQuestions > 0 ? Number(((questionCount / totalQuestions) * 100).toFixed(1)) : 0;
        return {
          topicName,
          questionCount,
          percentage,
          syllabusWeight: matchedNode?.syllabusWeight || 7,
        };
      })
      .sort((a, b) => b.questionCount - a.questionCount);

    // 3. Available Year-wise Distribution
    const yearCountMap = new Map<string, { count: number; topics: Set<string> }>();
    for (const q of questions) {
      const yr = q.year || 'Unspecified';
      const existing = yearCountMap.get(yr) || { count: 0, topics: new Set<string>() };
      existing.count += 1;
      existing.topics.add(q.topic);
      yearCountMap.set(yr, existing);
    }

    const yearDistribution = Array.from(yearCountMap.entries())
      .map(([year, data]) => ({
        year,
        questionCount: data.count,
        topicsCovered: Array.from(data.topics),
      }))
      .sort((a, b) => {
        if (a.year === 'Unspecified') return 1;
        if (b.year === 'Unspecified') return -1;
        return b.year.localeCompare(a.year);
      });

    // 4. Topic x Year Matrix
    const topicYearMatrix: Record<string, Record<string, number>> = {};
    for (const q of questions) {
      const yr = q.year || 'Unspecified';
      if (!topicYearMatrix[q.topic]) {
        topicYearMatrix[q.topic] = {};
      }
      topicYearMatrix[q.topic][yr] = (topicYearMatrix[q.topic][yr] || 0) + 1;
    }

    // 5. Questions needing student review
    const questionsNeedingReviewCount = questions.filter((q) => q.needsReview).length;

    // 6. Source References
    const docMap = new Map<string, { materialId: string; count: number; pages: Set<number> }>();
    for (const q of questions) {
      const doc = q.sourceDocument || 'Past Paper Document';
      const entry = docMap.get(doc) || { materialId: q.materialId, count: 0, pages: new Set<number>() };
      entry.count += 1;
      entry.pages.add(q.pageNumber);
      docMap.set(doc, entry);
    }

    const sourceReferences = Array.from(docMap.entries()).map(([documentName, data]) => ({
      documentName,
      materialId: data.materialId,
      questionCount: data.count,
      pages: Array.from(data.pages).sort((a, b) => a - b),
    }));

    return {
      totalQuestions,
      frequentlyTestedTopics,
      yearDistribution,
      topicYearMatrix,
      questionsNeedingReviewCount,
      sourceReferences,
    };
  },

  /**
   * Allows a student to review, confirm, or reassign a past paper question's topic mapping.
   */
  async reviewQuestionTopic(
    userId: string,
    questionId: string,
    newTopic: string,
    newSubtopic?: string,
    token?: string
  ): Promise<PastPaperQuestion | null> {
    const cleanTopic = sanitizeDashes(newTopic.trim());
    const cleanSubtopic = newSubtopic ? sanitizeDashes(newSubtopic.trim()) : undefined;

    const updated = await repo.updatePastPaperQuestion(
      userId,
      questionId,
      {
        topic: cleanTopic,
        subtopic: cleanSubtopic,
        needsReview: false,
        mappingConfidence: 'High',
        validationEvidence: 'Confirmed and mapped by student.',
      },
      token
    );

    if (updated) {
      // Recalculate topic frequencies after manual re-assignment
      await this.updateTopicFrequencies(userId, updated.subject, token);
    }

    return updated;
  },
};
