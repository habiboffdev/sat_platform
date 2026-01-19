import api from '@/lib/axios';
import type { Question, TestModule } from '@/types/test';

export const AttemptStatus = {
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
} as const;
export type AttemptStatus = typeof AttemptStatus[keyof typeof AttemptStatus];

export interface TestAttempt {
  id: number;
  test_id: number;
  test_title: string;
  status: AttemptStatus;
  started_at: string;
  completed_at?: string;
  current_module_id?: number;
  current_question_number?: number;
  total_score?: number;
  time_spent_seconds?: number;
  scope?: string;
}

export interface QuestionStudentView extends Omit<Question, 'correct_answer' | 'explanation'> {
  id: number;
  question_number: number;
  question_image_url?: string;
  question_image_alt?: string;
  passage?: {
    id: number;
    content: string;
    title?: string;
    source?: string;
    author?: string;
  };
}

export interface TestModuleWithQuestions extends Omit<TestModule, 'questions'> {
  questions: QuestionStudentView[];
  question_count: number;
  remaining_seconds?: number;
}

export interface SubmitAnswer {
  question_id: number;
  answer: string | null; // Option ID (A, B, C, D) or text value
  time_spent_seconds?: number;
  is_flagged?: boolean;
}

export interface SubmitModuleRequest {
  module_id: number;
  answers: SubmitAnswer[];
  time_spent_seconds: number;
}

export interface DomainBreakdown {
  domain: string;
  correct: number;
  total: number;
  percentage: number;
}

export interface ModuleResult {
  module_id: number;
  section: string;
  module_type: string;
  correct_count: number;
  total_count: number;
  time_spent_seconds: number;
  next_module_difficulty?: string;
}

export interface TestAttemptDetail extends TestAttempt {
  reading_writing_raw_score?: number;
  math_raw_score?: number;
  reading_writing_scaled_score?: number;
  math_scaled_score?: number;
  total_score?: number;
  percentile?: number;
  domain_breakdown?: DomainBreakdown[];
  module_results?: ModuleResult[];
}

export interface AttemptListResponse {
  items: TestAttempt[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface QuestionResult {
  id: number;
  question_number: number;
  is_correct: boolean;
  correct_answer: string[];
  user_answer: string | null;
  domain: string | null;
}

export interface ModuleDomainBreakdown {
  domain: string;
  correct: number;
  total: number;
  accuracy: number;
}

export interface SubmitModuleResponse {
  status: AttemptStatus;
  module_score: {
    correct: number;
    total: number;
  };
  section: string;
  module_type: string;
  domain_breakdown: ModuleDomainBreakdown[];
  question_results: QuestionResult[];
  next_module_id: number | null;
  test_completed: boolean;
  total_score: number | null;
}

// Test configuration for starting an attempt
export interface TestConfig {
  time_multiplier?: number;  // 1, 1.5, or 2
  scope?: 'full' | 'rw_only' | 'math_only' | 'single_module';
  selected_module_id?: number | null;
}

export const examService = {
  startAttempt: async (testId: number, config?: TestConfig): Promise<TestAttempt> => {
    // If config is provided, use request body format
    if (config && (config.scope !== 'full' || config.time_multiplier !== 1)) {
      const response = await api.post<TestAttempt>('/attempts', {
        test_id: testId,
        config: {
          time_multiplier: config.time_multiplier ?? 1,
          scope: config.scope ?? 'full',
          selected_module_id: config.selected_module_id ?? null,
        },
      });
      return response.data;
    }
    // Otherwise use query param for backwards compatibility
    const response = await api.post<TestAttempt>(`/attempts?test_id=${testId}`);
    return response.data;
  },

  getAttempts: async (): Promise<AttemptListResponse> => {
    const response = await api.get<AttemptListResponse>('/attempts');
    return response.data;
  },

  getAttemptResult: async (attemptId: number): Promise<TestAttemptDetail> => {
    const response = await api.get<TestAttemptDetail>(`/attempts/${attemptId}`);
    return response.data;
  },

  getCurrentModule: async (attemptId: number): Promise<TestModuleWithQuestions> => {
    const response = await api.get<TestModuleWithQuestions>(`/attempts/${attemptId}/current-module`);
    return response.data;
  },

  submitModule: async (attemptId: number, data: SubmitModuleRequest): Promise<SubmitModuleResponse> => {
    const response = await api.post<SubmitModuleResponse>(`/attempts/${attemptId}/submit-module`, data);
    return response.data;
  },

  getPracticeWrongQuestions: async (attemptId: number): Promise<{
    original_attempt_id: number;
    wrong_question_ids: number[];
    question_count: number;
    message: string;
  }> => {
    const response = await api.post(`/attempts/${attemptId}/practice-wrong`);
    return response.data;
  },

  deleteAttempt: async (attemptId: number): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>(`/attempts/${attemptId}`);
    return response.data;
  },
};
