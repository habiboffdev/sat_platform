import api from '@/lib/axios';
import type { Test, Question, TestModule, Passage } from '@/types/test';

interface TestListResponse {
  items: Test[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface PassageListResponse {
  items: Passage[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface CreatePassageData {
  title?: string;
  content: string;
  source?: string;
  author?: string;
  genre?: string;
  topic_tags?: string[];
}

export const testService = {
  // Student endpoint - only published tests
  getAllTests: async (): Promise<Test[]> => {
    const response = await api.get<TestListResponse>('/tests');
    return response.data.items;
  },

  // Admin endpoint - all tests including drafts
  getAllTestsAdmin: async (): Promise<Test[]> => {
    const response = await api.get<TestListResponse>('/tests/admin/all');
    return response.data.items;
  },

  getTest: async (id: number): Promise<Test> => {
    const response = await api.get<Test>(`/tests/${id}`);
    return response.data;
  },

  createTest: async (data: Partial<Test>): Promise<Test> => {
    const response = await api.post<Test>('/tests', data);
    return response.data;
  },

  updateTest: async (id: number, data: Partial<Test>): Promise<Test> => {
    const response = await api.patch<Test>(`/tests/${id}`, data);
    return response.data;
  },

  deleteTest: async (id: number): Promise<void> => {
    await api.delete(`/tests/${id}`);
  },

  // Module endpoints
  createModule: async (testId: number, data: Partial<TestModule>): Promise<TestModule> => {
    const response = await api.post<TestModule>(`/tests/${testId}/modules`, data);
    return response.data;
  },

  updateModule: async (moduleId: number, data: Partial<TestModule>): Promise<TestModule> => {
    const response = await api.patch<TestModule>(`/tests/modules/${moduleId}`, data);
    return response.data;
  },

  deleteModule: async (moduleId: number): Promise<void> => {
    await api.delete(`/tests/modules/${moduleId}`);
  },

  // Question endpoints
  createQuestion: async (_testId: number, moduleId: number, data: Partial<Question>): Promise<Question> => {
    // Note: testId is not used in the API path for creating questions, only moduleId
    const response = await api.post<Question>(`/tests/modules/${moduleId}/questions`, data);
    return response.data;
  },

  updateQuestion: async (questionId: number, data: Partial<Question>): Promise<Question> => {
    const response = await api.patch<Question>(`/tests/questions/${questionId}`, data);
    return response.data;
  },

  deleteQuestion: async (questionId: number): Promise<void> => {
    await api.delete(`/tests/questions/${questionId}`);
  },

  // Passage endpoints
  getPassages: async (page = 1, pageSize = 20, search?: string): Promise<PassageListResponse> => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search) params.append('search', search);
    const response = await api.get<PassageListResponse>(`/passages?${params}`);
    return response.data;
  },

  getPassage: async (id: number): Promise<Passage> => {
    const response = await api.get<Passage>(`/passages/${id}`);
    return response.data;
  },

  createPassage: async (data: CreatePassageData): Promise<Passage> => {
    const response = await api.post<Passage>('/passages', data);
    return response.data;
  },

  updatePassage: async (id: number, data: Partial<CreatePassageData>): Promise<Passage> => {
    const response = await api.patch<Passage>(`/passages/${id}`, data);
    return response.data;
  },

  deletePassage: async (id: number): Promise<void> => {
    await api.delete(`/passages/${id}`);
  },
};
