'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Settings, 
  User, 
  Shield, 
  Bell, 
  Database,
  Download,
  Upload,
  Eye,
  EyeOff,
  Lock,
  Smartphone,
  Globe,
  RefreshCw,
  Activity
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOffline } from '@/components/providers/OfflineProvider';
import { useAnalytics } from '@/hooks/useAnalytics';
import { SyncService } from '@/services/syncService';
import { getSyncConfig, updateSyncConfig } from '@/lib/config/syncConfig';
import { DuplicateCleanupPanel } from '@/components/admin/DuplicateCleanupPanel';

export default function SettingsPage() {
  const { user } = useAuth();
  const { isOnline, syncStatus } = useOffline();
  const { trackPageView, trackFeatureUsage, setEnabled, getEnabled } = useAnalytics();
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  
  // Sync preferences state
  const [syncPreferences, setSyncPreferences] = useState({
    emergencySync: true,
    backgroundSync: true,
    visibilityChangeSync: true,
    beforeUnloadSync: true,
  });
  const [backgroundSyncSupported, setBackgroundSyncSupported] = useState(false);

  useEffect(() => {
    // Track settings page view
    trackPageView('settings');
    
    // Get current analytics state
    setAnalyticsEnabled(getEnabled());
    
    // Load sync preferences
    const config = getSyncConfig();
    setSyncPreferences({
      emergencySync: config.emergency.enabled,
      backgroundSync: SyncService.isBackgroundSyncSupported(),
      visibilityChangeSync: config.emergency.visibilityChangeSync,
      beforeUnloadSync: config.emergency.beforeUnloadSync,
    });
    
    // Check background sync support
    setBackgroundSyncSupported(SyncService.isBackgroundSyncSupported());
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once on mount to prevent rate limiting

  const handleAnalyticsToggle = (enabled: boolean) => {
    setAnalyticsEnabled(enabled);
    setEnabled(enabled);
    
    // Track the analytics preference change
    trackFeatureUsage({
      feature_name: 'analytics_settings',
      action: enabled ? 'opt_in' : 'opt_out',
    });
  };

  const handleSyncPreferenceChange = (preference: keyof typeof syncPreferences, enabled: boolean) => {
    const newPreferences = { ...syncPreferences, [preference]: enabled };
    setSyncPreferences(newPreferences);
    
    // Update sync configuration
    const currentConfig = getSyncConfig();
    updateSyncConfig({
      emergency: {
        ...currentConfig.emergency,
        enabled: preference === 'emergencySync' ? enabled : currentConfig.emergency.enabled,
        visibilityChangeSync: preference === 'visibilityChangeSync' ? enabled : currentConfig.emergency.visibilityChangeSync,
        beforeUnloadSync: preference === 'beforeUnloadSync' ? enabled : currentConfig.emergency.beforeUnloadSync,
      },
    });
    
    // Track the preference change
    trackFeatureUsage({
      feature_name: 'sync_preferences',
      action: enabled ? 'enable' : 'disable',
      section: preference,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="text-gray-600">Manage your account and application preferences</p>
          </div>
        </div>

        {/* Duplicate Cleanup Panel - Temporary for cleanup process */}
        <DuplicateCleanupPanel />

        {/* Settings Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Profile Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-700">
                    {user?.firstName} {user?.lastName}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    Managed by SSO
                  </Badge>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-700">{user?.email}</span>
                  <Badge variant="outline" className="text-xs">
                    Managed by SSO
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Default Currency</label>
                <select className="w-full p-2 border border-gray-300 rounded-md text-sm">
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - British Pound</option>
                  <option value="CAD">CAD - Canadian Dollar</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Security Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security & Privacy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Two-Factor Authentication</p>
                  <p className="text-xs text-gray-500">Add an extra layer of security</p>
                </div>
                <Button size="sm" variant="outline">
                  <Smartphone className="h-4 w-4 mr-1" />
                  Enable
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Encryption Status</p>
                  <p className="text-xs text-gray-500">All data encrypted client-side</p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  <Lock className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Session Management</p>
                  <p className="text-xs text-gray-500">Manage active sessions</p>
                </div>
                <Button size="sm" variant="outline">
                  View Sessions
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Data Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Data Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Sync Status</p>
                  <p className="text-xs text-gray-500">
                    {isOnline ? 'Connected' : 'Offline'} • {syncStatus}
                  </p>
                </div>
                <Badge variant={isOnline ? "secondary" : "outline"} className="text-xs">
                  <Globe className="h-3 w-3 mr-1" />
                  {isOnline ? 'Online' : 'Offline'}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Export All Data</p>
                  <p className="text-xs text-gray-500">Download all your compensation data</p>
                </div>
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Import Data</p>
                  <p className="text-xs text-gray-500">Import from previous exports</p>
                </div>
                <Button size="sm" variant="outline">
                  <Upload className="h-4 w-4 mr-1" />
                  Import
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Local Storage</p>
                  <p className="text-xs text-gray-500">Clear local cache and data</p>
                </div>
                <Button size="sm" variant="outline">
                  Clear Cache
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Sync Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Sync Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Emergency Sync</p>
                  <p className="text-xs text-gray-500">Enable emergency sync on tab closure</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={syncPreferences.emergencySync}
                    onChange={(e) => handleSyncPreferenceChange('emergencySync', e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Background Sync</p>
                  <p className="text-xs text-gray-500">
                    Sync data when app is in background
                    {!backgroundSyncSupported && " (Not supported in this browser)"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {backgroundSyncSupported ? (
                    <Badge variant="secondary" className="text-xs">
                      <Activity className="h-3 w-3 mr-1" />
                      Supported
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      Not Available
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Visibility Change Sync</p>
                  <p className="text-xs text-gray-500">Sync when switching tabs or minimizing</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={syncPreferences.visibilityChangeSync}
                    onChange={(e) => handleSyncPreferenceChange('visibilityChangeSync', e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Page Unload Sync</p>
                  <p className="text-xs text-gray-500">Emergency sync when closing browser</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={syncPreferences.beforeUnloadSync}
                    onChange={(e) => handleSyncPreferenceChange('beforeUnloadSync', e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-700">
                  <Activity className="h-3 w-3 inline mr-1" />
                  Emergency sync helps prevent data loss by syncing changes when you close tabs or the browser.
                  Background sync works even when the app is closed (where supported).
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Email Notifications</p>
                  <p className="text-xs text-gray-500">Receive updates via email</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Sync Notifications</p>
                  <p className="text-xs text-gray-500">Notify when data sync completes</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Security Alerts</p>
                  <p className="text-xs text-gray-500">Important security notifications</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Usage Analytics</p>
                  <p className="text-xs text-gray-500">Help improve the app with anonymous usage data</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={analyticsEnabled}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleAnalyticsToggle(e.currentTarget!.checked)}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* API Keys Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              API Keys & Integrations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Personal API Key</p>
                <p className="text-xs text-gray-500">For integrating with external tools</p>
              </div>
              <div className="flex items-center space-x-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setShowApiKeys(!showApiKeys)}
                >
                  {showApiKeys ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="outline">
                  Generate
                </Button>
              </div>
            </div>
            
            {showApiKeys && (
              <div className="p-3 bg-gray-50 rounded-md">
                <code className="text-sm font-mono">ct_api_key_placeholder_would_go_here</code>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Webhook URL</p>
                <p className="text-xs text-gray-500">For receiving real-time updates</p>
              </div>
              <Button size="sm" variant="outline">
                Configure
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-600">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Delete All Data</p>
                <p className="text-xs text-gray-500">Permanently delete all compensation data</p>
              </div>
              <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50">
                Delete All
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Delete Account</p>
                <p className="text-xs text-gray-500">Permanently delete your account and all data</p>
              </div>
              <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50">
                Delete Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}