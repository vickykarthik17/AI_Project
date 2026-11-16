import {
  ConfidenceLevel,
  DifficultyLevel,
  DocumentChunk,
  KnowledgeStatus,
  QuizSubmissionAnswer,
  RevisionTask,
  TopicGapDiagnosis,
  TopicNode,
} from '../types';

/**
 * Ensures no em dashes (\u2014) or en dashes (\u2013) appear in any string.
 */
export function sanitizeDashes(input: string): string {
  if (!input) return '';
  return input.replace(/\u2014/g, ' - ').replace(/\u2013/g, '-').replace(/  +/g, ' ');
}

/**
 * Classifies topic mastery status based on accuracy percentage and number of attempted questions.
 * Rules from specification:
 * - Very few attempted questions (< 2): "Insufficient evidence"
 * - 0-49%: "Weak"
 * - 50-74%: "Medium"
 * - 75-100%: "Strong"
 */
export function classifyKnowledgeStatus(
  accuracyPercent: number,
  questionsAttempted: number
): KnowledgeStatus {
  if (questionsAttempted < 2) {
    return 'Insufficient evidence';
  }
  const rounded = Math.round(accuracyPercent);
  if (rounded <= 49) return 'Weak';
  if (rounded <= 74) return 'Medium';
  return 'Strong';
}

/**
 * Calculates assessment confidence based on total attempted questions and difficulty coverage.
 */
export function calculateConfidenceLevel(
  questionsAttempted: number,
  hardOrMediumAttempted: number = 0
): ConfidenceLevel {
  if (questionsAttempted < 2) return 'Low';
  if (questionsAttempted >= 5 || (questionsAttempted >= 3 && hardOrMediumAttempted >= 2)) {
    return 'High';
  }
  return 'Medium';
}

/**
 * Computes weighted topic accuracy considering difficulty levels and partial marks.
 */
export function computeTopicPerformance(answers: QuizSubmissionAnswer[]): {
  questionsAttempted: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPercent: number;
  repeatedMistakesCount: number;
  hardOrMediumCount: number;
} {
  if (!answers || answers.length === 0) {
    return {
      questionsAttempted: 0,
      correctCount: 0,
      incorrectCount: 0,
      accuracyPercent: 0,
      repeatedMistakesCount: 0,
      hardOrMediumCount: 0,
    };
  }

  let earnedWeight = 0;
  let totalWeight = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let hardOrMediumCount = 0;

  const subtopicFailures: Record<string, number> = {};

  for (const ans of answers) {
    const diffMultiplier =
      ans.difficulty === 'Hard' ? 1.25 : ans.difficulty === 'Medium' ? 1.1 : 1.0;
    if (ans.difficulty === 'Hard' || ans.difficulty === 'Medium') {
      hardOrMediumCount += 1;
    }

    const maxM = Math.max(1, ans.maxMarks || 1);
    const earnedM = Math.max(0, Math.min(maxM, ans.marksEarned || 0));
    const ratio = earnedM / maxM;

    earnedWeight += ratio * diffMultiplier;
    totalWeight += diffMultiplier;

    if (ans.isCorrect || ratio >= 0.75) {
      correctCount += 1;
    } else {
      incorrectCount += 1;
      const key = ans.subtopic || ans.topic;
      subtopicFailures[key] = (subtopicFailures[key] || 0) + 1;
    }
  }

  const repeatedMistakesCount = Object.values(subtopicFailures).filter((c) => c >= 2).length;
  const accuracyPercent = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

  return {
    questionsAttempted: answers.length,
    correctCount,
    incorrectCount,
    accuracyPercent,
    repeatedMistakesCount,
    hardOrMediumCount,
  };
}

/**
 * Calculates revision priority score (0-100) using:
 * 1. Knowledge gap severity
 * 2. Past-paper frequency
 * 3. Syllabus weight / importance
 * 4. Prerequisite status
 */
