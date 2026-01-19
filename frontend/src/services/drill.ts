import api from '@/lib/axios';

// Types for drill mode
export interface DrillConfig {
    section?: string | null;
    domains?: string[] | null;
    difficulty?: string | null;
    question_count: number;
}

export interface DrillQuestion {
    id: number;
    question_number: number;
    question_text: string;
    question_type: string;
    question_image_url?: string | null;
    options?: Array<{ id: string; text: string; image_url?: string | null }> | null;
    passage?: {
        id: number;
        content: string;
        title?: string;
        source?: string;
    } | null;
    domain?: string | null;
    difficulty?: string | null;
}

export interface DrillSession {
    drill_id: string;
    question_count: number;
    questions: DrillQuestion[];
    section?: string | null;
    domains?: string[] | null;
    difficulty?: string | null;
}

export interface DrillAnswer {
    question_id: number;
    answer: string | null;
}

export interface DrillQuestionResult {
    id: number;
    question_number: number;
    question_text: string;
    question_type: string;
    question_image_url?: string | null;
    options?: Array<{ id: string; text: string; image_url?: string | null }> | null;
    correct_answer: string[];
    explanation?: string | null;
    user_answer: string | null;
    is_correct: boolean;
    domain?: string | null;
    difficulty?: string | null;
}

export interface DrillResult {
    total_questions: number;
    correct_count: number;
    accuracy: number;
    domain_breakdown: Array<{
        domain: string;
        correct: number;
        total: number;
        accuracy: number;
    }>;
    questions: DrillQuestionResult[];
}

export interface DomainCounts {
    reading_writing: Record<string, number>;
    math: Record<string, number>;
}

export const drillService = {
    createDrill: async (config: DrillConfig): Promise<DrillSession> => {
        const response = await api.post<DrillSession>('/drills/create', config);
        return response.data;
    },

    submitDrill: async (answers: DrillAnswer[]): Promise<DrillResult> => {
        const response = await api.post<DrillResult>('/drills/submit', { answers });
        return response.data;
    },

    getWeakAreasDrill: async (questionCount: number = 10): Promise<DrillSession> => {
        const response = await api.get<DrillSession>('/drills/weak-areas', {
            params: { question_count: questionCount },
        });
        return response.data;
    },

    getDomains: async (): Promise<DomainCounts> => {
        const response = await api.get<DomainCounts>('/drills/domains');
        return response.data;
    },
};
