/**
 * OCR Service - API client for PDF-to-Test import pipeline.
 *
 * Provides:
 * - PDF upload and job creation
 * - Job status and progress tracking
 * - Extracted questions management
 * - Review workflow
 * - Import to test module
 */

import api from '@/lib/axios';

// ===== Types =====

export type OCRJobStatus =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'structuring'
  | 'review'
  | 'importing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type OCRProvider = 'deepinfra' | 'openai' | 'hybrid' | 'replicate' | 'openrouter';

/** OCR quality setting - only affects OpenRouter vision model */
export type OCRQuality = 'fast' | 'quality';

export type QuestionReviewStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'needs_edit'
  | 'imported';

export type QuestionType =
  | 'multiple_choice'
  | 'multiple_choice_math'
  | 'student_produced_response';

export type QuestionDomain =
  | 'algebra'
  | 'advanced_math'
  | 'geometry_trigonometry'
  | 'problem_solving_data_analysis'
  | 'craft_and_structure'
  | 'information_and_ideas'
  | 'expression_of_ideas'
  | 'standard_english_conventions';

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export interface OCRJob {
  id: number;
  status: OCRJobStatus;
  pdf_filename: string;
  total_pages: number;
  processed_pages: number;
  question_pages: number;
  skipped_pages: number;
  extracted_questions: number;
  approved_questions: number;
  imported_questions: number;
  progress_percent: number;
  ocr_provider: OCRProvider;
  estimated_cost_cents: number;
  actual_cost_cents: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  target_module_id: number | null;
}

