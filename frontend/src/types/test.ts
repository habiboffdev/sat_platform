export const TestType = {
  FULL_TEST: 'full_test',
  SECTION_TEST: 'section_test',
  MINI_TEST: 'mini_test',
} as const;
export type TestType = typeof TestType[keyof typeof TestType];

export const SATSection = {
  READING_WRITING: 'reading_writing',
  MATH: 'math',
} as const;
export type SATSection = typeof SATSection[keyof typeof SATSection];

export const SATModule = {
  MODULE_1: 'module_1',
  MODULE_2: 'module_2',
} as const;
export type SATModule = typeof SATModule[keyof typeof SATModule];

export const ModuleDifficulty = {
  STANDARD: 'standard',
  EASIER: 'easier',
  HARDER: 'harder',
} as const;
export type ModuleDifficulty = typeof ModuleDifficulty[keyof typeof ModuleDifficulty];

export const QuestionType = {
  MULTIPLE_CHOICE: 'multiple_choice',
  MULTIPLE_CHOICE_MATH: 'multiple_choice_math',
  STUDENT_PRODUCED_RESPONSE: 'student_produced_response',
} as const;
export type QuestionType = typeof QuestionType[keyof typeof QuestionType];

export interface QuestionOption {
  id: string;
  text: string;
  image_url?: string;
  image_alt?: string;
}

// SAT Content Domains
export const QuestionDomain = {
  // Reading & Writing domains
  CRAFT_AND_STRUCTURE: 'craft_and_structure',
  INFORMATION_AND_IDEAS: 'information_and_ideas',
  STANDARD_ENGLISH_CONVENTIONS: 'standard_english_conventions',
  EXPRESSION_OF_IDEAS: 'expression_of_ideas',
  // Math domains
  ALGEBRA: 'algebra',
  ADVANCED_MATH: 'advanced_math',
  PROBLEM_SOLVING_DATA_ANALYSIS: 'problem_solving_data_analysis',
  GEOMETRY_TRIGONOMETRY: 'geometry_trigonometry',
} as const;
export type QuestionDomain = typeof QuestionDomain[keyof typeof QuestionDomain];

export interface Question {
  id?: number;
  question_number: number;
  question_text: string;
  question_type: QuestionType;
  options?: QuestionOption[]; // For MCQ
  correct_answer: string[];
  explanation?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  domain?: QuestionDomain;
  skill_tags?: string[];
  tags?: string[];
  passage_id?: number;
  passage?: Passage;
}

export interface Passage {
  id: number;
  title?: string;
  content: string;
  source?: string;
  author?: string;
  word_count?: number;
  genre?: string;
  topic_tags?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface TestModule {
  id?: number;
  section: SATSection;
  module: SATModule;
  difficulty: ModuleDifficulty;
  time_limit_minutes: number;
  order_index?: number;
  questions: Question[];
}

export interface Test {
  id: number;
  title: string;
  description?: string;
  test_type: TestType;
  section?: SATSection;
  time_limit_minutes?: number;
  is_published: boolean;
  is_premium: boolean;
  module_count: number;
  total_questions: number;
  modules?: TestModule[];
  created_at?: string;
  updated_at?: string;
}