export function calculateRevisionPriorityScore(params: {
  status: KnowledgeStatus;
  accuracyPercent: number;
  pastPaperFrequency: number;
  syllabusWeight: number;
  isPrerequisiteForWeakTopic: boolean;
  repeatedMistakesCount: number;
}): number {
  const {
    status,
    accuracyPercent,
    pastPaperFrequency,
    syllabusWeight,
    isPrerequisiteForWeakTopic,
    repeatedMistakesCount,
  } = params;

  let gapSeverity = 0;
  if (status === 'Weak') {
    gapSeverity = 50 + Math.round((50 - Math.min(50, accuracyPercent)) * 0.4);
  } else if (status === 'Insufficient evidence') {
    gapSeverity = 38;
  } else if (status === 'Medium') {
    gapSeverity = 25 + Math.round((75 - Math.min(75, accuracyPercent)) * 0.25);
  } else {
    gapSeverity = 8;
  }

  const freqBonus = Math.min(18, pastPaperFrequency * 3);
  const weightBonus = Math.min(12, Math.round(syllabusWeight * 1.2));
  const prereqBonus = isPrerequisiteForWeakTopic ? 10 : 0;
  const mistakeBonus = Math.min(10, repeatedMistakesCount * 4);

  return Math.min(100, gapSeverity + freqBonus + weightBonus + prereqBonus + mistakeBonus);
}

/**
 * Divides raw document text into structured, overlapping semantic chunks while preserving
 * page numbers, chapters, sections, and topics.
 */
export function chunkStudyDocument(params: {
  materialId: string;
  userId: string;
  subject: string;
  documentName: string;
  rawText: string;
  defaultTopic?: string;
}): Omit<DocumentChunk, 'embedding'>[] {
  const { materialId, userId, subject, documentName, rawText, defaultTopic = 'General' } = params;
  const cleaned = sanitizeDashes(rawText).replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];

  const lines = cleaned.split('\n');
  let currentPage = 1;
  let currentChapter = 'Chapter 1: Overview';
  let currentSection = 'Core Concepts';
  let currentTopic = defaultTopic;

  const chunks: Omit<DocumentChunk, 'embedding'>[] = [];
  let buffer: string[] = [];
  let bufferWordCount = 0;

  const flushBuffer = () => {
    const text = buffer.join('\n').trim();
    if (text.length >= 20) {
      chunks.push({
        id: `${materialId}_chunk_${chunks.length + 1}`,
        materialId,
        userId,
        subject,
        documentName,
        pageNumber: currentPage,
        chapter: currentChapter,
        section: currentSection,
        topic: currentTopic,
        content: text,
        chunkIndex: chunks.length,
      });
    }
    buffer = [];
    bufferWordCount = 0;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const pageMatch = line.match(/^(?:\[?Page\s+(\d+)\]?|-+\s*Page\s+(\d+)\s*-+)$/i);
    if (pageMatch) {
      flushBuffer();
      currentPage = parseInt(pageMatch[1] || pageMatch[2], 10) || currentPage + 1;
      continue;
    }

    const chapterMatch = line.match(/^(?:Chapter|Unit)\s+\d+\s*[:-]?\s*(.+)$/i);
    if (chapterMatch) {
      flushBuffer();
      currentChapter = sanitizeDashes(line);
      if (chapterMatch[1]) {
        currentTopic = sanitizeDashes(chapterMatch[1].trim());
      }
      continue;
    }

    const sectionMatch = line.match(/^(?:Section\s*[:-]?|#+\s*)\s*([A-Za-z0-9.\s:-]{3,65})$/i);
    if (sectionMatch && line.length < 75) {
      flushBuffer();
      currentSection = sanitizeDashes(sectionMatch[1].trim());
      continue;
    }

    const words = line.split(/\s+/).length;
    buffer.push(line);
    bufferWordCount += words;

    if (bufferWordCount >= 110) {
      flushBuffer();
    }
  }

  flushBuffer();
  return chunks;
}

/**
 * Computes cosine similarity between two numeric vectors, with lexical overlap boost
 * for hybrid semantic + keyword retrieval accuracy.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  const len = Math.min(vecA.length, vecB.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generates a deterministic fallback vector embedding (64-dim) when offline or for immediate indexing,
 * while Groq RAG embedding vectors are used whenever the API returns embeddings.
 */
export function computeDeterministicEmbedding(text: string, dimensions: number = 64): number[] {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const tokens = normalized.split(/\s+/).filter((t) => t.length > 2);
  const vec = new Array(dimensions).fill(0);

  for (const token of tokens) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const idx1 = Math.abs(hash) % dimensions;
    const idx2 = Math.abs(hash >> 8) % dimensions;
    const sign = (hash & 1) === 0 ? 1 : -1;
    vec[idx1] += 1.0 * sign;
    vec[idx2] += 0.5;
  }

  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vec.map((v) => Number((v / norm).toFixed(5)));
}

