import api from '@/lib/axios';

// Types for admin analytics
export interface AdminDashboardData {
  users: {
    total: number;
    active: number;
    new_this_week: number;
    new_this_month: number;
  };
  tests: {
    total: number;
    published: number;
  };
  attempts: {
    total: number;
    completed: number;
    this_week: number;
    completion_rate: number;
  };
  scores: {
    average: number | null;
  };
  recent_activity: Array<{
    user_name: string;
    test_title: string;
    score: number | null;
    completed_at: string | null;
  }>;
  top_performers: Array<{
    user_id: number;
    user_name: string;
    best_score: number;
  }>;
}

export interface UserAnalyticsData {
  daily_signups: Array<{ date: string; count: number }>;
  cumulative_growth: Array<{ date: string; total: number }>;
  role_distribution: Record<string, number>;
}

export interface TestAnalyticsData {
  popular_tests: Array<{
    test_id: number;
    title: string;
    test_type: string;
    attempt_count: number;
  }>;
  completion_rates: Array<{
    test_id: number;
    title: string;
    total_attempts: number;
    completed: number;
    rate: number;
  }>;
  difficult_questions: Array<{
    question_id: number;
    question_number: number;
    domain: string | null;
    times_answered: number;
    accuracy: number;
  }>;
}

export interface TrendsData {
  daily: Array<{
    date: string;
    tests_completed: number;
    average_score: number | null;
    new_users: number;
  }>;
  period_days: number;
}

export interface ScoreDistributionData {
  distribution: Record<string, number>;
  stats: {
    count: number;
    average: number;
    min: number;
    max: number;
    median: number;
  };
}

// Types for Score Analytics
export interface ScoreAnalyticsFilters {
  start_time?: string;
  end_time?: string;
  start_date?: string;
  end_date?: string;
  min_score?: number;
  max_score?: number;
  test_id?: number;
  user_id?: number;
  user_search?: string;
  sort_by?: 'completed_at' | 'total_score' | 'user_name';
  sort_order?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}

export interface ScoreAnalyticsItem {
  user_id: number;
  user_name: string;
  user_email: string;
  test_id: number;
  test_title: string;
  total_score: number | null;
  reading_writing_score: number | null;
  math_score: number | null;
  started_at: string;
  completed_at: string | null;
  time_taken_minutes: number | null;
}

export interface ScoreAnalyticsSummary {
  total_attempts: number;
  average_score: number | null;
  highest_score: number | null;
  lowest_score: number | null;
  unique_users: number;
}

export interface ScoreAnalyticsResponse {
  items: ScoreAnalyticsItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary: ScoreAnalyticsSummary;
}

// Types for User Management
export type UserRole = 'student' | 'teacher' | 'admin';

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  is_verified: boolean;
  last_login_at: string | null;
  total_points: number;
  level: number;
  created_at: string;
  updated_at: string;
}

