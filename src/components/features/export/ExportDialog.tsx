'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormItem, FormControl } from '@/components/ui/form-field';
import { FormLabel } from '@/components/ui/form-label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, Database, Calendar, Filter } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { LocalStorageService } from '@/services/localStorageService';
import { EncryptionService } from '@/services/encryptionService';
import { CSVExporter, JSONExporter, exportUtils } from '@/utils/exporters';
import type { ExportRecord } from '@/utils/exporters';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedType?: 'salary' | 'bonus' | 'equity' | 'all';
}

type ExportFormat = 'csv' | 'json';
type DataType = 'all' | 'salary' | 'bonus' | 'equity';
type DateRange = 'all' | 'ytd' | 'last12months' | 'custom';

export function ExportDialog({ isOpen, onClose, preselectedType = 'all' }: ExportDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [allRecords, setAllRecords] = useState<ExportRecord[]>([]);
  
  // Export settings
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [dataType, setDataType] = useState<DataType>(preselectedType);
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  
  const { user } = useAuth();

  // Load all compensation data
  useEffect(() => {
    if (!isOpen || !user) return;
    
    const loadData = async () => {
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
        const decryptedRecords: ExportRecord[] = [];
        
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
    };

    loadData();
  }, [isOpen, user]);

  // Set default custom date range
  useEffect(() => {
    if (dateRange === 'custom' && !customStartDate && !customEndDate) {
      const now = new Date();
      const startOfThisMonth = startOfMonth(now);
      const startOfLastYear = startOfMonth(subMonths(now, 12));
      
      setCustomStartDate(format(startOfLastYear, 'yyyy-MM-dd'));
      setCustomEndDate(format(startOfThisMonth, 'yyyy-MM-dd'));
    }
  }, [dateRange, customStartDate, customEndDate]);

  // Filter records based on settings
  const filteredRecords = useMemo(() => {
    let filtered = allRecords;

    // Filter by data type
    if (dataType !== 'all') {
      filtered = filtered.filter(record => record.type === dataType);
    }

    // Filter by date range
    const now = new Date();
    switch (dateRange) {
      case 'ytd':
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        filtered = filtered.filter(record => record.createdAt >= startOfYear.getTime());
        break;
      case 'last12months':
        const twelveMonthsAgo = subMonths(now, 12);
        filtered = filtered.filter(record => record.createdAt >= twelveMonthsAgo.getTime());
        break;
      case 'custom':
        if (customStartDate && customEndDate) {
          const startTime = new Date(customStartDate).getTime();
          const endTime = endOfMonth(new Date(customEndDate)).getTime();
          filtered = filtered.filter(record => 
            record.createdAt >= startTime && record.createdAt <= endTime
          );
        }
        break;
    }

    return filtered;
  }, [allRecords, dataType, dateRange, customStartDate, customEndDate]);

  // Get available columns for CSV export
  const availableColumns = useMemo(() => {
    if (exportFormat !== 'csv') return [];
    
    const recordType = dataType === 'all' ? undefined : dataType;
    return CSVExporter.getAvailableColumns(recordType);
  }, [exportFormat, dataType]);

  // Set default selected columns when format or data type changes
  useEffect(() => {
    if (exportFormat === 'csv' && availableColumns.length > 0) {
      setSelectedColumns(availableColumns);
    }
  }, [exportFormat, availableColumns]);

  const handleExport = async () => {
    if (filteredRecords.length === 0) return;

    setIsExporting(true);
    try {
      const filename = exportUtils.generateFilename(
        `compensation-${dataType}`,
        exportFormat
      );

      if (exportFormat === 'csv') {
        CSVExporter.downloadCSV(filteredRecords, filename, {
          includeColumns: selectedColumns.length > 0 ? selectedColumns : undefined,
          dateFormat: 'iso',
          currencyFormat: 'code',
        });
      } else {
        JSONExporter.downloadJSON(filteredRecords, filename, {
          includeMetadata: true,
          prettifyOutput: true,
          includeSchema: true,
        });
      }

      onClose();
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleColumnToggle = (column: string) => {
    setSelectedColumns(prev => 
      prev.includes(column)
        ? prev.filter(c => c !== column)
        : [...prev, column]
    );
  };

  const formatSupportedFormats = exportUtils.getSupportedFormats();
  const estimatedSize = exportUtils.estimateExportSize(filteredRecords.length, exportFormat);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Compensation Data
          </DialogTitle>
          <DialogDescription>
            Export your compensation data in various formats with filtering and preview options.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Export Format Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormItem>
              <FormLabel>Export Format</FormLabel>
              <Select value={exportFormat} onValueChange={(value: ExportFormat) => setExportFormat(value)}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {formatSupportedFormats.map(format => (
                    <SelectItem key={format.value} value={format.value}>
                      <div className="flex items-center gap-2">
                        {format.value === 'csv' ? <FileText className="h-4 w-4" /> : <Database className="h-4 w-4" />}
                        <div>
                          <div>{format.label}</div>
                          <div className="text-xs text-gray-500">{format.description}</div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>

            <FormItem>
              <FormLabel>Data Type</FormLabel>
              <Select value={dataType} onValueChange={(value: DataType) => setDataType(value)}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="all">All Data Types</SelectItem>
                  <SelectItem value="salary">Salaries Only</SelectItem>
                  <SelectItem value="bonus">Bonuses Only</SelectItem>
                  <SelectItem value="equity">Equity Only</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          </div>

          {/* Date Range Selection */}
          <div className="space-y-4">
            <FormLabel className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Date Range
            </FormLabel>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { value: 'all', label: 'All Time' },
                { value: 'ytd', label: 'Year to Date' },
                { value: 'last12months', label: 'Last 12 Months' },
                { value: 'custom', label: 'Custom Range' },
              ].map(option => (
                <Button
                  key={option.value}
                  variant={dateRange === option.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDateRange(option.value as DateRange)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            
            {dateRange === 'custom' && (
              <div className="grid grid-cols-2 gap-4">
                <FormItem>
                  <FormLabel>Start Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.currentTarget!.value)}
                    />
                  </FormControl>
                </FormItem>
                <FormItem>
                  <FormLabel>End Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.currentTarget!.value)}
                    />
                  </FormControl>
                </FormItem>
              </div>
            )}
          </div>

          {/* Column Selection for CSV */}
          {exportFormat === 'csv' && availableColumns.length > 0 && (
            <div className="space-y-4">
              <FormLabel className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Columns to Include
              </FormLabel>
              <div className="flex gap-2 mb-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedColumns(availableColumns)}
                >
                  Select All
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedColumns([])}
                >
                  Select None
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {availableColumns.map(column => (
                  <label key={column} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedColumns.includes(column)}
                      onChange={() => handleColumnToggle(column)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm">{column}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Export Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Export Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-sm text-gray-500 mt-2">Loading data...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{filteredRecords.length}</div>
                      <div className="text-sm text-gray-500">Records</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{estimatedSize}</div>
                      <div className="text-sm text-gray-500">Est. Size</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{exportFormat.toUpperCase()}</div>
                      <div className="text-sm text-gray-500">Format</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">
                        {new Set(filteredRecords.map(r => r.currency)).size}
                      </div>
                      <div className="text-sm text-gray-500">Currencies</div>
                    </div>
                  </div>

                  {/* Data type breakdown */}
                  <div className="flex gap-2">
                    {['salary', 'bonus', 'equity'].map(type => {
                      const count = filteredRecords.filter(r => r.type === type).length;
                      if (count === 0) return null;
                      return (
                        <Badge key={type} variant="secondary">
                          {count} {type}{count > 1 ? (type === 'equity' ? ' grants' : 'es') : ''}
                        </Badge>
                      );
                    })}
                  </div>

                  {filteredRecords.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <p>No records match the selected criteria.</p>
                      <p className="text-sm">Try adjusting your filters.</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={filteredRecords.length === 0 || isExporting || isLoading}
          >
            {isExporting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export Data
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}