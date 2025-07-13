'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { AnalyticsService } from '@/services/analyticsService';
import { PasswordService } from '@/services/passwordService';

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
  
  // Track auth check status to prevent infinite retries
  const [lastAuthCheck, setLastAuthCheck] = useState<number>(0);
  const [authCheckInProgress, setAuthCheckInProgress] = useState<boolean>(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState<boolean>(false);

  const checkAuthStatus = useCallback(async () => {
    // Prevent multiple concurrent auth checks
    if (authCheckInProgress) {
      console.log('[AuthContext] Auth check already in progress, skipping');
      return;
    }
    
    // Rate limit auth checks to prevent spam (minimum 5 seconds between checks)
    const now = Date.now();
    if (now - lastAuthCheck < 5000) {
      console.log('[AuthContext] Auth check rate limited, skipping');
      return;
    }
    
    setAuthCheckInProgress(true);
    setLastAuthCheck(now);
    
    try {
      console.log('[AuthContext] Checking authentication status...');
      const response = await fetch('/api/auth/me', {
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });
      
      if (response.ok) {
        const user = await response.json() as User;
        console.log('[AuthContext] User authenticated:', user.email);
        setAuthState(() => ({
          user,
          loading: false,
          error: null,
        }));
        setHasCheckedAuth(true);
        
        // Track successful authentication check and identify user
        AnalyticsService.identifyUser(user.id, {
          has_first_name: !!user.firstName,
          has_last_name: !!user.lastName,
        });
        AnalyticsService.trackEngagement('session_start');
      } else if (response.status === 401) {
        // User is not authenticated - this is expected, don't treat as an error
        console.log('[AuthContext] User not authenticated (401)');
        setAuthState(() => ({
          user: null,
          loading: false,
          error: null,
        }));
        setHasCheckedAuth(true);
      } else {
        // Other error status codes
        console.warn(`[AuthContext] Auth check failed with status ${response.status}`);
        setAuthState(() => ({
          user: null,
          loading: false,
          error: `Authentication check failed (${response.status})`,
        }));
        setHasCheckedAuth(true);
      }
    } catch (error) {
      console.error('[AuthContext] Auth check failed:', error);
      setAuthState(() => ({
        user: null,
        loading: false,
        error: 'Failed to check authentication status',
      }));
      AnalyticsService.trackError('auth_check_failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setAuthCheckInProgress(false);
    }
  }, [authCheckInProgress, lastAuthCheck]);

  // Check for existing session on mount (only once)
  useEffect(() => {
    if (!hasCheckedAuth) {
      checkAuthStatus();
    }
  }, [checkAuthStatus, hasCheckedAuth]);

  const login = useCallback((provider: string = 'GoogleOAuth') => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }));
    
    // Track login attempt
    AnalyticsService.trackAuth('login_attempt', { provider });
    
    window.location.href = `/api/auth/login?provider=${provider}`;
  }, []);

  const logout = useCallback(async () => {
    try {
      setAuthState(prev => ({ ...prev, loading: true }));
      
      // Track logout attempt
      AnalyticsService.trackAuth('logout');
      AnalyticsService.trackEngagement('session_end');
      
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      });
      
      if (response.ok) {
        // Reset analytics tracking
        AnalyticsService.reset();
        
        // Clear password session data
        PasswordService.clearAllPasswordData();
        
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
      AnalyticsService.trackError('logout_failed', 'Network or server error');
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