export interface UserListResponse {
  items: User[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface CreateUserData {
  email: string;
  password: string;
  full_name?: string;
  phone?: string;
  role?: UserRole;
  is_active?: boolean;
  is_verified?: boolean;
}

export interface UpdateUserData {
  full_name?: string;
  phone?: string;
  role?: UserRole;
  is_active?: boolean;
  is_verified?: boolean;
}

export const adminService = {
  // Get comprehensive dashboard data
  getDashboard: async (): Promise<AdminDashboardData> => {
    const response = await api.get<AdminDashboardData>('/analytics/admin/dashboard');
    return response.data;
  },

  // Get user analytics for charts
  getUserAnalytics: async (days = 30): Promise<UserAnalyticsData> => {
    const response = await api.get<UserAnalyticsData>(`/analytics/admin/users?days=${days}`);
    return response.data;
  },

  // Get test analytics
  getTestAnalytics: async (): Promise<TestAnalyticsData> => {
    const response = await api.get<TestAnalyticsData>('/analytics/admin/tests');
    return response.data;
  },

  // Get trend data for charts
  getTrends: async (days = 30): Promise<TrendsData> => {
    const response = await api.get<TrendsData>(`/analytics/admin/trends?days=${days}`);
    return response.data;
  },

  // Get score distribution
  getScoreDistribution: async (): Promise<ScoreDistributionData> => {
    const response = await api.get<ScoreDistributionData>('/analytics/platform/score-distribution');
    return response.data;
  },

  // Get platform analytics (existing endpoint)
  getPlatformAnalytics: async (periodType = 'daily', days = 30) => {
    const response = await api.get(`/analytics/platform?period_type=${periodType}&days=${days}`);
    return response.data;
  },

  // ========== Score Analytics ==========

  getScoreAnalytics: async (filters: ScoreAnalyticsFilters): Promise<ScoreAnalyticsResponse> => {
    const queryParams = new URLSearchParams();
    if (filters.start_time) queryParams.set('start_time', filters.start_time);
    if (filters.end_time) queryParams.set('end_time', filters.end_time);
    if (filters.start_date) queryParams.set('start_date', filters.start_date);
    if (filters.end_date) queryParams.set('end_date', filters.end_date);
    if (filters.min_score != null) queryParams.set('min_score', filters.min_score.toString());
    if (filters.max_score != null) queryParams.set('max_score', filters.max_score.toString());
    if (filters.test_id) queryParams.set('test_id', filters.test_id.toString());
    if (filters.user_id) queryParams.set('user_id', filters.user_id.toString());
    if (filters.user_search) queryParams.set('user_search', filters.user_search);
    if (filters.sort_by) queryParams.set('sort_by', filters.sort_by);
    if (filters.sort_order) queryParams.set('sort_order', filters.sort_order);
    if (filters.page) queryParams.set('page', filters.page.toString());
    if (filters.page_size) queryParams.set('page_size', filters.page_size.toString());

    const response = await api.get<ScoreAnalyticsResponse>(
      `/analytics/admin/score-analytics?${queryParams.toString()}`
    );
    return response.data;
  },

  getTestsList: async (): Promise<{ tests: Array<{ id: number; title: string }> }> => {
    // The /tests/admin endpoint returns paginated results with items array
    const response = await api.get<{ items: Array<{ id: number; title: string }> }>('/tests/admin?page_size=100');
    return { tests: response.data.items || [] };
  },

  exportScoreAnalytics: async (filters: ScoreAnalyticsFilters, format: 'csv' | 'pdf' = 'csv'): Promise<Blob> => {
    const queryParams = new URLSearchParams();
    if (filters.start_time) queryParams.set('start_time', filters.start_time);
    if (filters.end_time) queryParams.set('end_time', filters.end_time);
    if (filters.start_date) queryParams.set('start_date', filters.start_date);
    if (filters.end_date) queryParams.set('end_date', filters.end_date);
    if (filters.min_score != null) queryParams.set('min_score', filters.min_score.toString());
    if (filters.max_score != null) queryParams.set('max_score', filters.max_score.toString());
    if (filters.test_id) queryParams.set('test_id', filters.test_id.toString());
    if (filters.user_id) queryParams.set('user_id', filters.user_id.toString());
    if (filters.user_search) queryParams.set('user_search', filters.user_search);

    queryParams.set('format', format);

    const response = await api.get(`/analytics/admin/score-analytics/export?${queryParams.toString()}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  // ========== User Management ==========

  getUsers: async (params?: {
    page?: number;
    page_size?: number;
    search?: string;
    role?: string;
    is_active?: boolean;
  }): Promise<UserListResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.page_size) queryParams.set('page_size', params.page_size.toString());
    if (params?.search) queryParams.set('search', params.search);
    if (params?.role) queryParams.set('role', params.role);
    if (params?.is_active !== undefined) queryParams.set('is_active', params.is_active.toString());

    const response = await api.get<UserListResponse>(`/users?${queryParams.toString()}`);
    return response.data;
  },

  getUser: async (userId: number): Promise<User> => {
    const response = await api.get<User>(`/users/${userId}`);
    return response.data;
  },

  createUser: async (data: CreateUserData): Promise<User> => {
    const response = await api.post<User>('/users', data);
    return response.data;
  },

  updateUser: async (userId: number, data: UpdateUserData): Promise<User> => {
    const response = await api.patch<User>(`/users/${userId}`, data);
    return response.data;
  },

  deleteUser: async (userId: number): Promise<void> => {
    await api.delete(`/users/${userId}`);
  },

  uploadImage: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<{ url: string }>('/uploads/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};

export default adminService;
