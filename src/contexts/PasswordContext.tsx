'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { PasswordService, PasswordValidationResult, MasterPasswordState } from '@/services/passwordService';

interface PasswordContextType {
  // Password state
  isPasswordSet: boolean;
  isAuthenticated: boolean;
  isSessionValid: boolean;
  passwordState: MasterPasswordState;
  
  // Password operations
  setupMasterPassword: (password: string) => Promise<{
    success: boolean;
    error?: string;
    validation?: PasswordValidationResult;
  }>;
  
  authenticateWithPassword: (password: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  
  changeMasterPassword: (oldPassword: string, newPassword: string) => Promise<{
    success: boolean;
    error?: string;
    validation?: PasswordValidationResult;
  }>;
  
  // Session management
  getPassword: () => string | null;
  extendSession: () => void;
  clearSession: () => void;
  
  // Utilities
  validatePassword: (password: string) => PasswordValidationResult;
  generateSecurePassword: (length?: number) => string;
  
  // Loading states
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

const PasswordContext = createContext<PasswordContextType | null>(null);

interface PasswordProviderProps {
  children: ReactNode;
}

export function PasswordProvider({ children }: PasswordProviderProps) {
  const [passwordState, setPasswordState] = useState<MasterPasswordState>({
    isSet: false,
    hashedFingerprint: null,
    createdAt: null,
    lastUsed: null,
  });
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize password state on mount
  useEffect(() => {
    const initializePasswordState = () => {
      try {
        const state = PasswordService.getMasterPasswordState();
        setPasswordState(state);
        
        // Check if there's a valid session
        const isSessionValid = PasswordService.isSessionValid();
        setIsAuthenticated(isSessionValid);
      } catch (err) {
        console.error('Failed to initialize password state:', err);
        setError('Failed to initialize password system');
      } finally {
        setIsLoading(false);
      }
    };

    initializePasswordState();
  }, []);

  // Session validation timer
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkSessionValidity = () => {
      const isValid = PasswordService.isSessionValid();
      if (!isValid) {
        setIsAuthenticated(false);
        setError('Session expired. Please re-enter your password.');
      }
    };

    // Check session validity every minute
    const interval = setInterval(checkSessionValidity, 60 * 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const setupMasterPassword = useCallback(async (password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await PasswordService.setupMasterPassword(password);
      
      if (result.success) {
        const updatedState = PasswordService.getMasterPasswordState();
        setPasswordState(updatedState);
        setIsAuthenticated(true);
      } else {
        setError(result.error || 'Failed to set up master password');
      }
      
      return result;
    } catch (_err) {
      const errorMessage = 'Failed to set up master password';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const authenticateWithPassword = useCallback(async (password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await PasswordService.authenticateWithMasterPassword(password);
      
      if (result.success) {
        const updatedState = PasswordService.getMasterPasswordState();
        setPasswordState(updatedState);
        setIsAuthenticated(true);
      } else {
        setError(result.error || 'Authentication failed');
      }
      
      return result;
    } catch (_err) {
      const errorMessage = 'Authentication failed';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const changeMasterPassword = useCallback(async (oldPassword: string, newPassword: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await PasswordService.changeMasterPassword(oldPassword, newPassword);
      
      if (result.success) {
        const updatedState = PasswordService.getMasterPasswordState();
        setPasswordState(updatedState);
        // User remains authenticated with new password
      } else {
        setError(result.error || 'Failed to change password');
      }
      
      return result;
    } catch (_err) {
      const errorMessage = 'Failed to change password';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getPassword = useCallback(() => {
    if (!isAuthenticated) {
      return null;
    }
    return PasswordService.getSessionPassword();
  }, [isAuthenticated]);

  const extendSession = useCallback(() => {
    if (isAuthenticated) {
      PasswordService.extendSession();
    }
  }, [isAuthenticated]);

  const clearSession = useCallback(() => {
    PasswordService.clearSessionPassword();
    setIsAuthenticated(false);
    setError(null);
  }, []);

  const validatePassword = useCallback((password: string) => {
    return PasswordService.validatePassword(password);
  }, []);

  const generateSecurePassword = useCallback((length?: number) => {
    return PasswordService.generateSecurePassword(length);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Clear session when component unmounts or user logs out
  useEffect(() => {
    return () => {
      // Don't clear session on unmount - preserve it for the session
    };
  }, []);

  const value: PasswordContextType = useMemo(() => ({
    // Password state
    isPasswordSet: passwordState.isSet,
    isAuthenticated,
    isSessionValid: isAuthenticated && PasswordService.isSessionValid(),
    passwordState,
    
    // Password operations
    setupMasterPassword,
    authenticateWithPassword,
    changeMasterPassword,
    
    // Session management
    getPassword,
    extendSession,
    clearSession,
    
    // Utilities
    validatePassword,
    generateSecurePassword,
    
    // Loading states
    isLoading,
    error,
    clearError,
  }), [
    passwordState,
    isAuthenticated,
    setupMasterPassword,
    authenticateWithPassword,
    changeMasterPassword,
    getPassword,
    extendSession,
    clearSession,
    validatePassword,
    generateSecurePassword,
    isLoading,
    error,
    clearError,
  ]);

  return (
    <PasswordContext.Provider value={value}>
      {children}
    </PasswordContext.Provider>
  );
}

export function usePassword() {
  const context = useContext(PasswordContext);
  if (!context) {
    throw new Error('usePassword must be used within a PasswordProvider');
  }
  return context;
}

/**
 * Hook for components that need to ensure password is available
 * Returns null if password is not authenticated, otherwise returns the password
 */
export function useSecurePassword(): string | null {
  const { isAuthenticated, getPassword } = usePassword();
  
  if (!isAuthenticated) {
    return null;
  }
  
  return getPassword();
}

/**
 * Hook for components that need to ensure password is available
 * Throws an error if password is not authenticated
 */
export function useRequiredPassword(): string {
  const password = useSecurePassword();
  
  if (!password) {
    throw new Error('Password is required but not available. User must be authenticated.');
  }
  
  return password;
}