export interface OCRJobListResponse {
  items: OCRJob[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface QuestionOption {
  id: string;
  text: string;
  image_url?: string | null;
}

export interface TableData {
  headers: string[];
  rows: string[][];
  title?: string | null;
}

export interface ExtractedQuestion {
  id: number;
  job_id: number;
  source_page_number: number;
  review_status: QuestionReviewStatus;
  extraction_confidence: number;
  answer_confidence: number;
  question_text: string;
  question_type: QuestionType;
  passage_text: string | null;
  chart_title: string | null;
  chart_data: string | null;
  table_data: TableData | null;  // New structured table format
  options: QuestionOption[] | null;
  correct_answer: string[] | null;
  needs_answer: boolean;
  explanation: string | null;
  difficulty: QuestionDifficulty | null;
  domain: QuestionDomain | null;
  needs_image: boolean;
  question_image_url: string | null;
  question_image_s3_key: string | null;
  image_extraction_status: string | null;
  validation_errors: string[] | null;
  created_at: string;
}

export interface ExtractedQuestionListResponse {
  items: ExtractedQuestion[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface QuestionUpdateData {
  question_text?: string;
  question_type?: QuestionType;
  passage_text?: string;
  options?: QuestionOption[];
  correct_answer?: string[];
  explanation?: string;
  difficulty?: QuestionDifficulty;
  domain?: QuestionDomain;
  review_status?: QuestionReviewStatus;
}

export interface ImportResult {
  imported: number;
  errors: string[];
  test_id?: number;
}

// ===== Test Configuration Types =====

export interface ModuleConfig {
  section: 'reading_writing' | 'math';
  module: 'module_1' | 'module_2';
  difficulty: 'standard' | 'easier' | 'harder';
  question_start: number;
  question_end: number;
  time_limit_minutes: number;
}

export interface TestConfig {
  test_title: string;
  test_type: 'full_test' | 'section_test' | 'module_test';
  section: 'reading_writing' | 'math' | null;
  modules: ModuleConfig[];
  is_published: boolean;
  is_premium: boolean;
}

export interface TestConfigResponse {
  job_id: number;
  test_config: TestConfig;
  estimated_questions: number;
}

export interface ImportWithTestRequest {
  test_config: TestConfig;
  question_ids?: number[];
}

export interface ImportWithTestResponse {
  test_id: number;
  test_title: string;
  modules_created: number;
  questions_imported: number;
  errors: string[];
}

export interface JobProgressEvent {
  type: 'progress' | 'complete' | 'error';
  data: {
    processed_pages?: number;
    total_pages?: number;
    percent?: number;
    question_pages?: number;
    skipped_pages?: number;
    extracted_questions?: number;
    status?: OCRJobStatus;
    error_message?: string;
    message?: string;
  };
}

// ===== Passage Types =====

export interface ExtractedPassage {
  id: number;
  job_id: number;
  source_page_number: number | null;
  title: string | null;
  content: string;
  source: string | null;
  author: string | null;
  word_count: number | null;
  figures: Array<{ s3_key?: string; url?: string; alt?: string; caption?: string }> | null;
  genre: string | null;
  topic_tags: string[] | null;
  review_status: QuestionReviewStatus;
  extraction_confidence: number;
  linked_questions_count: number;
  created_at: string;
}

export interface ExtractedPassageListResponse {
  items: ExtractedPassage[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PassageUpdateData {
  title?: string;
  content?: string;
  source?: string;
  author?: string;
  genre?: string;
  topic_tags?: string[];
  review_status?: QuestionReviewStatus;
}

// ===== Phase 6: Error Handling Types =====

export interface FailedPageInfo {
  page_number: number;
  error_message: string | null;
  retry_count: number;
  last_error_at: string | null;
  provider_used: string | null;
}

export interface FailedPagesResponse {
  job_id: number;
  failed_count: number;
  pages: FailedPageInfo[];
}

export interface RetryFailedRequest {
  page_numbers?: number[];
  use_quality_provider?: boolean;
}

export interface RetryFailedResponse {
  job_id: number;
  retrying_pages: number;
  celery_task_id: string | null;
}

export interface ReextractPageResponse {
  job_id: number;
  page_number: number;
  celery_task_id: string;
  provider: string;
}

// ===== Service =====

export const ocrService = {
  /**
   * Upload a PDF file for OCR processing.
   *
   * @param file - PDF file to upload
   * @param targetModuleId - Optional target module ID
   * @param quality - "fast" (Qwen 32B) or "quality" (Qwen 72B)
   */
  uploadPdf: async (
    file: File,
    targetModuleId?: number,
    quality: OCRQuality = 'fast'
  ): Promise<OCRJob> => {
    const formData = new FormData();
    formData.append('file', file);
    if (targetModuleId) {
      formData.append('target_module_id', targetModuleId.toString());
    }
    // Always use OpenRouter as the primary provider
    formData.append('provider', 'openrouter');
    formData.append('quality', quality);

    const response = await api.post<OCRJob>('/ocr/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /**
   * List OCR jobs for current user.
   */
  listJobs: async (params?: {
    page?: number;
    page_size?: number;
    status?: OCRJobStatus;
  }): Promise<OCRJobListResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    if (params?.status) queryParams.set('status', params.status);

    const response = await api.get<OCRJobListResponse>(
      `/ocr/jobs?${queryParams.toString()}`
    );
    return response.data;
  },

  /**
   * Get OCR job details.
   */
  getJob: async (jobId: number): Promise<OCRJob> => {
    const response = await api.get<OCRJob>(`/ocr/jobs/${jobId}`);
    return response.data;
  },

  /**
   * Cancel a pending or processing job.
   */
  cancelJob: async (jobId: number): Promise<{ message: string; job_id: number }> => {
    const response = await api.post<{ message: string; job_id: number }>(
      `/ocr/jobs/${jobId}/cancel`
    );
    return response.data;
  },

  /**
   * Resume a stuck processing job (e.g., after server restart).
   * Continues from where it left off, skipping already processed pages.
   */
  resumeJob: async (jobId: number): Promise<{
    message: string;
    job_id: number;
    processed_pages: number;
    total_pages: number;
    celery_task_id: string;
  }> => {
    const response = await api.post<{
      message: string;
      job_id: number;
      processed_pages: number;
      total_pages: number;
      celery_task_id: string;
    }>(`/ocr/jobs/${jobId}/resume`);
    return response.data;
  },

  /**
   * List extracted questions for a job.
   */
  listQuestions: async (
    jobId: number,
    params?: {
      page?: number;
      page_size?: number;
      status?: QuestionReviewStatus;
      needs_answer?: boolean;
      needs_image?: boolean;
    }
  ): Promise<ExtractedQuestionListResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    if (params?.status) queryParams.set('status', params.status);
    if (params?.needs_answer !== undefined) {
      queryParams.set('needs_answer', params.needs_answer.toString());
    }
    if (params?.needs_image !== undefined) {
      queryParams.set('needs_image', params.needs_image.toString());
    }

    const response = await api.get<ExtractedQuestionListResponse>(
      `/ocr/jobs/${jobId}/questions?${queryParams.toString()}`
    );
    return response.data;
  },

  /**
   * Get extracted question details.
   */
  getQuestion: async (questionId: number): Promise<ExtractedQuestion> => {
    const response = await api.get<ExtractedQuestion>(`/ocr/questions/${questionId}`);
    return response.data;
  },

  /**
   * Update an extracted question (review/edit).
   */
  updateQuestion: async (
    questionId: number,
    data: QuestionUpdateData
  ): Promise<ExtractedQuestion> => {
    const response = await api.put<ExtractedQuestion>(
      `/ocr/questions/${questionId}`,
      data
    );
    return response.data;
  },

  /**
   * Bulk approve or reject questions.
   */
  bulkReview: async (
    questionIds: number[],
    action: 'approve' | 'reject'
  ): Promise<{ updated: number; new_status: QuestionReviewStatus }> => {
    const response = await api.post<{ updated: number; new_status: QuestionReviewStatus }>(
      '/ocr/questions/bulk-review',
      { question_ids: questionIds, action }
    );
    return response.data;
  },

  /**
   * Import approved questions to a test module.
   */
  importQuestions: async (
    jobId: number,
    targetModuleId: number,
    questionIds?: number[]
  ): Promise<ImportResult> => {
    const response = await api.post<ImportResult>(`/ocr/jobs/${jobId}/import`, {
      target_module_id: targetModuleId,
      question_ids: questionIds,
    });
    return response.data;
  },

  /**
   * Configure test structure before import (saves config without importing).
   */
  configureTest: async (
    jobId: number,
    config: TestConfig
  ): Promise<TestConfigResponse> => {
    const response = await api.post<TestConfigResponse>(
      `/ocr/jobs/${jobId}/configure-test`,
      config
    );
    return response.data;
  },

  /**
   * Import questions and create a new test with configured modules.
   * This is the recommended flow for creating tests from OCR.
   */
  importWithTest: async (
    jobId: number,
    request: ImportWithTestRequest
  ): Promise<ImportWithTestResponse> => {
    const response = await api.post<ImportWithTestResponse>(
      `/ocr/jobs/${jobId}/import-with-test`,
      request
    );
    return response.data;
  },

  /**
   * Get the URL for a PDF page image (for cropping).
   * Returns authenticated URL for the page image endpoint.
   */
  getPageImageUrl: (jobId: number, pageNumber: number, scale: number = 2.0): string => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
    return `${baseUrl}/ocr/jobs/${jobId}/pages/${pageNumber}/image?scale=${scale}`;
  },

  /**
   * Upload a cropped image for a question.
   */
  uploadQuestionImage: async (
    questionId: number,
    imageBlob: Blob
  ): Promise<{
    question_id: number;
    question_image_url: string;
    needs_image: boolean;
    image_extraction_status: string;
  }> => {
    const formData = new FormData();
    formData.append('file', imageBlob, `crop_${Date.now()}.jpg`);

    const response = await api.post<{
      question_id: number;
      question_image_url: string;
      needs_image: boolean;
      image_extraction_status: string;
    }>(`/ocr/questions/${questionId}/upload-image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /**
   * Create WebSocket connection for real-time job progress.
   * Returns a cleanup function to close the connection.
   */
  subscribeToJobProgress: (
    jobId: number,
    onMessage: (event: JobProgressEvent) => void,
    onError?: (error: Event) => void
  ): (() => void) => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
    const wsUrl = baseUrl.replace(/^http/, 'ws') + `/ocr/jobs/${jobId}/ws`;

    const token = localStorage.getItem('token');
    const ws = new WebSocket(wsUrl + (token ? `?token=${token}` : ''));

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as JobProgressEvent;
        onMessage(data);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.onerror = (event) => {
      if (onError) {
        onError(event);
      }
    };

    // Return cleanup function
    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  },

  /**
   * Get job cost estimate based on quality setting.
   */
  estimateCost: (totalPages: number, quality: OCRQuality = 'fast'): number => {
    // Rough estimates in cents per page (OpenRouter pricing)
    // Fast: Qwen 32B ($0.005 input / $0.022 output per 1K tokens)
    // Quality: Qwen 72B ($0.040 per 1K tokens)
    const costPerPage: Record<OCRQuality, number> = {
      fast: 0.10,     // Qwen 32B - cheapest, good accuracy
      quality: 0.25,  // Qwen 72B - better accuracy for complex math
    };
    return Math.round(totalPages * costPerPage[quality]);
  },

  /**
   * Format domain for display.
   */
  formatDomain: (domain: QuestionDomain | null): string => {
    if (!domain) return 'Unknown';
    const mapping: Record<QuestionDomain, string> = {
      algebra: 'Algebra',
      advanced_math: 'Advanced Math',
      geometry_trigonometry: 'Geometry & Trigonometry',
      problem_solving_data_analysis: 'Problem Solving & Data Analysis',
      craft_and_structure: 'Craft & Structure',
      information_and_ideas: 'Information & Ideas',
      expression_of_ideas: 'Expression of Ideas',
      standard_english_conventions: 'Standard English Conventions',
    };
    return mapping[domain] || domain;
  },

  /**
   * Format status for display.
   */
  formatStatus: (status: OCRJobStatus): string => {
    const mapping: Record<OCRJobStatus, string> = {
      pending: 'Pending',
      uploading: 'Uploading',
      processing: 'Processing OCR',
      structuring: 'Structuring',
      review: 'Ready for Review',
      importing: 'Importing',
      completed: 'Completed',
      failed: 'Failed',
      cancelled: 'Cancelled',
    };
    return mapping[status] || status;
  },

  /**
   * Get status color for badges.
   */
  getStatusColor: (
    status: OCRJobStatus
  ): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'review':
        return 'secondary';
      case 'failed':
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  },

  // ===== Passage Methods =====

  /**
   * List extracted passages for a job.
   */
  listPassages: async (
    jobId: number,
    params?: {
      page?: number;
      page_size?: number;
      status?: QuestionReviewStatus;
    }
  ): Promise<ExtractedPassageListResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    if (params?.status) queryParams.set('status', params.status);

    const response = await api.get<ExtractedPassageListResponse>(
      `/ocr/jobs/${jobId}/passages?${queryParams.toString()}`
    );
    return response.data;
  },

  /**
   * Get extracted passage details.
   */
  getPassage: async (passageId: number): Promise<ExtractedPassage> => {
    const response = await api.get<ExtractedPassage>(`/ocr/passages/${passageId}`);
    return response.data;
  },

  /**
   * Update an extracted passage (review/edit).
   */
  updatePassage: async (
    passageId: number,
    data: PassageUpdateData
  ): Promise<ExtractedPassage> => {
    const response = await api.put<ExtractedPassage>(
      `/ocr/passages/${passageId}`,
      data
    );
    return response.data;
  },

  // ===== Phase 6: Error Handling Methods =====

  /**
   * List failed pages for a job.
   */
  listFailedPages: async (jobId: number): Promise<FailedPagesResponse> => {
    const response = await api.get<FailedPagesResponse>(
      `/ocr/jobs/${jobId}/failed-pages`
    );
    return response.data;
  },

  /**
   * Retry processing for failed pages.
   */
  retryFailedPages: async (
    jobId: number,
    request?: RetryFailedRequest
  ): Promise<RetryFailedResponse> => {
    const response = await api.post<RetryFailedResponse>(
      `/ocr/jobs/${jobId}/retry-failed`,
      request || {}
    );
    return response.data;
  },

  /**
   * Re-extract a specific page with the quality provider.
   * Use when extraction quality is poor and you want to retry with a better model.
   */
  reextractPage: async (
    jobId: number,
    pageNumber: number,
    useQualityProvider: boolean = true
  ): Promise<ReextractPageResponse> => {
    const response = await api.post<ReextractPageResponse>(
      `/ocr/jobs/${jobId}/reextract-page`,
      {
        page_number: pageNumber,
        use_quality_provider: useQualityProvider,
      }
    );
    return response.data;
  },

  /**
   * List pages that were skipped (not detected as question pages).
   */
  listSkippedPages: async (jobId: number): Promise<{
    job_id: number;
    skipped_count: number;
    pages: Array<{
      page_number: number;
      text_preview: string | null;
      text_length: number;
    }>;
  }> => {
    const response = await api.get(`/ocr/jobs/${jobId}/skipped-pages`);
    return response.data;
  },

  /**
   * Force re-process skipped pages to extract questions.
   * This runs the structuring step on pages that already have OCR text.
   */
  processSkippedPages: async (
    jobId: number,
    pageNumbers?: number[]
  ): Promise<{
    message: string;
    job_id: number;
    page_numbers: number[];
    celery_task_id: string;
  }> => {
    const response = await api.post(`/ocr/jobs/${jobId}/process-skipped`, {
      page_numbers: pageNumbers,
    });
    return response.data;
  },
};

export default ocrService;
