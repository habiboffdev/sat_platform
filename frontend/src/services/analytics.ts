import api from '@/lib/axios';

// Types for student analytics
export interface StudentAnalytics {
  total_tests_taken: number;
  first_score: number | null;
  latest_score: number | null;
  highest_score: number | null;
  average_score: number | null;
  score_improvement: number | null;
  reading_writing_avg: number | null;
  math_avg: number | null;
  domain_performance: Record<string, { count: number; correct: number; accuracy: number }>;
  weak_domains: string[];
  strong_domains: string[];
  skill_performance: Record<string, { count: number; correct: number; accuracy: number }>;
  weak_skills: string[];
  strong_skills: string[];
  total_questions_answered: number;
  total_study_time_minutes: number;
  current_streak_days: number;
  longest_streak_days: number;
  predicted_score: number | null;
  last_activity_date: string | null;
}

export interface ScoreHistoryItem {
  date: string;
  total: number | null;
  rw: number | null;
  math: number | null;
}

export interface DashboardStats {
  analytics: StudentAnalytics | null;
  score_history: ScoreHistoryItem[];
  weekly_summary: {
    study_time_minutes: number;
    sessions_count: number;
    questions_answered: number;
    questions_correct: number;
  };
}

export interface DomainPerformance {
  domain: string;
  correct: number;
  total: number;
  percentage: number;
}

export const analyticsService = {
  // Get student dashboard stats
  getMyAnalytics: async (): Promise<StudentAnalytics | null> => {
    try {
      const response = await api.get<{ analytics: StudentAnalytics }>('/analytics/me');
      return response.data.analytics;
    } catch {
      return null;
    }
  },

  // Get score history
  getScoreHistory: async (limit = 20): Promise<ScoreHistoryItem[]> => {
    try {
      const response = await api.get<ScoreHistoryItem[]>(`/analytics/me/score-history?limit=${limit}`);
      return response.data;
    } catch {
      return [];
    }
  },

  // Get domain performance
  getDomainPerformance: async (): Promise<DomainPerformance[]> => {
    try {
      const response = await api.get<DomainPerformance[]>('/analytics/me/domain-performance');
      return response.data;
    } catch {
      return [];
    }
  },

  // Force refresh analytics
  refreshAnalytics: async (): Promise<void> => {
    await api.post('/analytics/me/refresh');
  },
};

export default analyticsService;
