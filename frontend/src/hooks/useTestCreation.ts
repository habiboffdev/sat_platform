/**
 * Custom hook for Test Creation workflow state management
 * Handles the entire flow from upload to submission
 */

import { useState, useCallback, useMemo } from 'react';
import type {
  TestMode,
  CreationStep,
  ParsedQuestion,
  TestCreationState,
  ModuleWithQuestions,
  ModuleDefinition,
} from '@/types/testCreation';
import {
  SAT_MODULES,
  getAdaptiveModules,
  getDefaultSeparators,
  getQuestionNumberInModule,
  validateQuestion,
} from '@/types/testCreation';
import type { QuestionOption } from '@/types/test';

export interface UseTestCreationReturn {
  // State
  state: TestCreationState;

  // Navigation
  goToStep: (step: CreationStep) => void;
  canProceed: () => boolean;
  nextStep: () => void;
  prevStep: () => void;

  // Test mode
  setTestMode: (mode: TestMode) => void;

  // Metadata
  setTestTitle: (title: string) => void;
  setTestDescription: (desc: string) => void;

  // Files
  setJsonFile: (file: File | null) => void;
  setPdfFile: (file: File | null) => void;

  // Questions
  setQuestions: (questions: ParsedQuestion[]) => void;
  updateQuestion: (index: number, updates: Partial<ParsedQuestion>) => void;
  deleteQuestion: (index: number) => void;
  reorderQuestions: (fromIndex: number, toIndex: number) => void;

  // Separators
  setSeparatorPosition: (moduleIndex: number, afterQuestionIndex: number) => void;
  resetSeparators: () => void;

  // Current selection
  setCurrentQuestionIndex: (index: number) => void;
  setCurrentModuleIndex: (index: number) => void;

  // UI
  toggleSidebar: () => void;

  // Computed
  modules: ModuleDefinition[];
  modulesWithQuestions: ModuleWithQuestions[];
  getQuestionModuleInfo: (globalIndex: number) => { moduleIndex: number; localNumber: number; module: ModuleDefinition };
  validationSummary: { total: number; valid: number; needsImage: number; needsAnswer: number };
  currentQuestion: ParsedQuestion | null;

  // Utilities
  parseJsonQuestions: (data: unknown) => ParsedQuestion[];
  normalizeQuestion: (q: unknown) => ParsedQuestion;
}

const STEP_ORDER: CreationStep[] = ['type', 'upload', 'separate', 'review', 'submit'];

const initialState: TestCreationState = {
  step: 'type',
  testMode: 'linear',
  testTitle: 'SAT Practice Test',
  testDescription: '',
  jsonFile: null,
  pdfFile: null,
  questions: [],
  separators: [],
  currentQuestionIndex: 0,
  currentModuleIndex: 0,
  sidebarCollapsed: false,
};

