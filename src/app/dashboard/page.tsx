'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useOffline } from '@/components/providers/OfflineProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardPage() {
  const { user, logout, loading } = useAuth();
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
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">CT</span>
              </div>
              <h1 className="ml-3 text-2xl font-bold text-gray-900">CompTrails</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">
                Welcome, {user.firstName} {user.lastName}
              </span>
              <button
                onClick={logout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="space-y-8">
            <div className="border-4 border-dashed border-gray-200 rounded-lg p-8 text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Welcome to CompTrails Dashboard
              </h2>
              <p className="text-gray-600 mb-2">
                Your compensation tracking dashboard is under development.
              </p>
              <p className="text-sm text-gray-500">
                Signed in as: {user.email}
              </p>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">
                🔒 Encryption Implementation Complete
              </h3>
              <p className="text-blue-800 text-sm mb-3">
                Zero-knowledge encryption with Argon2id key derivation and AES-256-GCM is now implemented.
                All sensitive compensation data will be encrypted client-side before storage.
              </p>
            </div>
            
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-green-900 mb-2">
                📱 Offline-First Architecture Complete
              </h3>
              <p className="text-green-800 text-sm mb-3">
                Local-first data storage with IndexedDB, offline sync queue, and service worker caching.
                Your data is always available, even without an internet connection.
              </p>
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <div className="font-medium">Connection Status</div>
                  <div className={`${isOnline ? 'text-green-600' : 'text-red-600'}`}>
                    {isOnline ? '🟢 Online' : '🔴 Offline'}
                  </div>
                </div>
                <div>
                  <div className="font-medium">Sync Status</div>
                  <div className="text-gray-600">
                    {syncStatus === 'idle' && '⏸️ Idle'}
                    {syncStatus === 'syncing' && '🔄 Syncing'}
                    {syncStatus === 'offline' && '📱 Offline'}
                    {syncStatus === 'error' && '❌ Error'}
                  </div>
                </div>
                <div>
                  <div className="font-medium">Service Worker</div>
                  <div className="text-gray-600">
                    {serviceWorkerStatus === 'activated' && '✅ Active'}
                    {serviceWorkerStatus === 'installing' && '⏳ Installing'}
                    {serviceWorkerStatus === 'unsupported' && '❌ Unsupported'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}