'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Loader2, 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  Info, 
  RefreshCw,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSecurePassword } from '@/hooks/usePassword';
import { DataIntegrityService, type IntegrityCheckResult } from '@/services/dataIntegrityService';

interface IntegrityMetrics {
  healthScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
}

export function DataIntegrityPanel() {
  const { user } = useAuth();
  const password = useSecurePassword();
  
  const [loading, setLoading] = useState(false);
  const [integrityResult, setIntegrityResult] = useState<IntegrityCheckResult | null>(null);
  const [metrics, setMetrics] = useState<IntegrityMetrics | null>(null);
  const [autoFixResult, setAutoFixResult] = useState<{ fixesApplied: number; issues: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleIntegrityCheck = async () => {
    if (!user?.id || !password) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const [checkResult, metricsResult] = await Promise.all([
        DataIntegrityService.performIntegrityCheck(user.id, password),
        DataIntegrityService.getIntegrityMetrics(user.id, password)
      ]);
      
      setIntegrityResult(checkResult);
      setMetrics(metricsResult);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Integrity check failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoFix = async (dryRun: boolean = true) => {
    if (!user?.id || !password) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await DataIntegrityService.autoFixIntegrityIssues(user.id, password, dryRun);
      setAutoFixResult(result);
      
      // Re-run integrity check after actual fixes
      if (!dryRun && result.success) {
        await handleIntegrityCheck();
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto-fix failed');
    } finally {
      setLoading(false);
    }
  };

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'high': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getRiskLevelIcon = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'medium': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'high': return <AlertCircle className="h-4 w-4 text-red-600" />;
      default: return <Info className="h-4 w-4" />;
    }
  };

  if (!user?.id || !password) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Data Integrity Monitoring
          </CardTitle>
          <CardDescription>User must be logged in with encryption key to run integrity checks</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            Data Integrity Monitoring
          </CardTitle>
          <CardDescription>
            Monitor and validate the integrity of your compensation data, including business rules and data consistency.
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
              onClick={handleIntegrityCheck} 
              disabled={loading}
              variant="outline"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Run Integrity Check
            </Button>
            
            <Button 
              onClick={() => handleAutoFix(true)} 
              disabled={loading || !integrityResult}
              variant="outline"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Preview Auto-Fix
            </Button>
            
            <Button 
              onClick={() => handleAutoFix(false)} 
              disabled={loading || !integrityResult || integrityResult.isValid}
              variant="destructive"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Apply Auto-Fix
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Health Score Card */}
      {metrics && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Data Health Score
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-2xl font-bold">{metrics.healthScore}/100</div>
                <div className="flex items-center gap-2">
                  {getRiskLevelIcon(metrics.riskLevel)}
                  <span className={`text-sm font-medium ${getRiskLevelColor(metrics.riskLevel)}`}>
                    {metrics.riskLevel.toUpperCase()} RISK
                  </span>
                </div>
              </div>
              <div className="w-32">
                <Progress value={metrics.healthScore} className="h-3" />
              </div>
            </div>

            {metrics.recommendations.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Recommendations:</h4>
                <ul className="space-y-1">
                  {metrics.recommendations.map((rec, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">•</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Integrity Check Results */}
      {integrityResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {integrityResult.isValid ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-500" />
              )}
              Integrity Check Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{integrityResult.summary.totalRecords}</div>
                <div className="text-sm text-muted-foreground">Total Records</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{integrityResult.summary.validRecords}</div>
                <div className="text-sm text-muted-foreground">Valid</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{integrityResult.summary.corruptedRecords}</div>
                <div className="text-sm text-muted-foreground">Corrupted</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{integrityResult.summary.duplicates}</div>
                <div className="text-sm text-muted-foreground">Duplicates</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{integrityResult.summary.businessRuleViolations}</div>
                <div className="text-sm text-muted-foreground">Rule Violations</div>
              </div>
            </div>

            {/* Error Details */}
            {integrityResult.details.corruptedRecords.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-red-600">Corrupted Records:</h4>
                <div className="space-y-1">
                  {integrityResult.details.corruptedRecords.map((record, index) => (
                    <div key={index} className="text-sm bg-red-50 p-2 rounded">
                      <Badge variant="destructive" className="mr-2">Record {record.id}</Badge>
                      {record.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Duplicate Details */}
            {integrityResult.details.duplicates.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-orange-600">Duplicate Records:</h4>
                <div className="space-y-1">
                  {integrityResult.details.duplicates.map((duplicate, index) => (
                    <div key={index} className="text-sm bg-orange-50 p-2 rounded">
                      <Badge variant="secondary" className="mr-2">Record {duplicate.id}</Badge>
                      Duplicate of record {duplicate.duplicateOf} - {duplicate.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Business Rule Violations */}
            {integrityResult.details.businessRuleViolations.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-yellow-600">Business Rule Violations:</h4>
                <div className="space-y-1">
                  {integrityResult.details.businessRuleViolations.map((violation, index) => (
                    <div key={index} className="text-sm bg-yellow-50 p-2 rounded">
                      <Badge variant="outline" className="mr-2">Record {violation.id}</Badge>
                      <Badge variant="outline" className="mr-2">{violation.rule}</Badge>
                      {violation.violation}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {integrityResult.warnings.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-yellow-600">Warnings:</h4>
                <ul className="space-y-1">
                  {integrityResult.warnings.map((warning, index) => (
                    <li key={index} className="text-sm text-yellow-600">
                      <AlertTriangle className="h-3 w-3 inline mr-1" />
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Auto-Fix Results */}
      {autoFixResult && (
        <Card>
          <CardHeader>
            <CardTitle>Auto-Fix Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center mb-4">
              <div className="text-xl font-bold">{autoFixResult.fixesApplied}</div>
              <div className="text-sm text-muted-foreground">Fixes Applied</div>
            </div>

            {autoFixResult.issues.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Issues Addressed:</h4>
                <ul className="space-y-1">
                  {autoFixResult.issues.map((issue, index) => (
                    <li key={index} className="text-sm text-muted-foreground">
                      <CheckCircle className="h-3 w-3 inline mr-1 text-green-500" />
                      {issue}
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
          <strong>Data Integrity Tools:</strong>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li><strong>Integrity Check:</strong> Validates data encryption, business rules, and consistency</li>
            <li><strong>Health Score:</strong> Overall data quality metric (0-100)</li>
            <li><strong>Auto-Fix:</strong> Automatically resolves common data issues safely</li>
            <li><strong>Preview Mode:</strong> Shows what would be fixed without making changes</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}