import crypto from 'node:crypto';
import {
  Citation,
  DiagnosticQuiz,
  DifficultyLevel,
  DocumentChunk,
  QuestionType,
  QuizQuestion,
  QuizSubmissionAnswer,
} from '../types';
import { sanitizeDashes } from '../domain/engine';
import { ragRetrievalService } from './ragRetrievalService';
import {
  evaluateSubmittedAnswers,
  generateEmbeddingVector,
  getGroqClient,
  GROQ_DEFAULT_MODEL,
} from './groqService';
import { repo } from './repository';
import { generateStructuredData, quizQuestionsSchema, PROMPTS } from './ai';

export interface GenerateQuizParams {
  userId: string;
  subject: string;
  topics?: string[];
  questionCount?: number;
  difficulty?: DifficultyLevel | 'Mixed';
  questionTypes?: QuestionType[];
  timeLimitMinutes?: number;
  token?: string;
}

export interface QuizSubmissionParams {
  quizId: string;
  userId: string;
  answers: Record<string, string>;
  durationSeconds: number;
  token?: string;
}

/**
 * Validates whether a question matches the strict diagnostic schema.
 */
function isValidQuestion(q: any, allowedTypes: QuestionType[]): boolean {
  if (!q || typeof q !== 'object') return false;
  if (!q.questionText || typeof q.questionText !== 'string' || q.questionText.trim().length < 5) {
    return false;
  }
  if (!q.topic || typeof q.topic !== 'string') return false;
  if (!q.correctAnswer || typeof q.correctAnswer !== 'string' || q.correctAnswer.trim().length === 0) {
    return false;
  }
  if (!['MCQ', 'TrueFalse', 'FillBlank', 'ShortAnswer'].includes(q.questionType)) {
    return false;
  }
  if (q.questionType === 'MCQ') {
    if (!Array.isArray(q.options) || q.options.length < 2) return false;
  }
  return true;
}

/**
 * Creates a deterministic, grounded question from a retrieved chunk.
 */
function buildDeterministicGroundedQuestion(params: {
  quizId: string;
  index: number;
  chunk: DocumentChunk;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
}): QuizQuestion {
  const { quizId, index, chunk, questionType, difficulty } = params;
  const sentences = chunk.content
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  const primarySentence = sanitizeDashes(sentences[0] || chunk.content.slice(0, 150));
  const secondarySentence = sanitizeDashes(sentences[1] || primarySentence);

  const citation: Citation = {
    chunkId: chunk.id,
    documentName: chunk.documentName,
    chapter: chunk.chapter,
    pageNumber: chunk.pageNumber,
    section: chunk.section,
    excerpt: sanitizeDashes(chunk.content.slice(0, 240)),
  };

  const qId = `${quizId}_q_${index + 1}`;

  if (questionType === 'TrueFalse') {
    return {
      id: qId,
      quizId,
      topic: chunk.topic,
      subtopic: chunk.section,
      questionType: 'TrueFalse',
      difficulty,
      questionText: `True or False: According to ${chunk.chapter} (${chunk.section}), ${primarySentence.charAt(0).toLowerCase() + primarySentence.slice(1)}.`,
      options: ['True', 'False'],
      correctAnswer: 'True',
      maxMarks: 1,
      explanation: `Verified directly from ${chunk.documentName} (Page ${chunk.pageNumber}, ${chunk.section}): "${primarySentence}."`,
      citation,
    };
  }

  if (questionType === 'FillBlank') {
    return {
      id: qId,
      quizId,
      topic: chunk.topic,
      subtopic: chunk.section,
      questionType: 'FillBlank',
      difficulty,
      questionText: `In ${chunk.chapter}, section "${chunk.section}" establishes that the fundamental biological process or structure is ________.`,
      correctAnswer: chunk.topic,
      maxMarks: 1,
      explanation: `This section on Page ${chunk.pageNumber} directly addresses ${chunk.topic} (${chunk.section}).`,
      citation,
    };
  }

  if (questionType === 'ShortAnswer') {
    return {
      id: qId,
      quizId,
      topic: chunk.topic,
      subtopic: chunk.section,
      questionType: 'ShortAnswer',
      difficulty,
      questionText: `Based on ${chunk.chapter} (${chunk.section}), explain the key mechanism described on Page ${chunk.pageNumber}.`,
      correctAnswer: `${primarySentence} ${secondarySentence}`.trim(),
      maxMarks: 2,
      explanation: `Full credit requires referencing the mechanism in ${chunk.section}: ${primarySentence}`,
      citation,
    };
  }

  // MCQ Default
  const correctOpt = primarySentence.slice(0, 110);
  const distractor1 = secondarySentence.slice(0, 110) || 'It operates independently of cellular organelle coordination';
  const distractor2 = 'It prevents substrate phosphorylation by altering intracellular pH';
  const distractor3 = 'It occurs exclusively within extracellular fluid compartments';

  const options = [
    correctOpt,
    sanitizeDashes(distractor1),
    sanitizeDashes(distractor2),
    sanitizeDashes(distractor3),
  ];

  return {
    id: qId,
    quizId,
    topic: chunk.topic,
    subtopic: chunk.section,
    questionType: 'MCQ',
    difficulty,
    questionText: `Which statement accurately describes ${chunk.section} in ${chunk.topic} according to the study text?`,
    options,
    correctAnswer: correctOpt,
    maxMarks: 1,
    explanation: `Grounded in ${chunk.documentName}, Page ${chunk.pageNumber} (${chunk.section}): ${primarySentence}`,
    citation,
  };
}

