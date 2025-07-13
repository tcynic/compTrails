'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Search, Filter } from 'lucide-react';
import { usePageLoadingState } from '@/hooks/useGlobalLoadingState';
import { HistoryLoadingScreen } from '@/components/ui/HistoryLoadingScreen';
import { AddBonusForm } from './AddBonusForm';
import { bonusTypeOptions } from '@/lib/validations/bonus';
import { format } from 'date-fns';
import type { DecryptedBonusData } from '@/lib/db/types';

export function BonusList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Use page loading state that respects global loading
  const {
    data: bonuses,
    showGlobalLoading,
    showIndividualLoading,
    refetch
  } = usePageLoadingState('bonus');


  const filteredBonuses = useMemo(() => {
    return bonuses.filter(bonus => {
      // Type assertion since we know these are bonus records from useBonusData
      const bonusData = bonus.decryptedData as DecryptedBonusData;
      const matchesSearch = searchTerm === '' || 
        bonusData.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bonusData.description.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = filterType === 'all' || bonusData.type === filterType;
      
      return matchesSearch && matchesType;
    });
  }, [bonuses, searchTerm, filterType]);

  const bonusesByYear = useMemo(() => {
    const grouped = filteredBonuses.reduce((acc, bonus) => {
      const bonusData = bonus.decryptedData as DecryptedBonusData;
      const year = new Date(bonusData.date).getFullYear();
      if (!acc[year]) acc[year] = [];
      acc[year].push(bonus);
      return acc;
    }, {} as Record<number, typeof filteredBonuses>);

    // Sort each year's bonuses by date (newest first)
    Object.keys(grouped).forEach(year => {
      grouped[Number(year)].sort((a, b) => {
        const aData = a.decryptedData as DecryptedBonusData;
        const bData = b.decryptedData as DecryptedBonusData;
        return new Date(bData.date).getTime() - new Date(aData.date).getTime();
      });
    });

    return grouped;
  }, [filteredBonuses]);

  const yearlyTotals = useMemo(() => {
    const totals: Record<number, Record<string, number>> = {};
    
    Object.entries(bonusesByYear).forEach(([year, yearBonuses]) => {
      totals[Number(year)] = {};
      
      yearBonuses.forEach(bonus => {
        const bonusData = bonus.decryptedData as DecryptedBonusData;
        const currency = bonusData.currency;
        if (!totals[Number(year)][currency]) {
          totals[Number(year)][currency] = 0;
        }
        totals[Number(year)][currency] += bonusData.amount;
      });
    });
    
    return totals;
  }, [bonusesByYear]);

  const currentYear = new Date().getFullYear();
  const ytdTotal = yearlyTotals[currentYear] || {};

  const getBonusTypeBadgeColor = (type: string) => {
    const colors = {
      performance: 'bg-green-100 text-green-800',
      signing: 'bg-blue-100 text-blue-800',
      retention: 'bg-purple-100 text-purple-800',
      spot: 'bg-yellow-100 text-yellow-800',
      annual: 'bg-orange-100 text-orange-800',
      other: 'bg-gray-100 text-gray-800',
    };
    return colors[type as keyof typeof colors] || colors.other;
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  // Show global loading screen for initial load
  if (showGlobalLoading) {
    return (
      <HistoryLoadingScreen
        message="Loading your bonus history..."
        stage="decrypting"
      />
    );
  }

  // Show individual loading for refreshes
  if (showIndividualLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Bonuses</h2>
          <Button disabled>
            <Plus className="h-4 w-4 mr-2" />
            Add Bonus
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
        <h2 className="text-2xl font-bold">Bonuses</h2>
        <Button onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Bonus
        </Button>
      </div>

      {/* YTD Summary */}
      {Object.keys(ytdTotal).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Year-to-Date {currentYear} Bonuses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {Object.entries(ytdTotal).map(([currency, total]) => (
                <div key={currency} className="text-2xl font-bold text-green-600">
                  {formatCurrency(total, currency)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search bonuses..."
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
              {bonusTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bonuses by Year */}
      {Object.keys(bonusesByYear).length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-gray-500">No bonuses found. Add your first bonus to get started!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {Object.entries(bonusesByYear)
            .sort(([a], [b]) => Number(b) - Number(a)) // Sort years descending
            .map(([year, yearBonuses]) => (
              <div key={year} className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-semibold">{year}</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(yearlyTotals[Number(year)] || {}).map(([currency, total]) => (
                      <div key={currency} className="text-lg font-medium text-green-600">
                        {formatCurrency(total, currency)}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {yearBonuses.map((bonus) => {
                    const bonusData = bonus.decryptedData as DecryptedBonusData;
                    return (
                      <Card key={bonus.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-lg">{bonusData.company}</CardTitle>
                              <p className="text-sm text-gray-500">
                                {format(new Date(bonusData.date), 'MMM dd, yyyy')}
                              </p>
                            </div>
                            <Badge className={getBonusTypeBadgeColor(bonusData.type)}>
                              {bonusTypeOptions.find(opt => opt.value === bonusData.type)?.label}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            <div className="text-2xl font-bold text-green-600">
                              {formatCurrency(bonusData.amount, bonusData.currency)}
                            </div>
                            <p className="text-sm text-gray-600">{bonusData.description}</p>
                            {bonusData.payrollDate && (
                              <p className="text-xs text-gray-500">
                                Payroll: {format(new Date(bonusData.payrollDate), 'MMM dd, yyyy')}
                              </p>
                            )}
                            {bonusData.notes && (
                              <p className="text-xs text-gray-500">{bonusData.notes}</p>
                            )}
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

      <AddBonusForm
        isOpen={showAddForm}
        onClose={() => setShowAddForm(false)}
        onSuccess={refetch}
      />
    </div>
  );
}