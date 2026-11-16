import {
  Citation,
  ConfidenceLevel,
  DifficultyLevel,
  DocumentChunk,
  KnowledgeStatus,
  QuestionType,
  QuizQuestion,
  QuizSubmissionAnswer,
  TopicGapDiagnosis,
  TopicNode,
  DiagnosticQuiz,
} from '../types';
import {
  calculateConfidenceLevel,
  calculateRevisionPriorityScore,
  classifyKnowledgeStatus,
  computeTopicPerformance,
  sanitizeDashes,
} from '../domain/engine';
import { getGroqClient, GROQ_DEFAULT_MODEL } from './groqService';
import { generateStructuredData, semanticEvaluationSchema, PROMPTS } from './ai';

export interface SemanticEvaluationOutput {
  correctness: boolean;
  awarded_marks: number;
  maximum_marks: number;
  missing_concepts: string[];
  explanation: string;
  evidence_used: string;
}

export interface CalculateGapAnalysisParams {
  userId: string;
  subject?: string;
  quizzes: DiagnosticQuiz[];
  topics: TopicNode[];
  existingDiagnoses?: TopicGapDiagnosis[];
  chunks?: DocumentChunk[];
}

/**
 * Core Intelligence Engine of GapFinder AI.
 * 
 * Combines Groq LLM inference for nuanced semantic short-answer evaluation
 * with deterministic backend logic for objective grading, score aggregation,
 * and knowledge gap classification.
 */
