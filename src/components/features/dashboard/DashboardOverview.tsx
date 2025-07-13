'use client';

import { useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { SummaryCard } from './SummaryCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DollarSign, 
  TrendingUp, 
  Gift, 
  Building2, 
  Plus,
  Activity,
  Download
} from 'lucide-react';
import { useCompensationSummaries, SummaryUtils, type SalarySummary, type BonusSummary, type EquitySummary } from '@/hooks/useCompensationSummaries';
import { useAnalytics } from '@/hooks/useAnalytics';
import { HistoryLoadingScreen } from '@/components/ui/HistoryLoadingScreen';
import { CacheMonitor } from '@/components/features/cache/CacheMonitor';
import { useState } from 'react';

// Lazy load the export dialog since it's not used immediately
const ExportDialog = dynamic(() => import('../export').then(mod => ({ default: mod.ExportDialog })), {
  loading: () => null,
});
import { format } from 'date-fns';

export function DashboardOverview() {
  const [showExportDialog, setShowExportDialog] = useState(false);
  const { trackPageView } = useAnalytics();
  const router = useRouter();

  // OPTIMIZED SUMMARIES: Use summary hook for faster dashboard loading
  const { summaries, loading: isLoading, error } = useCompensationSummaries();

  // Track page view once on mount
  useEffect(() => {
    trackPageView('dashboard_overview');
  }, [trackPageView]);

  // Calculate current salary using optimized summaries
  const currentSalary = useMemo(() => {
    return SummaryUtils.getCurrentSalary(summaries);
  }, [summaries]);

  // Calculate YTD bonuses using optimized summaries
  const ytdBonuses = useMemo(() => {
    const bonusRecords = SummaryUtils.getYTDBonuses(summaries);
    const totalsByCurrency = SummaryUtils.calculateBonusTotals(bonusRecords);

    return {
      count: bonusRecords.length,
      totalsByCurrency: totalsByCurrency,
      records: bonusRecords,
    };
  }, [summaries]);

  // Calculate equity summary using optimized summaries
  const equitySummary = useMemo(() => {
    const equityRecords = SummaryUtils.getEquitySummaries(summaries);

    const summary = equityRecords.reduce((acc, equity) => {
      acc.totalShares += equity.shares;
      
      // Simple vesting calculation (this could be more sophisticated)
      const now = new Date();
      const vestingStart = new Date(equity.vestingStart);
      const vestingEnd = new Date(vestingStart);
      vestingEnd.setMonth(vestingEnd.getMonth() + equity.vestingPeriod);
      
      if (now >= vestingEnd) {
        acc.vestedShares += equity.shares;
      } else if (now >= vestingStart) {
        const totalPeriod = equity.vestingPeriod;
        const elapsedMonths = Math.floor((now.getTime() - vestingStart.getTime()) / (1000 * 60 * 60 * 24 * 30));
        const vestedPortion = Math.min(elapsedMonths / totalPeriod, 1);
        acc.vestedShares += Math.floor(equity.shares * vestedPortion);
      }
      
      return acc;
    }, { totalShares: 0, vestedShares: 0 });

    return {
      ...summary,
      unvestedShares: summary.totalShares - summary.vestedShares,
      count: equityRecords.length,
    };
  }, [summaries]);

  // Calculate total compensation (simplified)
  const totalCompensation = useMemo(() => {
    let total = 0;
    const currency = currentSalary?.currency || 'USD';
    
    // Add current salary
    if (currentSalary) {
      total += currentSalary.amount;
    }
    
    // Add YTD bonuses (assuming same currency for simplicity)
    const ytdTotal = ytdBonuses.totalsByCurrency[currency] || 0;
    total += ytdTotal;
    
    // For equity, we'd need market price data, so we'll just show share count for now
    
    return {
      amount: total,
      currency,
      hasEquity: equitySummary.totalShares > 0,
    };
  }, [currentSalary, ytdBonuses, equitySummary]);

  // Recent activity (last 5 records) using optimized summaries
  const recentActivity = useMemo(() => {
    return summaries.slice(0, 5);
  }, [summaries]);

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const getRecordDisplayInfo = (record: typeof summaries[0]) => {
    switch (record.type) {
      case 'salary':
        const salary = record as SalarySummary;
        return {
          title: `${salary.title} at ${salary.company}`,
          amount: formatCurrency(salary.amount, salary.currency),
          type: 'Salary',
        };
      case 'bonus':
        const bonus = record as BonusSummary;
        return {
          title: `${bonus.bonusType} bonus from ${bonus.company}`,
          amount: formatCurrency(bonus.amount, bonus.currency),
          type: 'Bonus',
        };
      case 'equity':
        const equity = record as EquitySummary;
        return {
          title: `${equity.shares.toLocaleString()} ${equity.equityType} shares from ${equity.company}`,
          amount: `${equity.shares.toLocaleString()} shares`,
          type: 'Equity',
        };
      default:
        return {
          title: 'Unknown',
          amount: '',
          type: 'Unknown',
        };
    }
  };

  // Show loading screen for initial data load
  if (isLoading) {
    return (
      <HistoryLoadingScreen
        message="Loading your compensation summary..."
        stage="decrypting"
      />
    );
  }

  // Show error state if there's an error
  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 mb-4">Failed to load compensation data</div>
        <div className="text-sm text-gray-500">{error}</div>
      </div>
    );
  }

  // Show welcome screen for first-time users
  if (summaries.length === 0) {
    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center py-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Welcome to Total Compensation Tracker</h1>
          <p className="text-xl text-gray-600 mb-8">
            Start building your complete compensation history
          </p>
          <div className="flex justify-center gap-4">
            <Button size="lg" onClick={() => router.push('/dashboard/salary')}>
              <Plus className="h-5 w-5 mr-2" />
              Add Your First Salary
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-600">Your compensation overview</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => router.push('/dashboard/salary')}>
            <Plus className="h-4 w-4 mr-1" />
            Add Salary
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push('/dashboard/bonuses')}>
            <Plus className="h-4 w-4 mr-1" />
            Add Bonus
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push('/dashboard/equity')}>
            <Plus className="h-4 w-4 mr-1" />
            Add Equity
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowExportDialog(true)}>
            <Download className="h-4 w-4 mr-1" />
            Export Data
          </Button>
        </div>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Compensation */}
        <SummaryCard
          title="Total Compensation"
          value={totalCompensation.amount > 0 ? formatCurrency(totalCompensation.amount, totalCompensation.currency) : 'N/A'}
          subtitle={totalCompensation.hasEquity ? 'Plus equity grants' : 'Annual base + YTD bonuses'}
          icon={<DollarSign className="h-5 w-5" />}
          isLoading={isLoading}
          isEmpty={totalCompensation.amount === 0 && !isLoading}
          emptyMessage="Add your first compensation data"
          action={totalCompensation.amount === 0 ? {
            label: 'Add Salary',
            onClick: () => router.push('/dashboard/salary'),
          } : undefined}
        />

        {/* Current Salary */}
        <SummaryCard
          title="Current Salary"
          value={currentSalary ? formatCurrency(currentSalary.amount, currentSalary.currency) : 'N/A'}
          subtitle={currentSalary ? `${currentSalary.title} at ${currentSalary.company}` : undefined}
          icon={<Building2 className="h-5 w-5" />}
          isLoading={isLoading}
          isEmpty={!currentSalary && !isLoading}
          emptyMessage="No current salary on file"
          action={!currentSalary ? {
            label: 'Add Salary',
            onClick: () => router.push('/dashboard/salary'),
          } : undefined}
        />

        {/* YTD Bonuses */}
        <SummaryCard
          title="YTD Bonuses"
          value={Object.keys(ytdBonuses.totalsByCurrency).length > 0 
            ? Object.entries(ytdBonuses.totalsByCurrency)
                .map(([currency, amount]) => formatCurrency(amount, currency))
                .join(', ')
            : 'N/A'
          }
          subtitle={ytdBonuses.count > 0 ? `${ytdBonuses.count} bonus${ytdBonuses.count > 1 ? 'es' : ''} this year` : undefined}
          icon={<Gift className="h-5 w-5" />}
          isLoading={isLoading}
          isEmpty={ytdBonuses.count === 0 && !isLoading}
          emptyMessage="No bonuses this year"
          action={ytdBonuses.count === 0 ? {
            label: 'Add Bonus',
            onClick: () => router.push('/dashboard/bonuses'),
          } : undefined}
        />

        {/* Equity Summary */}
        <SummaryCard
          title="Equity Portfolio"
          value={equitySummary.totalShares > 0 ? `${equitySummary.totalShares.toLocaleString()} shares` : 'N/A'}
          subtitle={equitySummary.totalShares > 0 
            ? `${equitySummary.vestedShares.toLocaleString()} vested, ${equitySummary.unvestedShares.toLocaleString()} unvested`
            : undefined
          }
          icon={<TrendingUp className="h-5 w-5" />}
          isLoading={isLoading}
          isEmpty={equitySummary.count === 0 && !isLoading}
          emptyMessage="No equity grants on file"
          action={equitySummary.count === 0 ? {
            label: 'Add Equity',
            onClick: () => router.push('/dashboard/equity'),
          } : undefined}
        />
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex justify-between items-center animate-pulse">
                  <div className="space-y-1">
                    <div className="h-4 bg-gray-200 rounded w-48"></div>
                    <div className="h-3 bg-gray-200 rounded w-24"></div>
                  </div>
                  <div className="h-6 bg-gray-200 rounded w-16"></div>
                </div>
              ))}
            </div>
          ) : recentActivity.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No recent activity. Start by adding your compensation data!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentActivity.map((record) => {
                const info = getRecordDisplayInfo(record);
                return (
                  <div key={record.id} className="flex justify-between items-center">
                    <div className="space-y-1">
                      <p className="font-medium">{info.title}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{info.type}</Badge>
                        <span className="text-sm text-gray-500">
                          {format(new Date(record.createdAt), 'MMM dd, yyyy')}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{info.amount}</p>
                    </div>
                  </div>
                );
              })}
              {recentActivity.length >= 5 && (
                <div className="text-center pt-4">
                  <Button variant="outline" size="sm">
                    View All Activity
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cache Performance Monitor (Development Only) */}
      <CacheMonitor />

      {/* Export Dialog */}
      <ExportDialog 
        isOpen={showExportDialog} 
        onClose={() => setShowExportDialog(false)} 
      />
    </div>
  );
}