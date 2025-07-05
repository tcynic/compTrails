'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: (provider?: string) => void;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  const checkAuthStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const user = await response.json();
        setAuthState(() => ({
          user,
          loading: false,
          error: null,
        }));
      } else {
        setAuthState(() => ({
          user: null,
          loading: false,
          error: null,
        }));
      }
    } catch {
      setAuthState(() => ({
        user: null,
        loading: false,
        error: 'Failed to check authentication status',
      }));
    }
  }, []);

  // Check for existing session on mount
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const login = useCallback((provider: string = 'GoogleOAuth') => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }));
    window.location.href = `/api/auth/login?provider=${provider}`;
  }, []);

  const logout = useCallback(async () => {
    try {
      setAuthState(prev => ({ ...prev, loading: true }));
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      });
      
      if (response.ok) {
        setAuthState(() => ({
          user: null,
          loading: false,
          error: null,
        }));
        window.location.href = '/login';
      } else {
        throw new Error('Logout failed');
      }
    } catch {
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to logout',
      }));
    }
  }, []);

  const clearError = useCallback(() => {
    setAuthState(prev => ({ ...prev, error: null }));
  }, []);

  const value: AuthContextType = useMemo(() => ({
    ...authState,
    login,
    logout,
    clearError,
  }), [authState, login, logout, clearError]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}