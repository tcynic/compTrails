'use client';

import { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PasswordProvider } from '@/contexts/PasswordContext';

interface PasswordAuthBridgeProps {
  children: ReactNode;
}

/**
 * Bridge component that connects AuthContext with PasswordProvider
 * This enables automatic encryption key derivation from user authentication
 */
export function PasswordAuthBridge({ children }: PasswordAuthBridgeProps) {
  const { user } = useAuth();
  
  return (
    <PasswordProvider user={user}>
      {children}
    </PasswordProvider>
  );
}