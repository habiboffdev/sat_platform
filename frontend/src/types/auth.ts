export interface User {
  id: number;
  email: string;
  full_name: string | null;
  role: 'student' | 'teacher' | 'admin';
  is_active: boolean;
  avatar_url?: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export interface UserResponse extends User {
  created_at: string;
  updated_at: string;
}
