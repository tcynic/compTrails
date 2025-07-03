'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useOffline } from '@/components/providers/OfflineProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/dashboard-layout';
import { DashboardOverview } from '@/components/features/dashboard';
import { Card, CardContent } from '@/components/ui/card';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const { isOnline, syncStatus, serviceWorkerStatus } = useOffline();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto px-6 py-8">
        <DashboardOverview />
        
        {/* System Status - Less prominent at bottom */}
        <div className="mt-12 pt-8 border-t">
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <div className="font-medium text-gray-600">Connection</div>
                  <div className={`${isOnline ? 'text-green-600' : 'text-red-600'}`}>
                    {isOnline ? '🟢 Online' : '🔴 Offline'}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-gray-600">Sync Status</div>
                  <div className="text-gray-600">
                    {syncStatus === 'idle' && '⏸️ Idle'}
                    {syncStatus === 'syncing' && '🔄 Syncing'}
                    {syncStatus === 'offline' && '📱 Offline'}
                    {syncStatus === 'error' && '❌ Error'}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-gray-600">Service Worker</div>
                  <div className="text-gray-600">
                    {serviceWorkerStatus === 'activated' && '✅ Active'}
                    {serviceWorkerStatus === 'installing' && '⏳ Installing'}
                    {serviceWorkerStatus === 'unsupported' && '❌ Unsupported'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}