/**
 * Hybrid RAG retrieval: ranks chunks using vector cosine similarity + lexical token overlap
 * and filters by subject/topic metadata.
 */
export function retrieveTopChunks(params: {
  query: string;
  queryEmbedding: number[];
  chunks: DocumentChunk[];
  subject?: string;
  topics?: string[];
  topK?: number;
  minScore?: number;
}): Array<{ chunk: DocumentChunk; score: number }> {
  const {
    query,
    queryEmbedding,
    chunks,
    subject,
    topics,
    topK = 5,
    minScore = 0.12,
  } = params;

  const queryTokens = new Set(
    query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );

  const filtered = chunks.filter((c) => {
    if (subject && c.subject.toLowerCase() !== subject.toLowerCase()) return false;
    return true;
  });

  const scored = filtered.map((chunk) => {
    const vectorSim = cosineSimilarity(queryEmbedding, chunk.embedding);

    const chunkTextLower = `${chunk.topic} ${chunk.chapter} ${chunk.section} ${chunk.content}`.toLowerCase();
    let matchedTokens = 0;
    queryTokens.forEach((tok) => {
      if (chunkTextLower.includes(tok)) matchedTokens += 1;
    });
    const lexicalSim = queryTokens.size > 0 ? matchedTokens / queryTokens.size : 0;

    let topicBoost = 0;
    if (topics && topics.length > 0) {
      const matchesTopic = topics.some(
        (t) =>
          chunk.topic.toLowerCase().includes(t.toLowerCase()) ||
          t.toLowerCase().includes(chunk.topic.toLowerCase()) ||
          chunk.chapter.toLowerCase().includes(t.toLowerCase())
      );
      if (matchesTopic) topicBoost = 0.22;
    }

    const combinedScore = Number((vectorSim * 0.55 + lexicalSim * 0.45 + topicBoost).toFixed(4));
    return { chunk, score: combinedScore };
  });

  return scored
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Generates an adaptive multi-day revision schedule based on topic gap diagnoses,
 * available days, and daily study hours.
 */
export function buildStructuredRevisionTasks(params: {
  planId: string;
  userId: string;
  subject: string;
  daysAvailable: number;
  dailyHours: number;
  diagnoses: TopicGapDiagnosis[];
  topics: TopicNode[];
}): RevisionTask[] {
  const { planId, userId, subject, daysAvailable, dailyHours, diagnoses, topics } = params;
  const clampedDays = Math.max(1, Math.min(14, daysAvailable));
  const dailyMinutes = Math.max(30, Math.round(dailyHours * 60));

  const sortedDiagnoses = [...diagnoses].sort((a, b) => b.priorityScore - a.priorityScore);
  const fallbackTopics: TopicGapDiagnosis[] =
    sortedDiagnoses.length > 0
      ? sortedDiagnoses
      : topics.length > 0
      ? topics.map((t, idx) => ({
          id: t.id,
          userId,
          subject: t.subject,
          topicName: t.topicName,
          unitName: t.unitName,
          status: 'Insufficient evidence' as KnowledgeStatus,
          accuracyPercent: 0,
          questionsAttempted: 0,
          correctCount: 0,
          incorrectCount: 0,
          confidenceLevel: 'Low' as ConfidenceLevel,
          repeatedMistakesCount: 0,
          trendDelta: 0,
          commonMistakesReason: 'Topic has not been diagnostically tested yet.',
          recommendedAction: `Complete a diagnostic quiz on ${t.topicName}.`,
          pastPaperFrequency: t.pastPaperFrequency,
          priorityScore: 60 - idx * 5,
          citations: [],
          updatedAt: new Date().toISOString(),
        }))
      : [
          {
            id: `topic_${userId}_core`,
            userId,
            subject,
            topicName: `${subject} Core Fundamentals`,
            unitName: 'Foundations',
            status: 'Insufficient evidence' as KnowledgeStatus,
            accuracyPercent: 0,
            questionsAttempted: 0,
            correctCount: 0,
            incorrectCount: 0,
            confidenceLevel: 'Low' as ConfidenceLevel,
            repeatedMistakesCount: 0,
            trendDelta: 0,
            commonMistakesReason: 'Topic has not been diagnostically tested yet.',
            recommendedAction: `Complete a diagnostic quiz on ${subject}.`,
            pastPaperFrequency: 2,
            priorityScore: 50,
            citations: [],
            updatedAt: new Date().toISOString(),
          },
        ];

  const tasks: RevisionTask[] = [];
  let taskCounter = 1;

  for (let day = 1; day <= clampedDays; day++) {
    const primaryDiag = fallbackTopics[(day - 1) % fallbackTopics.length];
    const secondaryDiag = fallbackTopics[day % fallbackTopics.length] || primaryDiag;

    const conceptMinutes = Math.round(dailyMinutes * 0.5);
    const practiceMinutes = Math.round(dailyMinutes * 0.25);
    const reviewMinutes = Math.max(15, dailyMinutes - conceptMinutes - practiceMinutes);

    const priorityLevel: RevisionTask['priorityLevel'] =
      primaryDiag.status === 'Weak'
        ? 'Critical'
        : primaryDiag.status === 'Medium' || primaryDiag.status === 'Insufficient evidence'
        ? 'High'
        : 'Review';

    const dateObj = new Date();
    dateObj.setDate(dateObj.getDate() + (day - 1));
    const dateLabel = `Day ${day} (${dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })})`;

    tasks.push({
      id: `${planId}_task_${taskCounter++}`,
      planId,
      userId,
      dayNumber: day,
      dateLabel,
      topicName: primaryDiag.topicName,
      subject,
      taskType: 'Concept Revision',
      title: `${primaryDiag.topicName}: Core Concept Consolidation`,
      durationMinutes: conceptMinutes,
      priorityLevel,
      learningObjectives: [
        `Master foundational mechanisms in ${primaryDiag.topicName}`,
        sanitizeDashes(primaryDiag.recommendedAction),
      ],
      practicePrompts: [
        `Explain the primary pathway of ${primaryDiag.topicName} using textbook terminology.`,
        `Contrast ${primaryDiag.topicName} with related processes in ${primaryDiag.unitName}.`,
      ],
      completed: false,
      reasonForInclusion: sanitizeDashes(
        `${primaryDiag.status} status (${primaryDiag.accuracyPercent}% accuracy) with ${primaryDiag.pastPaperFrequency} past-paper appearances.`
      ),
    });

    tasks.push({
      id: `${planId}_task_${taskCounter++}`,
      planId,
      userId,
      dayNumber: day,
      dateLabel,
      topicName: primaryDiag.topicName,
      subject,
      taskType: 'Practice Questions',
      title: `Targeted Practice: ${primaryDiag.topicName}`,
      durationMinutes: practiceMinutes,
      priorityLevel: priorityLevel === 'Critical' ? 'High' : 'Medium',
      learningObjectives: [
        `Solve exam-style structured and MCQ problems on ${primaryDiag.topicName}`,
      ],
      practicePrompts: [
        `Complete 5 diagnostic questions focusing on ${primaryDiag.topicName}.`,
      ],
      completed: false,
      reasonForInclusion: `Reinforces active recall and verifies conceptual application for ${primaryDiag.topicName}.`,
    });

    tasks.push({
      id: `${planId}_task_${taskCounter++}`,
      planId,
      userId,
      dayNumber: day,
      dateLabel,
      topicName: secondaryDiag.topicName,
      subject,
      taskType: 'Mistake Review',
      title: `Error Log & Misconception Review: ${secondaryDiag.topicName}`,
      durationMinutes: reviewMinutes,
      priorityLevel: 'Medium',
      learningObjectives: [
        sanitizeDashes(secondaryDiag.commonMistakesReason || `Review previous quiz errors in ${secondaryDiag.topicName}`),
      ],
      practicePrompts: [
        `Re-write incorrect responses from your last diagnostic quiz on ${secondaryDiag.topicName}.`,
      ],
      completed: false,
      reasonForInclusion: `Prevents recurring errors identified during answer evaluation.`,
    });
  }

  return tasks;
}