export const quizGeneratorService = {
  /**
   * Generates a grounded diagnostic quiz using RAG retrieval for each selected topic
   * and Groq for structured assessment question generation.
   */
  async generateDiagnosticQuiz(params: GenerateQuizParams): Promise<DiagnosticQuiz> {
    const {
      userId,
      subject = 'Biology',
      topics = [],
      questionCount = 5,
      difficulty = 'Mixed',
      questionTypes = ['MCQ', 'TrueFalse', 'FillBlank', 'ShortAnswer'],
      timeLimitMinutes = 15,
      token,
    } = params;

    if (!userId || !userId.trim()) {
      throw new Error('Authentication Error: Student ID is required to generate a quiz.');
    }

    const allChunks = await repo.getChunks(userId, subject, undefined, token);
    if (allChunks.length === 0) {
      throw new Error(
        `No indexed study materials found for "${subject}". Please upload study material before generating a diagnostic quiz.`
      );
    }

    const selectedTopics: string[] =
      Array.isArray(topics) && topics.length > 0
        ? topics
        : Array.from(new Set(allChunks.map((c) => c.topic)));

    const count = Math.max(1, Math.min(20, Number(questionCount) || 5));
    const allowedTypes: QuestionType[] =
      Array.isArray(questionTypes) && questionTypes.length > 0
        ? questionTypes
        : ['MCQ', 'TrueFalse', 'FillBlank', 'ShortAnswer'];

    // 1. For each selected topic, retrieve relevant chunks using Gemini embeddings & pgvector
    const retrievedChunks: DocumentChunk[] = [];
    for (const topicName of selectedTopics) {
      try {
        const retrieval = await ragRetrievalService.retrieveChunks({
          query: `${subject} ${topicName}`,
          studentId: userId,
          subject,
          topics: [topicName],
          topK: 3,
          minScore: 0.05,
          token,
        });

        for (const rc of retrieval.chunks) {
          if (!retrievedChunks.some((existing) => existing.id === rc.chunkId)) {
            retrievedChunks.push({
              id: rc.chunkId,
              chunkId: rc.chunkId,
              materialId: rc.documentId,
              documentId: rc.documentId,
              userId: rc.studentId,
              studentId: rc.studentId,
              subject: rc.subject,
              documentName: rc.documentName,
              pageNumber: rc.pageNumber,
              chapter: rc.chapter,
              section: rc.section,
              topic: rc.topic || topicName,
              content: rc.content,
              extractedText: rc.content,
              embedding: [],
              chunkIndex: 0,
            });
          }
        }
      } catch (err: any) {
        console.warn(`RAG retrieval warning for topic "${topicName}":`, err.message);
      }
    }

    // Fallback if topic retrieval didn't return chunks
    const sourceChunks: DocumentChunk[] =
      retrievedChunks.length > 0 ? retrievedChunks : allChunks.slice(0, 10);

    const quizId = `quiz_${crypto.randomUUID().slice(0, 8)}`;
    const groq = getGroqClient();

    let generatedQuestions: QuizQuestion[] = [];

    // 2. Send retrieved content to Groq via Vercel AI SDK generateStructuredData with Zod schema
    if (sourceChunks.length > 0) {
      const chunkContext = sourceChunks
        .slice(0, 10)
        .map(
          (c) =>
            `[CHUNK_ID: ${c.id}] Document: ${c.documentName} | Chapter: ${c.chapter} | Page: ${c.pageNumber} | Section: ${c.section} | Topic: ${c.topic}\nContent: ${c.content}`
        )
        .join('\n\n');

      try {
        const promptSystem = [
          PROMPTS.quizGenerationPrompt,
          'Allowed question types: ' + allowedTypes.join(', '),
        ].join(' ');

        const promptUser = `Generate ${count} diagnostic assessment questions for subject "${subject}" across topics [${selectedTopics.join(', ')}].
Target difficulty: ${difficulty}.
Allowed formats: [${allowedTypes.join(', ')}].
Source excerpts:\n\n${chunkContext}`;

        const structuredOutput = await generateStructuredData({
          schema: quizQuestionsSchema,
          system: promptSystem,
          prompt: promptUser,
          fallback: () => ({ questions: [] }),
          operationName: 'generateDiagnosticQuiz',
        });

        const rawItems = structuredOutput.questions || [];

        if (Array.isArray(rawItems) && rawItems.length > 0) {
          const validated = rawItems
            .filter((item: any) => isValidQuestion(item, allowedTypes))
            .slice(0, count)
            .map((item: any, idx: number) => {
              const matchedChunk =
                sourceChunks.find((c) => c.id === item.citationChunkId) ||
                sourceChunks[idx % sourceChunks.length];

              const qType = (
                allowedTypes.includes(item.questionType)
                  ? item.questionType
                  : allowedTypes[idx % allowedTypes.length]
              ) as QuestionType;

              const qDiff = (
                ['Easy', 'Medium', 'Hard'].includes(item.difficulty)
                  ? item.difficulty
                  : difficulty === 'Mixed'
                  ? (['Easy', 'Medium', 'Hard'][idx % 3] as DifficultyLevel)
                  : difficulty
              ) as DifficultyLevel;

              const citation: Citation = {
                chunkId: matchedChunk.id,
                documentName: matchedChunk.documentName,
                chapter: matchedChunk.chapter,
                pageNumber: matchedChunk.pageNumber,
                section: matchedChunk.section,
                excerpt: sanitizeDashes(matchedChunk.content.slice(0, 240)),
              };

              let options: string[] | undefined = undefined;
              if (qType === 'MCQ') {
                const rawOpts: string[] = Array.isArray(item.options) ? item.options : [];
                const cleanOpts = rawOpts.map(sanitizeDashes);
                if (!cleanOpts.includes(sanitizeDashes(item.correctAnswer))) {
                  cleanOpts.unshift(sanitizeDashes(item.correctAnswer));
                }
                while (cleanOpts.length < 4) {
                  cleanOpts.push(`Alternative option ${cleanOpts.length + 1}`);
                }
                options = cleanOpts.slice(0, 4);
              } else if (qType === 'TrueFalse') {
                options = ['True', 'False'];
              }

              return {
                id: `${quizId}_q_${idx + 1}`,
                quizId,
                topic: sanitizeDashes(item.topic || matchedChunk.topic),
                subtopic: sanitizeDashes(item.subtopic || matchedChunk.section),
                questionType: qType,
                difficulty: qDiff,
                questionText: sanitizeDashes(item.questionText),
                options,
                correctAnswer: sanitizeDashes(item.correctAnswer),
                maxMarks: qType === 'ShortAnswer' ? 2 : 1,
                explanation: sanitizeDashes(item.explanation),
                citation,
              };
            });

          if (validated.length >= Math.min(count, 3)) {
            generatedQuestions = validated;
          }
        }
      } catch (err: any) {
        console.warn('Notice: Groq quiz generation failed, using deterministic grounding fallback:', err.message);
      }
    }

    // 3. Fallback: if Groq is unavailable or produced insufficient valid questions
    if (generatedQuestions.length < count) {
      for (let i = generatedQuestions.length; i < count; i++) {
        const chunk = sourceChunks[i % sourceChunks.length];
        const qType = allowedTypes[i % allowedTypes.length] || 'MCQ';
        const qDiff: DifficultyLevel =
          difficulty === 'Mixed'
            ? (['Easy', 'Medium', 'Hard'][i % 3] as DifficultyLevel)
            : difficulty;

        const groundedQ = buildDeterministicGroundedQuestion({
          quizId,
          index: i,
          chunk,
          questionType: qType,
          difficulty: qDiff,
        });
        generatedQuestions.push(groundedQ);
      }
    }

    const maxScore = generatedQuestions.reduce((acc, q) => acc + q.maxMarks, 0);

    const quiz: DiagnosticQuiz = {
      id: quizId,
      userId,
      title: `${subject} Diagnostic Assessment (${selectedTopics.slice(0, 2).join(', ')}${
        selectedTopics.length > 2 ? ` +${selectedTopics.length - 2}` : ''
      })`,
      subject: sanitizeDashes(subject),
      selectedTopics: selectedTopics.map(sanitizeDashes),
      difficulty,
      timeLimitMinutes: Math.max(5, Math.min(60, Number(timeLimitMinutes) || 15)),
      status: 'InProgress',
      questions: generatedQuestions,
      answers: [],
      totalScore: 0,
      maxScore,
      accuracyPercent: 0,
      durationSeconds: 0,
      isSample: false,
      createdAt: new Date().toISOString(),
    };

    // 4. Save the generated quiz to the repository (Supabase + local SQLite)
    await repo.saveQuiz(quiz, token);

    return quiz;
  },

  /**
   * Sanitizes a quiz before sending to the student.
   * If the quiz is InProgress, answers and explanations are strictly stripped to prevent cheating.
   */
  getSanitizedQuizForStudent(quiz: DiagnosticQuiz): DiagnosticQuiz {
    if (quiz.status === 'InProgress') {
      return {
        ...quiz,
        questions: quiz.questions.map((q) => {
          const { correctAnswer, explanation, ...safeQ } = q;
          return {
            ...safeQ,
            correctAnswer: '',
            explanation: '',
          } as QuizQuestion;
        }),
      };
    }
    return quiz;
  },

  /**
   * Saves in-progress draft answers to ensure students don't lose work on page refresh.
   */
  async saveQuizDraftProgress(params: {
    quizId: string;
    userId: string;
    answers: Record<string, string>;
    remainingSeconds?: number;
    token?: string;
  }): Promise<{ success: boolean }> {
    const { quizId, userId, answers, token } = params;
    const quiz = await repo.getQuizById(quizId, userId, token);
    if (!quiz) {
      throw new Error('Quiz not found.');
    }
    if (quiz.status === 'Completed') {
      throw new Error('Cannot update progress on an already completed assessment.');
    }

    // Save partial answers into the quiz entity
    const partialAnswers: QuizSubmissionAnswer[] = Object.entries(answers).map(
      ([qId, response]) => {
        const question = quiz.questions.find((q) => q.id === qId);
        return {
          questionId: qId,
          topic: question?.topic || 'General',
          subtopic: question?.subtopic || 'General',
          studentResponse: sanitizeDashes(response),
          correctAnswer: '',
          isCorrect: false,
          marksEarned: 0,
          maxMarks: question?.maxMarks || 1,
          evaluationExplanation: 'Draft response saved.',
          difficulty: question?.difficulty || 'Medium',
          citation: question?.citation || {
            chunkId: '',
            documentName: '',
            chapter: '',
            pageNumber: 1,
            section: '',
            excerpt: '',
          },
        };
      }
    );

    const updated = {
      ...quiz,
      answers: partialAnswers,
    };
    await repo.saveQuiz(updated, token);
    return { success: true };
  },

  /**
   * Evaluates submitted answers, prevents duplicate submissions,
   * calculates final scores, and persists completed state.
   */
  async submitAndEvaluateQuiz(params: QuizSubmissionParams): Promise<{
    completedQuiz: DiagnosticQuiz;
    evaluatedAnswers: QuizSubmissionAnswer[];
  }> {
    const { quizId, userId, answers, durationSeconds, token } = params;

    const quiz = await repo.getQuizById(quizId, userId, token);
    if (!quiz) {
      throw new Error('Quiz not found.');
    }

    // Security & Integrity Guard: Prevent duplicate submissions
    if (quiz.status === 'Completed') {
      const duplicateError: any = new Error(
        'This diagnostic assessment has already been submitted and completed.'
      );
      duplicateError.statusCode = 400;
      duplicateError.quiz = quiz;
      throw duplicateError;
    }

    // Evaluate answers using Groq semantic evaluation for ShortAnswers and exact matching for others
    const evaluatedAnswers = await evaluateSubmittedAnswers({
      questions: quiz.questions,
      userResponses: answers,
    });

    const totalScore =
      Math.round(evaluatedAnswers.reduce((acc, a) => acc + a.marksEarned, 0) * 10) / 10;
    const maxScore = Math.max(1, evaluatedAnswers.reduce((acc, a) => acc + a.maxMarks, 0));
    const accuracyPercent = Math.round((totalScore / maxScore) * 100);

    const completedQuiz: DiagnosticQuiz = {
      ...quiz,
      status: 'Completed',
      answers: evaluatedAnswers,
      totalScore,
      maxScore,
      accuracyPercent,
      durationSeconds: Math.max(1, Number(durationSeconds) || 60),
      completedAt: new Date().toISOString(),
    };

    // Save completed assessment with full results and citations to Supabase / SQLite
    await repo.saveQuiz(completedQuiz, token);

    return {
      completedQuiz,
      evaluatedAnswers,
    };
  },
};

