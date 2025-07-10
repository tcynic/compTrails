import { usePassword as usePasswordContext, useSecurePassword as useSecurePasswordContext, useRequiredPassword as useRequiredPasswordContext } from '@/contexts/PasswordContext';
import { useCallback, useEffect, useState } from 'react';

// Re-export the main hooks from context for convenience
export const usePassword = usePasswordContext;
export const useSecurePassword = useSecurePasswordContext;
export const useRequiredPassword = useRequiredPasswordContext;

/**
 * Hook for components that need to handle password authentication flow
 * Provides utilities for password setup, authentication, and error handling
 */
export function usePasswordAuth() {
  const {
    isPasswordSet,
    isAuthenticated,
    setupMasterPassword,
    authenticateWithPassword,
    changeMasterPassword,
    isLoading,
    error,
    clearError,
  } = usePassword();

  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [showPasswordAuth, setShowPasswordAuth] = useState(false);

  // Auto-show password setup or auth dialogs based on state
  useEffect(() => {
    if (!isPasswordSet) {
      setShowPasswordSetup(true);
      setShowPasswordAuth(false);
    } else if (!isAuthenticated) {
      setShowPasswordSetup(false);
      setShowPasswordAuth(true);
    } else {
      setShowPasswordSetup(false);
      setShowPasswordAuth(false);
    }
  }, [isPasswordSet, isAuthenticated]);

  const handleSetupPassword = useCallback(async (password: string) => {
    const result = await setupMasterPassword(password);
    if (result.success) {
      setShowPasswordSetup(false);
    }
    return result;
  }, [setupMasterPassword]);

  const handleAuthenticatePassword = useCallback(async (password: string) => {
    const result = await authenticateWithPassword(password);
    if (result.success) {
      setShowPasswordAuth(false);
    }
    return result;
  }, [authenticateWithPassword]);

  const handleChangePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    const result = await changeMasterPassword(oldPassword, newPassword);
    return result;
  }, [changeMasterPassword]);

  return {
    // State
    isPasswordSet,
    isAuthenticated,
    isLoading,
    error,
    
    // UI state
    showPasswordSetup,
    showPasswordAuth,
    setShowPasswordSetup,
    setShowPasswordAuth,
    
    // Actions
    handleSetupPassword,
    handleAuthenticatePassword,
    handleChangePassword,
    clearError,
  };
}

/**
 * Hook for components that need to ensure they have a valid password
 * Will automatically trigger authentication flow if needed
 */
export function useEnsurePassword() {
  const { isAuthenticated, getPassword, extendSession } = usePassword();
  const [isReady, setIsReady] = useState(false);
  const [password, setPassword] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      const currentPassword = getPassword();
      setPassword(currentPassword);
      setIsReady(!!currentPassword);
      
      // Extend session when password is accessed
      if (currentPassword) {
        extendSession();
      }
    } else {
      setPassword(null);
      setIsReady(false);
    }
  }, [isAuthenticated, getPassword, extendSession]);

  return {
    isReady,
    password,
    isAuthenticated,
  };
}

/**
 * Hook for components that need to perform encrypted operations
 * Provides utilities for encryption/decryption with automatic password handling
 */
export function useEncryptedOperations() {
  const { isAuthenticated, getPassword, extendSession } = usePassword();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(isAuthenticated && !!getPassword());
  }, [isAuthenticated, getPassword]);

  const withPassword = useCallback(<T extends any[], R>(
    operation: (password: string, ...args: T) => R
  ) => {
    return (...args: T): R | null => {
      if (!isAuthenticated) {
        console.warn('Cannot perform encrypted operation: user not authenticated');
        return null;
      }

      const password = getPassword();
      if (!password) {
        console.warn('Cannot perform encrypted operation: password not available');
        return null;
      }

      // Extend session when performing operations
      extendSession();

      try {
        return operation(password, ...args);
      } catch (error) {
        console.error('Encrypted operation failed:', error);
        return null;
      }
    };
  }, [isAuthenticated, getPassword, extendSession]);

  return {
    isReady,
    withPassword,
    isAuthenticated,
  };
}

/**
 * Hook for password strength validation with real-time feedback
 */
export function usePasswordValidation() {
  const { validatePassword, generateSecurePassword } = usePassword();
  const [password, setPassword] = useState('');
  const [validation, setValidation] = useState(validatePassword(''));

  const updatePassword = useCallback((newPassword: string) => {
    setPassword(newPassword);
    setValidation(validatePassword(newPassword));
  }, [validatePassword]);

  const generatePassword = useCallback((length?: number) => {
    const generated = generateSecurePassword(length);
    updatePassword(generated);
    return generated;
  }, [generateSecurePassword, updatePassword]);

  const clearPassword = useCallback(() => {
    setPassword('');
    setValidation(validatePassword(''));
  }, [validatePassword]);

  return {
    password,
    validation,
    updatePassword,
    generatePassword,
    clearPassword,
    setPassword: updatePassword,
  };
}