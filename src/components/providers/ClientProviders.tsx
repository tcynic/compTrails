'use client';

import { AuthProvider } from '@/contexts/AuthContext';
import { OfflineProvider } from '@/components/providers/OfflineProvider';
import { ConvexClientProvider } from '@/providers/ConvexClientProvider';

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConvexClientProvider>
      <AuthProvider>
        <OfflineProvider>
          {children}
        </OfflineProvider>
      </AuthProvider>
    </ConvexClientProvider>
  );
}
