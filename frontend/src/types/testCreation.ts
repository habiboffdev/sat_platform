/**
 * Types for the Test Creation workflow
 * Supports both linear and adaptive SAT test creation
 */

import type { QuestionOption, QuestionDomain, SATSection, SATModule, ModuleDifficulty } from './test';

// Test creation mode
export type TestMode = 'linear' | 'adaptive';

// Workflow steps
export type CreationStep = 'type' | 'upload' | 'separate' | 'review' | 'submit';

// Module definition with question range
export interface ModuleDefinition {
  id: string;
  section: SATSection;
  module: SATModule;
  difficulty: ModuleDifficulty;
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  borderColor: string;
  defaultQuestionCount: number;
  timeLimit: number;
}

// SAT Module configuration
export const SAT_MODULES: ModuleDefinition[] = [
  {
    id: 'rw_m1',
    section: 'reading_writing',
    module: 'module_1',
    difficulty: 'standard',
    label: 'Reading & Writing - Module 1',
    shortLabel: 'RW M1',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    defaultQuestionCount: 27,
    timeLimit: 32,
  },
  {
    id: 'rw_m2',
    section: 'reading_writing',
    module: 'module_2',
    difficulty: 'standard',
    label: 'Reading & Writing - Module 2',
    shortLabel: 'RW M2',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    defaultQuestionCount: 27,
    timeLimit: 32,
  },
  {
    id: 'math_m1',
    section: 'math',
    module: 'module_1',
    difficulty: 'standard',
    label: 'Math - Module 1',
    shortLabel: 'Math M1',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    defaultQuestionCount: 22,
    timeLimit: 35,
  },
  {
    id: 'math_m2',
    section: 'math',
    module: 'module_2',
    difficulty: 'standard',
    label: 'Math - Module 2',
    shortLabel: 'Math M2',
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
    defaultQuestionCount: 22,
    timeLimit: 35,
  },
];

