import api from '@/lib/axios';
import type { AuthResponse, UserResponse } from '@/types/auth';
import type { LoginSchemaType, RegisterSchemaType } from '@/pages/auth/schema';

export const authService = {
  login: async (data: LoginSchemaType): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/login', {
      email: data.email,
      password: data.password,
    });
    return response.data;
  },

  register: async (data: RegisterSchemaType): Promise<UserResponse> => {
    const { confirmPassword, ...registerData } = data;
    const response = await api.post<UserResponse>('/auth/register', registerData);
    return response.data;
  },

  getMe: async (): Promise<UserResponse> => {
    const response = await api.get<UserResponse>('/users/me');
    return response.data;
  },

  refresh: async (): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/refresh');
    return response.data;
  },
};
