'use client';

import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useUser, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

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
  const { user: clerkUser, isLoaded } = useUser();
  const { signOut, redirectToSignIn } = useClerk();
  const router = useRouter();

  // Transform Clerk user to our User interface
  const user: User | null = useMemo(() => {
    if (!clerkUser) return null;
    
    return {
      id: clerkUser.id,
      email: clerkUser.primaryEmailAddress?.emailAddress || '',
      firstName: clerkUser.firstName || '',
      lastName: clerkUser.lastName || '',
    };
  }, [clerkUser]);

  const login = () => {
    redirectToSignIn();
  };

  const logout = async () => {
    await signOut();
    router.push('/login');
  };

  const clearError = () => {
    // No-op for now, Clerk handles errors internally
  };

  const value: AuthContextType = useMemo(() => ({
    user,
    loading: !isLoaded,
    error: null,
    login,
    logout,
    clearError,
  }), [user, isLoaded, login, logout, clearError]);

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
