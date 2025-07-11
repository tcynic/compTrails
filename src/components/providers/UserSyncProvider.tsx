'use client';

import { createContext, useContext, useEffect, ReactNode } from 'react';
import { SyncService } from '@/services/syncService';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface UserSyncContextType {
  userId: string | null;
  triggerUserSync: () => Promise<void>;
}

const UserSyncContext = createContext<UserSyncContextType | null>(null);

interface UserSyncProviderProps {
  children: ReactNode;
  user: User | null;
}

/**
 * Provider that connects user authentication with sync operations
 * Ensures sync operations have access to the current user ID
 */
export function UserSyncProvider({ children, user }: UserSyncProviderProps) {
  // Update SyncService whenever user changes
  useEffect(() => {
    if (user) {
      // Set user context for sync operations
      SyncService.setUserContext(user.id);
      
      // Trigger sync for the authenticated user
      SyncService.triggerSync(user.id);
    } else {
      // Clear user context when user logs out
      SyncService.setUserContext(null);
    }
  }, [user]);

  const triggerUserSync = async () => {
    if (user) {
      await SyncService.triggerSync(user.id);
    }
  };

  const value: UserSyncContextType = {
    userId: user?.id || null,
    triggerUserSync,
  };

  return (
    <UserSyncContext.Provider value={value}>
      {children}
    </UserSyncContext.Provider>
  );
}

export function useUserSync() {
  const context = useContext(UserSyncContext);
  if (!context) {
    throw new Error('useUserSync must be used within a UserSyncProvider');
  }
  return context;
}