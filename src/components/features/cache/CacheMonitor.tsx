'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { sessionDataCache } from '@/services/sessionDataCache';
import { Activity, BarChart3, Trash2, RefreshCw } from 'lucide-react';

export function CacheMonitor() {
  const [stats, setStats] = useState(sessionDataCache.getStats());
  const [isVisible, setIsVisible] = useState(false);

  // Only show in development environment
  useEffect(() => {
    setIsVisible(process.env.NODE_ENV === 'development');
  }, []);

  const refreshStats = () => {
    setStats(sessionDataCache.getStats());
  };

  const clearCache = () => {
    sessionDataCache.clearAll();
    refreshStats();
  };

  // Auto-refresh stats every 5 seconds when component is mounted
  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(refreshStats, 5000);
    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  const getHitRateColor = (hitRate: number) => {
    if (hitRate >= 80) return 'text-green-600';
    if (hitRate >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card className="mt-4 border-dashed border-orange-200 bg-orange-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Cache Performance Monitor
          <Badge variant="outline" className="text-xs">Dev Only</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="text-center">
            <div className="font-medium text-gray-600">Summary Cache</div>
            <div className="text-lg font-bold">{stats.cacheSize}</div>
            <div className="text-gray-500">entries</div>
          </div>
          <div className="text-center">
            <div className="font-medium text-gray-600">Full Records Cache</div>
            <div className="text-lg font-bold">{stats.fullRecordsCacheSize}</div>
            <div className="text-gray-500">entries</div>
          </div>
          <div className="text-center">
            <div className="font-medium text-gray-600">Memory Usage</div>
            <div className="text-lg font-bold">{stats.memoryUsageEstimate.split(' ')[0]}</div>
            <div className="text-gray-500">KB</div>
          </div>
          <div className="text-center">
            <div className="font-medium text-gray-600">Invalidations</div>
            <div className="text-lg font-bold">{stats.invalidations}</div>
            <div className="text-gray-500">total</div>
          </div>
        </div>

        {/* Hit Rate Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 bg-white rounded-lg border">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm">Summary Cache</h4>
              <BarChart3 className="h-4 w-4 text-gray-400" />
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Hit Rate:</span>
                <span className={`font-medium ${getHitRateColor(stats.hitRate)}`}>
                  {stats.hitRate}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>Requests:</span>
                <span>{stats.totalRequests}</span>
              </div>
              <div className="flex justify-between">
                <span>Hits:</span>
                <span className="text-green-600">{stats.hits}</span>
              </div>
              <div className="flex justify-between">
                <span>Misses:</span>
                <span className="text-red-600">{stats.misses}</span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-white rounded-lg border">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm">Full Records Cache</h4>
              <BarChart3 className="h-4 w-4 text-gray-400" />
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Hit Rate:</span>
                <span className={`font-medium ${getHitRateColor(stats.fullRecordsHitRate)}`}>
                  {stats.fullRecordsHitRate}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>Requests:</span>
                <span>{stats.fullRecordRequests}</span>
              </div>
              <div className="flex justify-between">
                <span>Hits:</span>
                <span className="text-green-600">{stats.fullRecordHits}</span>
              </div>
              <div className="flex justify-between">
                <span>Misses:</span>
                <span className="text-red-600">{stats.fullRecordMisses}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Performance Indicators */}
        <div className="flex flex-wrap gap-2 text-xs">
          {stats.hitRate >= 80 && (
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              Excellent Cache Performance
            </Badge>
          )}
          {stats.fullRecordsHitRate >= 80 && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              Fast Page Navigation
            </Badge>
          )}
          {stats.fullRecordRequests > 0 && stats.fullRecordsHitRate === 100 && (
            <Badge variant="secondary" className="bg-purple-100 text-purple-800">
              0ms Page Loads
            </Badge>
          )}
          {parseInt(stats.memoryUsageEstimate.split(' ')[0]) > 100 && (
            <Badge variant="outline" className="text-orange-600">
              High Memory Usage
            </Badge>
          )}
        </div>

        {/* Memory Breakdown */}
        <div className="text-xs text-gray-600">
          <strong>Memory Breakdown:</strong> {stats.memoryUsageEstimate}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={refreshStats}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={clearCache}>
            <Trash2 className="h-3 w-3 mr-1" />
            Clear Cache
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}