export const intelligenceEngine = {
  /**
   * Evaluates a semantic short answer using Vercel AI SDK generateObject with Zod schema validation.
   * If Groq is unavailable or returns an error, falls back safely to deterministic concept-overlap evaluation.
   */
  async evaluateSemanticShortAnswer(params: {
    question: QuizQuestion;
    studentResponse: string;
  }): Promise<SemanticEvaluationOutput> {
    const { question, studentResponse } = params;
    const cleanStudent = sanitizeDashes(studentResponse.trim());
    const maxMarks = question.maxMarks || 2;

    const fallbackEvaluator = () =>
      this.evaluateShortAnswerDeterministically({
        question,
        cleanStudent,
        maxMarks,
      });

    if (!cleanStudent) {
      return fallbackEvaluator();
    }

    const retrievedEvidence = [
      `Document: ${question.citation.documentName}`,
      `Chapter: ${question.citation.chapter}`,
      `Section: ${question.citation.section}`,
      `Page: ${question.citation.pageNumber}`,
      `Evidence Excerpt: "${question.citation.excerpt}"`,
    ].join(' | ');

    const promptUser = [
      `Question: ${question.questionText}`,
      `Reference Answer: ${question.correctAnswer}`,
      `Maximum Marks: ${maxMarks}`,
      `Retrieved Evidence: ${retrievedEvidence}`,
      `Student Response: ${cleanStudent}`,
    ].join('\n');

    try {
      const evaluation = await generateStructuredData({
        schema: semanticEvaluationSchema,
        system: PROMPTS.semanticEvaluationPrompt,
        prompt: promptUser,
        fallback: fallbackEvaluator,
        operationName: 'evaluateSemanticShortAnswer',
      });

      const clampedMarks = Math.max(0, Math.min(maxMarks, Number(evaluation.awarded_marks)));
      return {
        correctness: Boolean(evaluation.correctness),
        awarded_marks: Math.round(clampedMarks * 10) / 10,
        maximum_marks: maxMarks,
        missing_concepts: Array.isArray(evaluation.missing_concepts)
          ? evaluation.missing_concepts.map(sanitizeDashes)
          : [],
        explanation: sanitizeDashes(evaluation.explanation || question.explanation || 'Semantic evaluation completed.'),
        evidence_used: sanitizeDashes(
          evaluation.evidence_used || `${question.citation.documentName} (Page ${question.citation.pageNumber})`
        ),
      };
    } catch {
      return fallbackEvaluator();
    }
  },

  /**
   * Deterministic semantic keyword and concept overlap evaluator for short answers.
   */
  evaluateShortAnswerDeterministically(params: {
    question: QuizQuestion;
    cleanStudent: string;
    maxMarks: number;
  }): SemanticEvaluationOutput {
    const { question, cleanStudent, maxMarks } = params;

    if (!cleanStudent || cleanStudent.length === 0) {
      return {
        correctness: false,
        awarded_marks: 0,
        maximum_marks: maxMarks,
        missing_concepts: ['Complete response omitted'],
        explanation: `0/${maxMarks} marks: No response provided. ${question.explanation}`,
        evidence_used: `${question.citation.documentName} (Page ${question.citation.pageNumber})`,
      };
    }

    // Extract key concepts from reference answer
    const refWords = question.correctAnswer
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !['with', 'from', 'that', 'this', 'into', 'each', 'turn'].includes(w));

    const studentLower = cleanStudent.toLowerCase();
    const matched = refWords.filter((w) => studentLower.includes(w));
    const missing = refWords.filter((w) => !studentLower.includes(w));
    const ratio = refWords.length > 0 ? matched.length / refWords.length : 0;

    let awarded_marks = 0;
    let explanation = '';
    let correctness = false;

    if (ratio >= 0.45) {
      awarded_marks = maxMarks;
      correctness = true;
      explanation = `Full marks (${maxMarks}/${maxMarks}): Response accurately explains key mechanisms. Grounded in ${question.citation.documentName} (Page ${question.citation.pageNumber}, ${question.citation.section}): ${question.explanation}`;
    } else if (ratio >= 0.2) {
      awarded_marks = Math.round((maxMarks / 2) * 10) / 10;
      correctness = false;
      explanation = `Partial credit (${awarded_marks}/${maxMarks}): Mentioned key concepts (${matched.slice(0, 3).join(', ')}), but omitted core details: ${question.correctAnswer}`;
    } else {
      awarded_marks = 0;
      correctness = false;
      explanation = `0/${maxMarks} marks: Response missed the required biological mechanism in ${question.citation.section}. Grounded in ${question.citation.documentName} (Page ${question.citation.pageNumber}): ${question.explanation}`;
    }

    const missingConcepts = missing.slice(0, 3).map((w) => `Key concept: ${w}`);

    return {
      correctness,
      awarded_marks,
      maximum_marks: maxMarks,
      missing_concepts: missingConcepts,
      explanation: sanitizeDashes(explanation),
      evidence_used: `${question.citation.documentName} (Page ${question.citation.pageNumber}, ${question.citation.section})`,
    };
  },

  /**
   * Evaluates an individual quiz response.
   * Objective questions (MCQ, True/False, Fill in Blank) are strictly evaluated deterministically.
   * Short answers are evaluated semantically using Groq with structured outputs.
   */
  async evaluateSingleAnswer(params: {
    question: QuizQuestion;
    studentResponse: string;
  }): Promise<QuizSubmissionAnswer> {
    const { question, studentResponse } = params;
    const cleanStudent = sanitizeDashes((studentResponse || '').trim());
    const maxMarks = question.maxMarks || 1;

    // 1. Unanswered Question Handling
    if (!cleanStudent) {
      return {
        questionId: question.id,
        topic: question.topic,
        subtopic: question.subtopic,
        studentResponse: '(Unanswered)',
        correctAnswer: question.correctAnswer,
        isCorrect: false,
        marksEarned: 0,
        maxMarks,
        evaluationExplanation: `Question was left unanswered. Grounded in ${question.citation.documentName} (Page ${question.citation.pageNumber}): ${question.explanation}`,
        difficulty: question.difficulty,
        citation: question.citation,
        missingConcepts: ['Response omitted'],
        evidenceUsed: `${question.citation.documentName} (Page ${question.citation.pageNumber})`,
      };
    }

    // 2. Objective MCQ / TrueFalse Evaluation (Deterministic)
    if (question.questionType === 'MCQ' || question.questionType === 'TrueFalse') {
      const isCorrect = cleanStudent.toLowerCase() === question.correctAnswer.toLowerCase();
      const marksEarned = isCorrect ? maxMarks : 0;
      const evaluationExplanation = isCorrect
        ? `Correct! Grounded in ${question.citation.documentName} (Page ${question.citation.pageNumber}): ${question.explanation}`
        : `Incorrect. You selected "${cleanStudent}", expected "${question.correctAnswer}". Grounded in ${question.citation.documentName} (Page ${question.citation.pageNumber}): ${question.explanation}`;

      return {
        questionId: question.id,
        topic: question.topic,
        subtopic: question.subtopic,
        studentResponse: cleanStudent,
        correctAnswer: question.correctAnswer,
        isCorrect,
        marksEarned,
        maxMarks,
        evaluationExplanation: sanitizeDashes(evaluationExplanation),
        difficulty: question.difficulty,
        citation: question.citation,
        missingConcepts: isCorrect ? [] : [question.correctAnswer],
        evidenceUsed: `${question.citation.documentName} (Page ${question.citation.pageNumber})`,
      };
    }

    // 3. Objective Fill in the Blank Evaluation (Deterministic)
    if (question.questionType === 'FillBlank') {
      const normStudent = cleanStudent.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const normCorrect = question.correctAnswer.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

      const isCorrect =
        normStudent === normCorrect ||
        (normCorrect.includes(normStudent) && normStudent.length >= 4) ||
        normStudent.includes(normCorrect);

      const marksEarned = isCorrect ? maxMarks : 0;
      const evaluationExplanation = isCorrect
        ? `Correct! "${cleanStudent}" matches the required concept. ${question.explanation}`
        : `Incorrect. Expected "${question.correctAnswer}". Grounded in ${question.citation.documentName} (Page ${question.citation.pageNumber}): ${question.explanation}`;

      return {
        questionId: question.id,
        topic: question.topic,
        subtopic: question.subtopic,
        studentResponse: cleanStudent,
        correctAnswer: question.correctAnswer,
        isCorrect,
        marksEarned,
        maxMarks,
        evaluationExplanation: sanitizeDashes(evaluationExplanation),
        difficulty: question.difficulty,
        citation: question.citation,
        missingConcepts: isCorrect ? [] : [question.correctAnswer],
        evidenceUsed: `${question.citation.documentName} (Page ${question.citation.pageNumber})`,
      };
    }

    // 4. Semantic Short Answer Evaluation (Groq + Structured JSON Validation)
    const semanticResult = await this.evaluateSemanticShortAnswer({
      question,
      studentResponse: cleanStudent,
    });

    return {
      questionId: question.id,
      topic: question.topic,
      subtopic: question.subtopic,
      studentResponse: cleanStudent,
      correctAnswer: question.correctAnswer,
      isCorrect: semanticResult.correctness,
      marksEarned: semanticResult.awarded_marks,
      maxMarks: semanticResult.maximum_marks,
      evaluationExplanation: semanticResult.explanation,
      difficulty: question.difficulty,
      citation: question.citation,
      missingConcepts: semanticResult.missing_concepts,
      evidenceUsed: semanticResult.evidence_used,
    };
  },

  /**
   * Deterministic Knowledge Gap Analysis Engine.
   *
   * Analyzes actual student assessment data across multiple attempts.
   * Strictly enforces deterministic scoring thresholds:
   * - 0-49%: Weak
   * - 50-74%: Medium
   * - 75-100%: Strong
   * - < 2 questions: Insufficient evidence
   *
   * Considers:
   * - Accuracy (difficulty-weighted)
   * - Questions attempted
   * - Difficulty coverage
   * - Repeated mistakes / recurring misconceptions
   * - Historical performance & trend delta
   */
  calculateGapAnalysis(params: CalculateGapAnalysisParams): TopicGapDiagnosis[] {
    const { userId, subject = 'Biology', quizzes, topics, existingDiagnoses = [], chunks = [] } = params;

    const completedQuizzes = quizzes.filter((q) => q.status === 'Completed');
    const existingByTopic = new Map<string, TopicGapDiagnosis>();
    for (const g of existingDiagnoses) {
      existingByTopic.set(g.topicName.toLowerCase(), g);
    }

    // Collect answers grouped by topic across all quiz attempts
    const answersByTopic = new Map<string, QuizSubmissionAnswer[]>();
    const firstAttemptAccuracy = new Map<string, number>();
    const latestAttemptAccuracy = new Map<string, number>();

    for (const quiz of completedQuizzes) {
      const perQuizAnswers = new Map<string, QuizSubmissionAnswer[]>();

      for (const ans of quiz.answers) {
        const tKey = ans.topic.trim();
        const fullList = answersByTopic.get(tKey) || [];
        fullList.push(ans);
        answersByTopic.set(tKey, fullList);

        const qList = perQuizAnswers.get(tKey) || [];
        qList.push(ans);
        perQuizAnswers.set(tKey, qList);
      }

      for (const [tName, tAns] of perQuizAnswers.entries()) {
        const perf = computeTopicPerformance(tAns);
        if (!firstAttemptAccuracy.has(tName)) {
          firstAttemptAccuracy.set(tName, perf.accuracyPercent);
        }
        latestAttemptAccuracy.set(tName, perf.accuracyPercent);
      }
    }

    // Union of all known syllabus topics and assessed topics
    const allTopicNames = new Set<string>();
    for (const t of topics) allTopicNames.add(t.topicName);
    for (const k of answersByTopic.keys()) allTopicNames.add(k);

    // Preliminary status pass for prerequisite relationship weighting
    const prelimStatuses = new Map<string, KnowledgeStatus>();
    for (const tName of allTopicNames) {
      const ans = answersByTopic.get(tName) || [];
      const perf = computeTopicPerformance(ans);
      prelimStatuses.set(tName, classifyKnowledgeStatus(perf.accuracyPercent, perf.questionsAttempted));
    }

    const diagnoses: TopicGapDiagnosis[] = [];

    for (const tName of allTopicNames) {
      const topicNode = topics.find((t) => t.topicName.toLowerCase() === tName.toLowerCase());
      const prevGap = existingByTopic.get(tName.toLowerCase());
      const ans = answersByTopic.get(tName) || [];
      const perf = computeTopicPerformance(ans);

      // Preserve sample data only if demo user has no real answers on this topic
      const isPreservingSample = Boolean(
        prevGap && prevGap.isSample && completedQuizzes.every((q) => q.isSample) && ans.length === 0
      );

      const questionsAttempted = isPreservingSample ? prevGap!.questionsAttempted : perf.questionsAttempted;
      const accuracyPercent = isPreservingSample ? prevGap!.accuracyPercent : perf.accuracyPercent;
      const correctCount = isPreservingSample ? prevGap!.correctCount : perf.correctCount;
      const incorrectCount = isPreservingSample ? prevGap!.incorrectCount : perf.incorrectCount;

      // Deterministic classification strictly according to specification:
      // Questions < 2: Insufficient evidence
      // 0-49%: Weak
      // 50-74%: Medium
      // 75-100%: Strong
      let status: KnowledgeStatus;
      if (questionsAttempted < 2) {
        status = 'Insufficient evidence';
      } else if (accuracyPercent <= 49) {
        status = 'Weak';
      } else if (accuracyPercent <= 74) {
        // Borderline check: if repeated mistakes exist in same subtopic, prioritize Weak
        if (perf.repeatedMistakesCount >= 2 && accuracyPercent <= 55) {
          status = 'Weak';
        } else {
          status = 'Medium';
        }
      } else {
        status = 'Strong';
      }

      // Confidence level calculation
      const confidenceLevel: ConfidenceLevel = calculateConfidenceLevel(
        questionsAttempted,
        perf.hardOrMediumCount
      );

      // Historical trend delta
      const firstAcc = firstAttemptAccuracy.get(tName) ?? accuracyPercent;
      const lastAcc = latestAttemptAccuracy.get(tName) ?? accuracyPercent;
      const trendDelta = isPreservingSample ? prevGap!.trendDelta : lastAcc - firstAcc;

      // Collect repeated misconceptions from missed answers
      const incorrectAnswers = ans.filter((a) => !a.isCorrect);
      const subtopicMistakes: Record<string, number> = {};
      const missingConceptsList: string[] = [];

      for (const inc of incorrectAnswers) {
        const sub = inc.subtopic || tName;
        subtopicMistakes[sub] = (subtopicMistakes[sub] || 0) + 1;
        if (Array.isArray(inc.missingConcepts)) {
          for (const mc of inc.missingConcepts) {
            if (!missingConceptsList.includes(mc)) missingConceptsList.push(mc);
          }
        }
      }

      const repeatedSubtopics = Object.entries(subtopicMistakes)
        .filter(([, count]) => count >= 2)
        .map(([sub]) => sub);

      const repeatedMisconceptions =
        repeatedSubtopics.length > 0
          ? repeatedSubtopics.map((s) => `Recurring misconception in ${s}`)
          : missingConceptsList.slice(0, 3);

      // Reason for classification
      let reasonForClassification: string;
      if (isPreservingSample) {
        reasonForClassification = prevGap!.commonMistakesReason;
      } else if (status === 'Insufficient evidence') {
        reasonForClassification = `Insufficient assessment evidence (${questionsAttempted} question(s) attempted). At least 2 questions are required to establish an accurate diagnostic baseline.`;
      } else {
        const trendText =
          completedQuizzes.length > 1
            ? trendDelta > 0
              ? ` Improved by +${trendDelta}% across attempts.`
              : trendDelta < 0
              ? ` Declined by ${trendDelta}% on recent attempt.`
              : ' Consistent performance across attempts.'
            : '';

        const misconceptionText =
          repeatedMisconceptions.length > 0
            ? ` Repeated misconceptions identified: ${repeatedMisconceptions.join(', ')}.`
            : incorrectAnswers.length > 0
            ? ` Missed question focus: ${incorrectAnswers[incorrectAnswers.length - 1].subtopic}.`
            : ' Zero errors across tested subtopics.';

        reasonForClassification = `Classified as ${status} based on ${accuracyPercent}% accuracy across ${questionsAttempted} question(s) (${correctCount} correct, ${incorrectCount} incorrect, ${perf.hardOrMediumCount} Medium/Hard).${misconceptionText}${trendText}`;
      }

      // Recommended corrective action
      let recommendedAction: string;
      if (isPreservingSample) {
        recommendedAction = prevGap!.recommendedAction;
      } else if (status === 'Weak') {
        const targetSubtopics =
          repeatedSubtopics.length > 0
            ? repeatedSubtopics.join(' and ')
            : topicNode?.subtopics.slice(0, 2).join(', ') || 'core mechanisms';
        recommendedAction = `Prioritize 60-minute concept revision on ${tName} focusing on ${targetSubtopics}, then take a 5-question targeted diagnostic re-test.`;
      } else if (status === 'Medium') {
        recommendedAction = `Review error explanations for ${tName} and complete a medium/hard practice set to strengthen mastery above the 75% Strong threshold.`;
      } else if (status === 'Insufficient evidence') {
        recommendedAction = `Take a Diagnostic Quiz with at least 2 questions covering ${tName} to evaluate baseline conceptual mastery.`;
      } else {
        recommendedAction = `Maintain mastery with spaced retrieval review while dedicating available study hours to Weak priority topics.`;
      }

      // Prerequisite severity weighting
      const isPrereqForWeak = topics.some(
        (other) =>
          other.prerequisites.some((p) => p.toLowerCase() === tName.toLowerCase()) &&
          prelimStatuses.get(other.topicName) === 'Weak'
      );

      const pastPaperFrequency = topicNode?.pastPaperFrequency ?? prevGap?.pastPaperFrequency ?? 2;
      const syllabusWeight = topicNode?.syllabusWeight ?? 7;

      const priorityScore = calculateRevisionPriorityScore({
        status,
        accuracyPercent,
        pastPaperFrequency,
        syllabusWeight,
        isPrerequisiteForWeakTopic: isPrereqForWeak,
        repeatedMistakesCount: perf.repeatedMistakesCount,
      });

      // Citations linking to relevant textbook chunks
      const matchingChunks = chunks
        .filter((c) => c.topic.toLowerCase() === tName.toLowerCase())
        .slice(0, 2);

      const citations: Citation[] =
        prevGap && prevGap.citations.length > 0
          ? prevGap.citations
          : matchingChunks.map((c) => ({
              chunkId: c.id,
              documentName: c.documentName,
              chapter: c.chapter,
              pageNumber: c.pageNumber,
              section: c.section,
              excerpt: sanitizeDashes(c.content.slice(0, 200)),
            }));

      diagnoses.push({
        id: prevGap?.id || `gap_${userId}_${tName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        userId,
        subject: topicNode?.subject || prevGap?.subject || subject,
        topicName: tName,
        unitName: topicNode?.unitName || prevGap?.unitName || 'Core Curriculum',
        status,
        accuracyPercent,
        questionsAttempted,
        correctCount,
        incorrectCount,
        confidenceLevel,
        repeatedMistakesCount: perf.repeatedMistakesCount,
        repeatedMisconceptions,
        trendDelta,
        previousStatus: prevGap?.status || status,
        commonMistakesReason: sanitizeDashes(reasonForClassification),
        reasonForClassification: sanitizeDashes(reasonForClassification),
        recommendedAction: sanitizeDashes(recommendedAction),
        pastPaperFrequency,
        priorityScore,
        citations,
        isSample: isPreservingSample,
        updatedAt: new Date().toISOString(),
      });
    }

    diagnoses.sort((a, b) => b.priorityScore - a.priorityScore);
    return diagnoses;
  },
};