export function useTestCreation(): UseTestCreationReturn {
  const [state, setState] = useState<TestCreationState>(initialState);

  // Navigation
  const goToStep = useCallback((step: CreationStep) => {
    setState((s) => ({ ...s, step }));
  }, []);

  const canProceed = useCallback((): boolean => {
    switch (state.step) {
      case 'type':
        return true;
      case 'upload':
        return state.questions.length > 0;
      case 'separate':
        return state.separators.length > 0 && state.questions.length > 0;
      case 'review':
        return state.questions.every((q) => validateQuestion(q).valid);
      default:
        return false;
    }
  }, [state.step, state.questions, state.separators]);

  const nextStep = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(state.step);
    if (currentIndex < STEP_ORDER.length - 1) {
      setState((s) => ({ ...s, step: STEP_ORDER[currentIndex + 1] }));
    }
  }, [state.step]);

  const prevStep = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(state.step);
    if (currentIndex > 0) {
      setState((s) => ({ ...s, step: STEP_ORDER[currentIndex - 1] }));
    }
  }, [state.step]);

  // Test mode
  const setTestMode = useCallback((mode: TestMode) => {
    setState((s) => ({ ...s, testMode: mode }));
  }, []);

  // Metadata
  const setTestTitle = useCallback((title: string) => {
    setState((s) => ({ ...s, testTitle: title }));
  }, []);

  const setTestDescription = useCallback((desc: string) => {
    setState((s) => ({ ...s, testDescription: desc }));
  }, []);

  // Files
  const setJsonFile = useCallback((file: File | null) => {
    setState((s) => ({ ...s, jsonFile: file }));
  }, []);

  const setPdfFile = useCallback((file: File | null) => {
    setState((s) => ({ ...s, pdfFile: file }));
  }, []);

  // Normalize question from OCR format
  const normalizeQuestion = useCallback((q: unknown): ParsedQuestion => {
    const raw = q as Record<string, unknown>;

    // Parse options from "A) text" format to {id, text} objects
    let normalizedOptions: QuestionOption[] | undefined;
    if (raw.options && Array.isArray(raw.options)) {
      normalizedOptions = raw.options.map((opt: string | QuestionOption, i: number) => {
        if (typeof opt === 'string') {
          const match = opt.match(/^([A-D])[\)\.\s:]+\s*(.*)$/i);
          if (match) {
            return { id: match[1].toUpperCase(), text: match[2].trim() };
          }
          return { id: String.fromCharCode(65 + i), text: opt };
        }
        return opt as QuestionOption;
      });
    }

    // Normalize passage from passage_text to passage object
    let passage = raw.passage as ParsedQuestion['passage'];
    if (!passage && raw.passage_text) {
      passage = { content: raw.passage_text as string };
    }

    // Normalize question type
    let questionType: 'multiple_choice' | 'student_produced_response' = 'multiple_choice';
    if (raw.question_type) {
      const type = (raw.question_type as string).toLowerCase();
      if (type.includes('student') || type.includes('response') || type.includes('grid')) {
        questionType = 'student_produced_response';
      }
    }

    return {
      id: crypto.randomUUID(),
      question_text: (raw.question_text as string) || '',
      question_type: questionType,
      options: normalizedOptions,
      passage,
      correct_answer: raw.correct_answer as string[] | undefined,
      explanation: raw.explanation as string | undefined,
      domain: raw.domain as string | undefined,
      difficulty: raw.difficulty as 'easy' | 'medium' | 'hard' | undefined,
      skill_tags: raw.skill_tags as string[] | undefined,
      needs_image: raw.needs_image as boolean | undefined,
      question_image_url: raw.question_image_url as string | undefined,
      chart_title: raw.chart_title as string | undefined,
      chart_data: raw.chart_data as string | undefined,
      passage_text: raw.passage_text as string | undefined,
    };
  }, []);

  const parseJsonQuestions = useCallback(
    (data: unknown): ParsedQuestion[] => {
      let rawQuestions: unknown[];
      if (Array.isArray(data)) {
        rawQuestions = data;
      } else if (typeof data === 'object' && data !== null && 'questions' in data) {
        const questions = (data as Record<string, unknown>).questions;
        rawQuestions = Array.isArray(questions) ? questions : [];
      } else {
        rawQuestions = [];
      }
      return rawQuestions.map(normalizeQuestion);
    },
    [normalizeQuestion]
  );

  // Questions
  const setQuestions = useCallback((questions: ParsedQuestion[]) => {
    setState((s) => ({
      ...s,
      questions,
      separators: getDefaultSeparators(questions.length),
      currentQuestionIndex: 0,
    }));
  }, []);

  const updateQuestion = useCallback((index: number, updates: Partial<ParsedQuestion>) => {
    setState((s) => {
      const questions = [...s.questions];
      questions[index] = { ...questions[index], ...updates };
      return { ...s, questions };
    });
  }, []);

  const deleteQuestion = useCallback((index: number) => {
    setState((s) => {
      const questions = s.questions.filter((_, i) => i !== index);
      // Adjust separators
      const separators = s.separators.map((sep) => (sep > index ? sep - 1 : sep));
      const currentQuestionIndex = Math.min(s.currentQuestionIndex, questions.length - 1);
      return { ...s, questions, separators, currentQuestionIndex };
    });
  }, []);

  const reorderQuestions = useCallback((fromIndex: number, toIndex: number) => {
    setState((s) => {
      const questions = [...s.questions];
      const [removed] = questions.splice(fromIndex, 1);
      questions.splice(toIndex, 0, removed);
      return { ...s, questions };
    });
  }, []);

  // Separators
  const setSeparatorPosition = useCallback((moduleIndex: number, afterQuestionIndex: number) => {
    setState((s) => {
      const separators = [...s.separators];
      separators[moduleIndex] = afterQuestionIndex;

      // Ensure subsequent separators are adjusted
      for (let i = moduleIndex + 1; i < separators.length; i++) {
        if (separators[i] <= separators[i - 1]) {
          separators[i] = Math.min(separators[i - 1] + 1, s.questions.length - 1);
        }
      }

      return { ...s, separators };
    });
  }, []);

  const resetSeparators = useCallback(() => {
    setState((s) => ({
      ...s,
      separators: getDefaultSeparators(s.questions.length),
    }));
  }, []);

  // Current selection
  const setCurrentQuestionIndex = useCallback((index: number) => {
    setState((s) => ({ ...s, currentQuestionIndex: index }));
  }, []);

  const setCurrentModuleIndex = useCallback((index: number) => {
    setState((s) => ({ ...s, currentModuleIndex: index }));
  }, []);

  // UI
  const toggleSidebar = useCallback(() => {
    setState((s) => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed }));
  }, []);

  // Computed: modules based on test mode
  const modules = useMemo((): ModuleDefinition[] => {
    return state.testMode === 'linear' ? SAT_MODULES : getAdaptiveModules();
  }, [state.testMode]);

  // Computed: modules with their questions
  const modulesWithQuestions = useMemo((): ModuleWithQuestions[] => {
    if (state.questions.length === 0) return [];

    const result: ModuleWithQuestions[] = [];
    const activeModules = state.testMode === 'linear' ? SAT_MODULES : SAT_MODULES; // For linear, use 4 modules

    let startIndex = 0;
    for (let i = 0; i < activeModules.length; i++) {
      const endIndex = i < state.separators.length ? state.separators[i] : state.questions.length - 1;
      result.push({
        definition: activeModules[i],
        questions: state.questions.slice(startIndex, endIndex + 1),
        startIndex,
        endIndex,
      });
      startIndex = endIndex + 1;
    }

    return result;
  }, [state.questions, state.separators, state.testMode]);

  // Get module info for a question
  const getQuestionModuleInfo = useCallback(
    (globalIndex: number) => {
      const { moduleIndex, localNumber } = getQuestionNumberInModule(globalIndex, state.separators);
      const activeModules = state.testMode === 'linear' ? SAT_MODULES : SAT_MODULES;
      return {
        moduleIndex,
        localNumber,
        module: activeModules[moduleIndex] || SAT_MODULES[0],
      };
    },
    [state.separators, state.testMode]
  );

  // Validation summary
  const validationSummary = useMemo(() => {
    let valid = 0;
    let needsImage = 0;
    let needsAnswer = 0;

    for (const q of state.questions) {
      const validation = validateQuestion(q);
      if (validation.valid) valid++;
      if (validation.issues.includes('May need an image')) needsImage++;
      if (validation.issues.includes('Missing correct answer')) needsAnswer++;
    }

    return {
      total: state.questions.length,
      valid,
      needsImage,
      needsAnswer,
    };
  }, [state.questions]);

  // Current question
  const currentQuestion = state.questions[state.currentQuestionIndex] || null;

  return {
    state,
    goToStep,
    canProceed,
    nextStep,
    prevStep,
    setTestMode,
    setTestTitle,
    setTestDescription,
    setJsonFile,
    setPdfFile,
    setQuestions,
    updateQuestion,
    deleteQuestion,
    reorderQuestions,
    setSeparatorPosition,
    resetSeparators,
    setCurrentQuestionIndex,
    setCurrentModuleIndex,
    toggleSidebar,
    modules,
    modulesWithQuestions,
    getQuestionModuleInfo,
    validationSummary,
    currentQuestion,
    parseJsonQuestions,
    normalizeQuestion,
  };
}