// For adaptive tests, we need difficulty variants for Module 2
export const ADAPTIVE_MODULE_VARIANTS: Record<string, ModuleDefinition[]> = {
  rw_m2: [
    { ...SAT_MODULES[1], id: 'rw_m2_easier', difficulty: 'easier', label: 'RW M2 (Easier)', shortLabel: 'RW M2 E', color: 'text-green-600', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
    { ...SAT_MODULES[1], id: 'rw_m2_standard', difficulty: 'standard', label: 'RW M2 (Standard)', shortLabel: 'RW M2 S', color: 'text-indigo-600', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-200' },
    { ...SAT_MODULES[1], id: 'rw_m2_harder', difficulty: 'harder', label: 'RW M2 (Harder)', shortLabel: 'RW M2 H', color: 'text-purple-600', bgColor: 'bg-purple-50', borderColor: 'border-purple-200' },
  ],
  math_m2: [
    { ...SAT_MODULES[3], id: 'math_m2_easier', difficulty: 'easier', label: 'Math M2 (Easier)', shortLabel: 'Math M2 E', color: 'text-lime-600', bgColor: 'bg-lime-50', borderColor: 'border-lime-200' },
    { ...SAT_MODULES[3], id: 'math_m2_standard', difficulty: 'standard', label: 'Math M2 (Standard)', shortLabel: 'Math M2 S', color: 'text-teal-600', bgColor: 'bg-teal-50', borderColor: 'border-teal-200' },
    { ...SAT_MODULES[3], id: 'math_m2_harder', difficulty: 'harder', label: 'Math M2 (Harder)', shortLabel: 'Math M2 H', color: 'text-cyan-600', bgColor: 'bg-cyan-50', borderColor: 'border-cyan-200' },
  ],
};

// Parsed question from OCR JSON
export interface ParsedQuestion {
  id: string; // UUID for tracking
  passage_text?: string;
  passage?: {
    title?: string;
    content: string;
    source?: string;
    author?: string;
  };
  question_text: string;
  question_type: 'multiple_choice' | 'student_produced_response';
  options?: QuestionOption[];
  correct_answer?: string[];
  explanation?: string;
  domain?: QuestionDomain | string;
  difficulty?: 'easy' | 'medium' | 'hard';
  skill_tags?: string[];
  needs_image?: boolean;
  question_image_url?: string;
  chart_title?: string;
  chart_data?: string;
}

// Module separator position (index after which separator appears)
export interface ModuleSeparator {
  afterIndex: number;
  moduleId: string;
}

// Test creation state
export interface TestCreationState {
  // Workflow
  step: CreationStep;
  testMode: TestMode;

  // Test metadata
  testTitle: string;
  testDescription: string;

  // Files
  jsonFile: File | null;
  pdfFile: File | null;

  // Questions
  questions: ParsedQuestion[];

  // Module separation (array of separator positions)
  // separators[0] = after which question index RW M1 ends
  // separators[1] = after which question index RW M2 ends
  // etc.
  separators: number[];

  // Current editing state
  currentQuestionIndex: number;
  currentModuleIndex: number;

  // UI state
  sidebarCollapsed: boolean;
}

// Module with its questions
export interface ModuleWithQuestions {
  definition: ModuleDefinition;
  questions: ParsedQuestion[];
  startIndex: number;
  endIndex: number;
}

// Get modules with their question ranges based on separators
export function getModulesWithQuestions(
  questions: ParsedQuestion[],
  separators: number[],
  testMode: TestMode
): ModuleWithQuestions[] {
  const modules = testMode === 'linear' ? SAT_MODULES : getAdaptiveModules();
  const result: ModuleWithQuestions[] = [];

  let startIndex = 0;
  for (let i = 0; i < modules.length; i++) {
    const endIndex = i < separators.length ? separators[i] : questions.length - 1;
    result.push({
      definition: modules[i],
      questions: questions.slice(startIndex, endIndex + 1),
      startIndex,
      endIndex,
    });
    startIndex = endIndex + 1;
  }

  return result;
}

// Get adaptive modules (includes all difficulty variants)
export function getAdaptiveModules(): ModuleDefinition[] {
  return [
    SAT_MODULES[0], // RW M1
    ...ADAPTIVE_MODULE_VARIANTS.rw_m2,
    SAT_MODULES[2], // Math M1
    ...ADAPTIVE_MODULE_VARIANTS.math_m2,
  ];
}

// Validate question has required fields
export function validateQuestion(q: ParsedQuestion): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!q.question_text?.trim()) {
    issues.push('Missing question text');
  }

  if (!q.correct_answer || q.correct_answer.length === 0 ||
      q.correct_answer[0]?.includes('NEED_ANSWER') || q.correct_answer[0] === '') {
    issues.push('Missing correct answer');
  }

  if (q.question_type === 'multiple_choice' && (!q.options || q.options.length < 2)) {
    issues.push('Multiple choice needs at least 2 options');
  }

  // Check if mentions image but doesn't have one
  const imageKeywords = ['graph', 'chart', 'figure', 'diagram', 'table', 'image', 'picture'];
  const text = `${q.question_text} ${q.passage_text || ''} ${q.passage?.content || ''}`.toLowerCase();
  const mentionsImage = imageKeywords.some(kw => text.includes(kw));
  const hasImage = !!(q.question_image_url || q.passage?.content?.includes('<img') || q.options?.some(o => o.image_url));

  if (mentionsImage && !hasImage) {
    issues.push('May need an image');
  }

  return { valid: issues.length === 0, issues };
}

// Default test metadata
export const DEFAULT_TEST_TITLE = 'SAT Practice Test';
export const DEFAULT_TEST_DESCRIPTION = '';

// Calculate default separator positions for standard SAT
export function getDefaultSeparators(totalQuestions: number): number[] {
  // Standard SAT: 27 + 27 + 22 + 22 = 98 questions
  // But we'll calculate proportionally if different
  const standardTotal = 98;
  const standardSeparators = [26, 53, 75, 97]; // 0-indexed end positions

  if (totalQuestions === standardTotal) {
    return standardSeparators;
  }

  // Scale proportionally
  return standardSeparators.map(sep =>
    Math.round((sep / standardTotal) * totalQuestions)
  );
}

// Get question number within its module
export function getQuestionNumberInModule(
  globalIndex: number,
  separators: number[]
): { moduleIndex: number; localNumber: number } {
  let startIndex = 0;

  for (let i = 0; i <= separators.length; i++) {
    const endIndex = i < separators.length ? separators[i] : Infinity;

    if (globalIndex <= endIndex) {
      return {
        moduleIndex: i,
        localNumber: globalIndex - startIndex + 1,
      };
    }

    startIndex = endIndex + 1;
  }

  return { moduleIndex: separators.length, localNumber: 1 };
}
