'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { analyzeDuplicatesForUser, cleanupDuplicatesForUser, cleanupAllUserDuplicates } from '@/utils/runDuplicateCleanup';

interface AnalysisResult {
  summary: {
    totalRecords: number;
    duplicateRecords: number;
    duplicatePercentage: number;
    duplicatesByType: Record<string, number>;
    duplicatesByReason: Record<string, number>;
  };
  recommendations: string[];
}

interface CleanupReport {
  totalRecords: number;
  duplicatesFound: number;
  duplicatesRemoved: number;
  errors: string[];
}

export function DuplicateCleanupPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [lastCleanup, setLastCleanup] = useState<CleanupReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await analyzeDuplicatesForUser(user.id);
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCleanup = async (dryRun: boolean = true) => {
    if (!user?.id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await cleanupDuplicatesForUser(user.id, dryRun);
      setLastCleanup(result);
      
      // Re-run analysis after cleanup to show updated numbers
      if (!dryRun) {
        const newAnalysis = await analyzeDuplicatesForUser(user.id);
        setAnalysis(newAnalysis);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cleanup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGlobalCleanup = async (dryRun: boolean = true) => {
    setLoading(true);
    setError(null);
    
    try {
      await cleanupAllUserDuplicates(dryRun);
      // Note: This doesn't update local state since it's for all users
      alert(`Global ${dryRun ? 'dry run' : 'cleanup'} completed. Check console for details.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Global cleanup failed');
    } finally {
      setLoading(false);
    }
  };

  if (!user?.id) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Duplicate Cleanup</CardTitle>
          <CardDescription>User must be logged in to run duplicate cleanup</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Duplicate Data Cleanup
          </CardTitle>
          <CardDescription>
            Analyze and clean up duplicate compensation records. Always run analysis first, then dry run before actual cleanup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={handleAnalyze} 
              disabled={loading}
              variant="outline"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Info className="h-4 w-4 mr-2" />}
              Analyze Duplicates
            </Button>
            
            <Button 
              onClick={() => handleCleanup(true)} 
              disabled={loading || !analysis}
              variant="outline"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Dry Run Cleanup
            </Button>
            
            <Button 
              onClick={() => handleCleanup(false)} 
              disabled={loading || !analysis || analysis.summary.duplicateRecords === 0}
              variant="destructive"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Actual Cleanup
            </Button>
          </div>

          {/* Admin-only global cleanup */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-2">Admin Functions</h4>
            <div className="flex gap-2">
              <Button 
                onClick={() => handleGlobalCleanup(true)} 
                disabled={loading}
                variant="outline"
                size="sm"
              >
                Global Dry Run
              </Button>
              
              <Button 
                onClick={() => handleGlobalCleanup(false)} 
                disabled={loading}
                variant="destructive"
                size="sm"
              >
                Global Cleanup
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {analysis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Analysis Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{analysis.summary.totalRecords}</div>
                <div className="text-sm text-muted-foreground">Total Records</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{analysis.summary.duplicateRecords}</div>
                <div className="text-sm text-muted-foreground">Duplicates</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{analysis.summary.duplicatePercentage}%</div>
                <div className="text-sm text-muted-foreground">Duplicate %</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {analysis.summary.totalRecords - analysis.summary.duplicateRecords}
                </div>
                <div className="text-sm text-muted-foreground">Clean Records</div>
              </div>
            </div>

            {Object.keys(analysis.summary.duplicatesByType).length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Duplicates by Type:</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(analysis.summary.duplicatesByType).map(([type, count]) => (
                    <Badge key={type} variant="outline">
                      {type}: {count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(analysis.summary.duplicatesByReason).length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Duplicates by Reason:</h4>
                <div className="space-y-1">
                  {Object.entries(analysis.summary.duplicatesByReason).map(([reason, count]) => (
                    <div key={reason} className="text-sm">
                      <Badge variant="secondary" className="mr-2">{count}</Badge>
                      {reason}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis.recommendations.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Recommendations:</h4>
                <ul className="space-y-1">
                  {analysis.recommendations.map((rec, index) => (
                    <li key={index} className="text-sm text-muted-foreground">
                      • {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastCleanup && (
        <Card>
          <CardHeader>
            <CardTitle>Last Cleanup Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <div className="text-xl font-bold">{lastCleanup.duplicatesFound}</div>
                <div className="text-sm text-muted-foreground">Found</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-green-600">{lastCleanup.duplicatesRemoved}</div>
                <div className="text-sm text-muted-foreground">Removed</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-red-600">{lastCleanup.errors.length}</div>
                <div className="text-sm text-muted-foreground">Errors</div>
              </div>
            </div>

            {lastCleanup.errors.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-red-600">Errors:</h4>
                <ul className="space-y-1">
                  {lastCleanup.errors.map((error, index) => (
                    <li key={index} className="text-sm text-red-600">
                      • {error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Usage Instructions:</strong>
          <ol className="list-decimal list-inside mt-2 space-y-1">
            <li>First, click &quot;Analyze Duplicates&quot; to see what duplicates exist</li>
            <li>Review the analysis results to understand the scope</li>
            <li>Click &quot;Dry Run Cleanup&quot; to see what would be removed (safe, no actual changes)</li>
            <li>If you&apos;re satisfied with the dry run results, click &quot;Actual Cleanup&quot; to remove duplicates</li>
            <li>Use &quot;Global&quot; functions only if you&apos;re an admin and want to cleanup all users</li>
          </ol>
        </AlertDescription>
      </Alert>
    </div>
  );
}