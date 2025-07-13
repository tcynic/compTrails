'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Search, Filter, Calendar, TrendingUp } from 'lucide-react';
import { useOptimizedPageState } from '@/hooks/useOptimizedPageState';
import type { EquitySummary } from '@/hooks/useCompensationSummaries';
import { HistoryLoadingScreen } from '@/components/ui/HistoryLoadingScreen';
import { AddEquityForm } from './AddEquityForm';
import { equityTypeOptions } from '@/lib/validations/equity';
import { format, differenceInMonths, addMonths } from 'date-fns';

export function EquityList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Use optimized page state with smart loading
  const {
    data: equityGrantsData,
    showLoadingScreen,
    showSkeleton,
    refetch
  } = useOptimizedPageState('equity');
  
  // Cast to specific equity type since we know this hook filters for equity records
  const equityGrants = equityGrantsData as EquitySummary[];


  const filteredEquityGrants = useMemo(() => {
    return equityGrants.filter(grant => {
      // Work directly with summary data
      const matchesSearch = searchTerm === '' || 
        grant.company.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = filterType === 'all' || grant.equityType === filterType;
      
      return matchesSearch && matchesType;
    });
  }, [equityGrants, searchTerm, filterType]);

  const equityGrantsByCompany = useMemo(() => {
    const grouped = filteredEquityGrants.reduce((acc, grant) => {
      const company = grant.company;
      if (!acc[company]) acc[company] = [];
      acc[company].push(grant);
      return acc;
    }, {} as Record<string, typeof filteredEquityGrants>);

    // Sort each company's grants by grant date (newest first)
    Object.keys(grouped).forEach(company => {
      grouped[company].sort((a, b) => {
        return new Date(b.grantDate).getTime() - new Date(a.grantDate).getTime();
      });
    });

    return grouped;
  }, [filteredEquityGrants]);

  const calculateVestingProgress = useCallback((grant: EquitySummary) => {
    const now = new Date();
    const vestingStart = new Date(grant.vestingStart);
    
    // If vesting hasn't started yet
    if (now < vestingStart) {
      return {
        vestedShares: 0,
        unvestedShares: grant.shares,
        progressPercentage: 0,
        nextVestingDate: vestingStart,
        isFullyVested: false,
      };
    }

    // Calculate total vested shares using simplified linear vesting
    const monthsVested = differenceInMonths(now, vestingStart);
    const totalVestingPeriod = grant.vestingPeriod;
    
    if (monthsVested >= totalVestingPeriod) {
      return {
        vestedShares: grant.shares,
        unvestedShares: 0,
        progressPercentage: 100,
        nextVestingDate: null,
        isFullyVested: true,
      };
    }

    // Simple linear vesting calculation (monthly basis)
    const progressRatio = monthsVested / totalVestingPeriod;
    const vestedShares = Math.floor(grant.shares * progressRatio);
    
    // Calculate next vesting date (assume monthly for summary view)
    const nextVestingDate = addMonths(vestingStart, monthsVested + 1);
    
    return {
      vestedShares,
      unvestedShares: grant.shares - vestedShares,
      progressPercentage: Math.floor(progressRatio * 100),
      nextVestingDate: monthsVested + 1 < totalVestingPeriod ? nextVestingDate : null,
      isFullyVested: false,
    };
  }, []);

  const getEquityTypeBadgeColor = (type: string) => {
    const colors = {
      ISO: 'bg-blue-100 text-blue-800',
      NSO: 'bg-green-100 text-green-800',
      RSU: 'bg-purple-100 text-purple-800',
      ESPP: 'bg-yellow-100 text-yellow-800',
      other: 'bg-gray-100 text-gray-800',
    };
    return colors[type as keyof typeof colors] || colors.other;
  };

  const totalSummary = useMemo(() => {
    return filteredEquityGrants.reduce((acc, grant) => {
      const vesting = calculateVestingProgress(grant);
      acc.totalShares += grant.shares;
      acc.vestedShares += vesting.vestedShares;
      acc.unvestedShares += vesting.unvestedShares;
      return acc;
    }, { totalShares: 0, vestedShares: 0, unvestedShares: 0 });
  }, [filteredEquityGrants, calculateVestingProgress]);

  // Show global loading screen for initial load
  if (showLoadingScreen) {
    return (
      <HistoryLoadingScreen
        message="Loading your equity grants..."
        stage="decrypting"
      />
    );
  }

  // Show individual loading for refreshes
  if (showSkeleton) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Equity Grants</h2>
          <Button disabled>
            <Plus className="h-4 w-4 mr-2" />
            Add Equity Grant
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-full"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Equity Grants</h2>
        <Button onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Equity Grant
        </Button>
      </div>

      {/* Summary Cards */}
      {totalSummary.totalShares > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Shares</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSummary.totalShares.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Vested Shares</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{totalSummary.vestedShares.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Unvested Shares</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{totalSummary.unvestedShares.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search equity grants..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.currentTarget!.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {equityTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Equity Grants by Company */}
      {Object.keys(equityGrantsByCompany).length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-gray-500">No equity grants found. Add your first equity grant to get started!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {Object.entries(equityGrantsByCompany).map(([company, companyGrants]) => (
            <div key={company} className="space-y-4">
              <h3 className="text-xl font-semibold">{company}</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {companyGrants.map((grant) => {
                  const vesting = calculateVestingProgress(grant);
                  return (
                    <Card key={grant.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              <TrendingUp className="h-5 w-5" />
                              {grant.shares.toLocaleString()} shares
                            </CardTitle>
                            <p className="text-sm text-gray-500">
                              Granted {format(new Date(grant.grantDate), 'MMM dd, yyyy')}
                            </p>
                          </div>
                          <Badge className={getEquityTypeBadgeColor(grant.equityType)}>
                            {grant.equityType}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {/* Vesting Progress */}
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>Vesting Progress</span>
                              <span>{vesting.progressPercentage}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${vesting.progressPercentage}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                              <span>Vested: {vesting.vestedShares.toLocaleString()}</span>
                              <span>Unvested: {vesting.unvestedShares.toLocaleString()}</span>
                            </div>
                          </div>

                          {/* Vesting Details */}
                          <div className="text-sm space-y-1">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Vesting Start:</span>
                              <span>{format(new Date(grant.vestingStart), 'MMM dd, yyyy')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Vesting Period:</span>
                              <span>{grant.vestingPeriod} months</span>
                            </div>
                          </div>

                          {/* Strike Price */}
                          {grant.strikePrice && (
                            <div className="text-sm">
                              <span className="text-gray-600">Strike Price: </span>
                              <span className="font-medium">${grant.strikePrice}</span>
                            </div>
                          )}

                          {/* Next Vesting Date */}
                          {vesting.nextVestingDate && (
                            <div className="flex items-center gap-1 text-sm text-blue-600">
                              <Calendar className="h-4 w-4" />
                              <span>Next vesting: {format(vesting.nextVestingDate, 'MMM dd, yyyy')}</span>
                            </div>
                          )}

                          {/* Fully Vested Badge */}
                          {vesting.isFullyVested && (
                            <Badge className="bg-green-100 text-green-800">
                              Fully Vested
                            </Badge>
                          )}

                          {/* Notes not available in summary data - would need full record */}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddEquityForm
        isOpen={showAddForm}
        onClose={() => setShowAddForm(false)}
        onSuccess={refetch}
      />
    </div>
  );
}