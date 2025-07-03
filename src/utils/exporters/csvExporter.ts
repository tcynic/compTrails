import type { DecryptedSalaryData, DecryptedBonusData, DecryptedEquityData } from '@/lib/db/types';

export interface ExportRecord {
  id: number;
  type: 'salary' | 'bonus' | 'equity';
  data: DecryptedSalaryData | DecryptedBonusData | DecryptedEquityData;
  createdAt: number;
  currency: string;
}

export interface CSVExportOptions {
  includeColumns?: string[];
  dateFormat?: 'iso' | 'us' | 'eu';
  currencyFormat?: 'symbol' | 'code';
}

interface FlattenedRecord {
  [key: string]: string | number | boolean | null;
}

export class CSVExporter {
  private static defaultColumns = {
    salary: [
      'type',
      'company',
      'title',
      'location',
      'amount',
      'currency',
      'startDate',
      'endDate',
      'isCurrentPosition',
      'notes',
      'createdAt'
    ],
    bonus: [
      'type',
      'company',
      'bonusType',
      'amount',
      'currency',
      'date',
      'payrollDate',
      'description',
      'notes',
      'createdAt'
    ],
    equity: [
      'type',
      'company',
      'equityType',
      'shares',
      'strikePrice',
      'grantDate',
      'vestingStart',
      'vestingCliff',
      'vestingPeriod',
      'vestingFrequency',
      'notes',
      'createdAt'
    ]
  };

  static getAvailableColumns(recordType?: 'salary' | 'bonus' | 'equity'): string[] {
    if (recordType) {
      return this.defaultColumns[recordType];
    }
    
    // Return all unique columns across all types
    const allColumns = new Set<string>();
    Object.values(this.defaultColumns).forEach(columns => {
      columns.forEach(col => allColumns.add(col));
    });
    return Array.from(allColumns);
  }

  static export(
    records: ExportRecord[],
    options: CSVExportOptions = {}
  ): string {
    if (records.length === 0) {
      return '';
    }

    // Flatten all records
    const flattenedRecords = records.map(record => 
      this.flattenRecord(record, options)
    );

    // Determine columns to include
    const columnsToInclude = options.includeColumns || 
      this.getColumnsFromRecords(flattenedRecords);

    // Generate CSV
    const headers = columnsToInclude;
    const rows = flattenedRecords.map(record => 
      columnsToInclude.map(column => this.escapeCSVValue(record[column]))
    );

    // Combine headers and rows
    const csvLines = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ];

    return csvLines.join('\n');
  }

  static downloadCSV(
    records: ExportRecord[],
    filename?: string,
    options: CSVExportOptions = {}
  ): void {
    const csvContent = this.export(records, options);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const defaultFilename = `compensation-data-${new Date().toISOString().split('T')[0]}.csv`;
    const finalFilename = filename || defaultFilename;
    
    // Create download link
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', finalFilename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }

  private static flattenRecord(
    record: ExportRecord,
    options: CSVExportOptions
  ): FlattenedRecord {
    const flattened: FlattenedRecord = {
      type: record.type,
      createdAt: this.formatDate(new Date(record.createdAt), options.dateFormat),
    };

    switch (record.type) {
      case 'salary':
        const salary = record.data as DecryptedSalaryData;
        Object.assign(flattened, {
          company: salary.company,
          title: salary.title,
          location: salary.location,
          amount: salary.amount,
          currency: salary.currency,
          startDate: this.formatDate(new Date(salary.startDate), options.dateFormat),
          endDate: salary.endDate ? this.formatDate(new Date(salary.endDate), options.dateFormat) : null,
          isCurrentPosition: salary.isCurrentPosition,
          notes: salary.notes || null,
        });
        break;

      case 'bonus':
        const bonus = record.data as DecryptedBonusData;
        Object.assign(flattened, {
          company: bonus.company,
          bonusType: bonus.type,
          amount: bonus.amount,
          currency: bonus.currency,
          date: this.formatDate(new Date(bonus.date), options.dateFormat),
          payrollDate: bonus.payrollDate ? this.formatDate(new Date(bonus.payrollDate), options.dateFormat) : null,
          description: bonus.description,
          notes: bonus.notes || null,
        });
        break;

      case 'equity':
        const equity = record.data as DecryptedEquityData;
        Object.assign(flattened, {
          company: equity.company,
          equityType: equity.type,
          shares: equity.shares,
          strikePrice: equity.strikePrice || null,
          grantDate: this.formatDate(new Date(equity.grantDate), options.dateFormat),
          vestingStart: this.formatDate(new Date(equity.vestingStart), options.dateFormat),
          vestingCliff: equity.vestingCliff || null,
          vestingPeriod: equity.vestingPeriod,
          vestingFrequency: equity.vestingFrequency,
          notes: equity.notes || null,
        });
        break;
    }

    return flattened;
  }

  private static formatDate(date: Date, format: CSVExportOptions['dateFormat'] = 'iso'): string {
    switch (format) {
      case 'us':
        return date.toLocaleDateString('en-US');
      case 'eu':
        return date.toLocaleDateString('en-GB');
      case 'iso':
      default:
        return date.toISOString().split('T')[0];
    }
  }

  private static getColumnsFromRecords(records: FlattenedRecord[]): string[] {
    const columns = new Set<string>();
    records.forEach(record => {
      Object.keys(record).forEach(key => columns.add(key));
    });
    return Array.from(columns).sort();
  }

  private static escapeCSVValue(value: string | number | boolean | null): string {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = String(value);
    
    // If the value contains comma, newline, or quote, wrap in quotes and escape quotes
    if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    
    return stringValue;
  }
}