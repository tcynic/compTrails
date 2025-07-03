'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
import { useAuth } from '@/contexts/AuthContext';
import { LocalStorageService } from '@/services/localStorageService';
import { EncryptionService } from '@/services/encryptionService';
import { ExportDialog } from '../export';
import type { 
  DecryptedSalaryData, 
  DecryptedBonusData, 
  DecryptedEquityData 
} from '@/lib/db/types';
import { format } from 'date-fns';

interface DecryptedRecord {
  id: number;
  type: 'salary' | 'bonus' | 'equity';
  data: DecryptedSalaryData | DecryptedBonusData | DecryptedEquityData;
  createdAt: number;
  currency: string;
}

export function DashboardOverview() {
  const [allRecords, setAllRecords] = useState<DecryptedRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  const loadAllCompensationData = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const userPassword = 'default-password'; // TODO: Get from secure context
      
      // Load all compensation types
      const [salaries, bonuses, equity] = await Promise.all([
        LocalStorageService.getCompensationRecords(user.id, 'salary'),
        LocalStorageService.getCompensationRecords(user.id, 'bonus'),
        LocalStorageService.getCompensationRecords(user.id, 'equity'),
      ]);

      // Decrypt all records
      const decryptedRecords: DecryptedRecord[] = [];
      
      for (const record of [...salaries, ...bonuses, ...equity]) {
        try {
          const decryptionResult = await EncryptionService.decryptData(record.encryptedData, userPassword);
          if (decryptionResult.success) {
            const data = JSON.parse(decryptionResult.data);
            decryptedRecords.push({
              id: record.id!,
              type: record.type,
              data,
              createdAt: record.createdAt,
              currency: record.currency,
            });
          }
        } catch (error) {
          console.error('Failed to decrypt record:', error);
        }
      }

      // Sort by creation date (newest first)
      decryptedRecords.sort((a, b) => b.createdAt - a.createdAt);
      setAllRecords(decryptedRecords);
    } catch (error) {
      console.error('Error loading compensation data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAllCompensationData();
  }, [loadAllCompensationData]);

  // Calculate current salary
  const currentSalary = useMemo(() => {
    const salaryRecords = allRecords
      .filter(r => r.type === 'salary')
      .map(r => r.data as DecryptedSalaryData)
      .filter(s => s.isCurrentPosition);
    
    return salaryRecords.length > 0 ? salaryRecords[0] : null;
  }, [allRecords]);

  // Calculate YTD bonuses
  const ytdBonuses = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const bonusRecords = allRecords
      .filter(r => r.type === 'bonus')
      .map(r => r.data as DecryptedBonusData)
      .filter(b => new Date(b.date).getFullYear() === currentYear);

    const totalsByCurrency = bonusRecords.reduce((acc, bonus) => {
      if (!acc[bonus.currency]) acc[bonus.currency] = 0;
      acc[bonus.currency] += bonus.amount;
      return acc;
    }, {} as Record<string, number>);

    return {
      count: bonusRecords.length,
      totalsByCurrency: totalsByCurrency,
      records: bonusRecords,
    };
  }, [allRecords]);

  // Calculate equity summary
  const equitySummary = useMemo(() => {
    const equityRecords = allRecords
      .filter(r => r.type === 'equity')
      .map(r => r.data as DecryptedEquityData);

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
  }, [allRecords]);

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

  // Recent activity (last 5 records)
  const recentActivity = useMemo(() => {
    return allRecords.slice(0, 5);
  }, [allRecords]);

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const getRecordDisplayInfo = (record: DecryptedRecord) => {
    switch (record.type) {
      case 'salary':
        const salary = record.data as DecryptedSalaryData;
        return {
          title: `${salary.title} at ${salary.company}`,
          amount: formatCurrency(salary.amount, salary.currency),
          type: 'Salary',
        };
      case 'bonus':
        const bonus = record.data as DecryptedBonusData;
        return {
          title: `${bonus.type} bonus from ${bonus.company}`,
          amount: formatCurrency(bonus.amount, bonus.currency),
          type: 'Bonus',
        };
      case 'equity':
        const equity = record.data as DecryptedEquityData;
        return {
          title: `${equity.shares.toLocaleString()} ${equity.type} shares from ${equity.company}`,
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

      {/* Export Dialog */}
      <ExportDialog 
        isOpen={showExportDialog} 
        onClose={() => setShowExportDialog(false)} 
      />
    </div>
  );
}