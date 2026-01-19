import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TestModuleWithQuestions } from '@/services/exam';

interface ExamState {
  attemptId: number | null;
  currentModule: TestModuleWithQuestions | null;
  currentQuestionIndex: number;
  answers: Record<number, string>; // questionId -> answer
  flags: Record<number, boolean>; // questionId -> isFlagged
  timeLeft: number; // in seconds
  isReviewOpen: boolean;
  zoomLevel: number; // 0.75 to 1.5

  // Actions
  initializeExam: (attemptId: number, module: TestModuleWithQuestions) => void;
  setAnswer: (questionId: number, answer: string) => void;
  toggleFlag: (questionId: number) => void;
  setQuestionIndex: (index: number) => void;
  tickTimer: () => void;
  toggleReview: () => void;
  setZoomLevel: (level: number) => void;
  clearModule: () => void;
  resetExam: () => void;
}

export const useExamStore = create<ExamState>()(
  persist(
    (set) => ({
      attemptId: null,
      currentModule: null,
      currentQuestionIndex: 0,
      answers: {},
      flags: {},
      timeLeft: 0,
      isReviewOpen: false,
      zoomLevel: 1,

      initializeExam: (attemptId, module) => set((state) => {
        // If we are already on this module, don't reset answers/flags
        const isResuming = state.attemptId === attemptId && state.currentModule?.id === module.id;

        return {
          attemptId,
          currentModule: module,
          currentQuestionIndex: isResuming ? state.currentQuestionIndex : 0,
          answers: isResuming ? state.answers : {},
          flags: isResuming ? state.flags : {},
          // Use server-provided time if available, otherwise fallback to limit
          timeLeft: module.remaining_seconds ?? (module.time_limit_minutes * 60),
          isReviewOpen: false,
        };
      }),

      setAnswer: (questionId, answer) => set((state) => ({
        answers: { ...state.answers, [questionId]: answer }
      })),

      toggleFlag: (questionId) => set((state) => ({
        flags: { ...state.flags, [questionId]: !state.flags[questionId] }
      })),

      setQuestionIndex: (index) => set({ currentQuestionIndex: index }),

      tickTimer: () => set((state) => ({
        timeLeft: Math.max(0, state.timeLeft - 1)
      })),

      toggleReview: () => set((state) => ({ isReviewOpen: !state.isReviewOpen })),

      setZoomLevel: (level) => set({ zoomLevel: Math.max(0.75, Math.min(1.5, level)) }),

      clearModule: () => set({
        currentModule: null,
        currentQuestionIndex: 0,
        isReviewOpen: false
      }),

      resetExam: () => set({
        attemptId: null,
        currentModule: null,
        currentQuestionIndex: 0,
        answers: {},
        flags: {},
        timeLeft: 0,
        isReviewOpen: false,
        // Keep zoom level preference across exams
      }),
    }),
    {
      name: 'exam-storage',
      // Only persist these keys for recovery
      partialize: (state) => ({
        attemptId: state.attemptId,
        currentModule: state.currentModule,
        currentQuestionIndex: state.currentQuestionIndex,
        answers: state.answers,
        flags: state.flags,
        timeLeft: state.timeLeft,
        zoomLevel: state.zoomLevel,
      }),
    }
  )
);

