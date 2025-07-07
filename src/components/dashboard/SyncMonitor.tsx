'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SyncService } from '@/services/syncService';
import { useOffline } from '@/components/providers/OfflineProvider';
import { 
  Wifi, 
  WifiOff, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw,
  Activity,
  Database,
  Smartphone
} from 'lucide-react';

interface SyncStats {
  pendingSync: number;
  offlineQueue: number;
  isOnline: boolean;
  syncInProgress: boolean;
}

interface BackgroundSyncStatus {
  supported: boolean;
  registered: string[];
  queueSize: number;
}


export function SyncMonitor() {
  const { isOnline, syncStatus, triggerSync, triggerEmergencySync, isPageVisible } = useOffline();
  const [syncStats, setSyncStats] = useState<SyncStats>({
    pendingSync: 0,
    offlineQueue: 0,
    isOnline: true,
    syncInProgress: false,
  });
  const [backgroundSyncStatus, setBackgroundSyncStatus] = useState<BackgroundSyncStatus>({
    supported: false,
    registered: [],
    queueSize: 0,
  });
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Update sync stats
  const updateSyncStats = async () => {
    try {
      const stats = await SyncService.getSyncStats();
      setSyncStats(stats);
      
      const bgStatus = await SyncService.getBackgroundSyncStatus();
      setBackgroundSyncStatus(bgStatus);
    } catch (error) {
      console.error('Error updating sync stats:', error);
    }
  };

  // Refresh stats manually
  const refreshStats = async () => {
    setRefreshing(true);
    await updateSyncStats();
    setRefreshing(false);
  };

  // Trigger manual sync
  const handleManualSync = async () => {
    await triggerSync();
    setLastSyncTime(new Date());
    setTimeout(updateSyncStats, 1000); // Update stats after sync
  };

  // Trigger emergency sync
  const handleEmergencySync = () => {
    triggerEmergencySync();
    setLastSyncTime(new Date());
    setTimeout(updateSyncStats, 1000);
  };

  // Update stats periodically
  useEffect(() => {
    updateSyncStats();
    const interval = setInterval(updateSyncStats, 10000); // Every 10 seconds
    return () => clearInterval(interval);
  }, []);

  // Update last sync time when sync status changes
  useEffect(() => {
    if (syncStatus === 'idle') {
      setLastSyncTime(new Date());
    }
  }, [syncStatus]);

  const getSyncStatusIcon = () => {
    switch (syncStatus) {
      case 'syncing':
        return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />;
      case 'offline':
        return <WifiOff className="h-4 w-4 text-gray-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
  };

  const getSyncStatusText = () => {
    switch (syncStatus) {
      case 'syncing':
        return 'Syncing...';
      case 'offline':
        return 'Offline';
      case 'error':
        return 'Sync Error';
      default:
        return 'Up to date';
    }
  };

  const getSyncStatusColor = () => {
    switch (syncStatus) {
      case 'syncing':
        return 'bg-blue-100 text-blue-800';
      case 'offline':
        return 'bg-gray-100 text-gray-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-green-100 text-green-800';
    }
  };

  const totalPendingItems = syncStats.pendingSync + syncStats.offlineQueue;
  const queueProgress = backgroundSyncStatus.queueSize > 0 
    ? ((backgroundSyncStatus.queueSize - totalPendingItems) / backgroundSyncStatus.queueSize) * 100 
    : 100;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">Sync Status</CardTitle>
            <CardDescription>
              Real-time synchronization monitoring
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={refreshStats}
              disabled={refreshing}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current Status */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            {getSyncStatusIcon()}
            <div>
              <div className="font-medium">{getSyncStatusText()}</div>
              {lastSyncTime && (
                <div className="text-sm text-gray-500">
                  Last sync: {lastSyncTime.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
          <Badge className={getSyncStatusColor()}>
            {getSyncStatusText()}
          </Badge>
        </div>

        {/* Connection Status */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
            {isOnline ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
            <span className="text-sm font-medium">
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
            <Smartphone className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium">
              {isPageVisible ? 'Active' : 'Background'}
            </span>
          </div>
        </div>

        <div className="border-t" />

        {/* Queue Information */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Sync Queue</h4>
            <span className="text-sm text-gray-500">
              {totalPendingItems} items pending
            </span>
          </div>

          {totalPendingItems > 0 && (
            <div className="bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${queueProgress}%` }}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Database className="h-3 w-3 text-blue-500" />
              <span>Pending: {syncStats.pendingSync}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3 text-orange-500" />
              <span>Offline: {syncStats.offlineQueue}</span>
            </div>
          </div>
        </div>

        <div className="border-t" />

        {/* Background Sync Status */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Background Sync</h4>
            <Badge variant={backgroundSyncStatus.supported ? 'default' : 'secondary'}>
              {backgroundSyncStatus.supported ? 'Supported' : 'Not Available'}
            </Badge>
          </div>

          {backgroundSyncStatus.supported && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Registered tasks:</span>
                <span className="font-medium">{backgroundSyncStatus.registered.length}</span>
              </div>
              
              {backgroundSyncStatus.registered.length > 0 && (
                <div className="bg-blue-50 p-2 rounded text-xs">
                  <div className="font-medium mb-1">Active tasks:</div>
                  {backgroundSyncStatus.registered.slice(0, 3).map((tag, index) => (
                    <div key={index} className="text-gray-600">
                      {tag.replace('compensation-sync-', '')}
                    </div>
                  ))}
                  {backgroundSyncStatus.registered.length > 3 && (
                    <div className="text-gray-500 mt-1">
                      +{backgroundSyncStatus.registered.length - 3} more
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t" />

        {/* Actions */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleManualSync}
              disabled={syncStatus === 'syncing'}
              className="w-full"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Sync Now
            </Button>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleEmergencySync}
              disabled={syncStatus === 'syncing'}
              className="w-full"
            >
              <Activity className="h-3 w-3 mr-1" />
              Emergency Sync
            </Button>
          </div>

          {totalPendingItems > 5 && (
            <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
              <AlertCircle className="h-3 w-3 inline mr-1" />
              Large sync queue detected. Consider checking your connection.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}