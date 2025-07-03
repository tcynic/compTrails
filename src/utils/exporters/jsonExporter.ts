import type { DecryptedSalaryData, DecryptedBonusData, DecryptedEquityData } from '@/lib/db/types';
import type { ExportRecord } from './csvExporter';

export interface JSONExportOptions {
  includeMetadata?: boolean;
  prettifyOutput?: boolean;
  includeSchema?: boolean;
}

export interface ExportMetadata {
  exportDate: string;
  exportVersion: string;
  recordCount: number;
  dataTypes: string[];
  dateRange: {
    earliest: string;
    latest: string;
  };
  currencies: string[];
}

export interface JSONExportData {
  metadata?: ExportMetadata;
  schema?: ExportSchema;
  data: {
    salaries: DecryptedSalaryData[];
    bonuses: DecryptedBonusData[];
    equity: DecryptedEquityData[];
  };
}

export interface ExportSchema {
  version: string;
  description: string;
  dataTypes: {
    [key: string]: {
      description: string;
      fields: {
        [fieldName: string]: {
          type: string;
          required: boolean;
          description: string;
        };
      };
    };
  };
}

export class JSONExporter {
  private static readonly EXPORT_VERSION = '1.0.0';
  private static readonly SCHEMA_VERSION = '1.0.0';

  static export(
    records: ExportRecord[],
    options: JSONExportOptions = {}
  ): string {
    const exportData = this.buildExportData(records, options);
    
    return options.prettifyOutput 
      ? JSON.stringify(exportData, null, 2)
      : JSON.stringify(exportData);
  }

  static downloadJSON(
    records: ExportRecord[],
    filename?: string,
    options: JSONExportOptions = {}
  ): void {
    const jsonContent = this.export(records, options);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    
    const defaultFilename = `compensation-data-${new Date().toISOString().split('T')[0]}.json`;
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

  private static buildExportData(
    records: ExportRecord[],
    options: JSONExportOptions
  ): JSONExportData {
    // Separate records by type
    const salaries: DecryptedSalaryData[] = [];
    const bonuses: DecryptedBonusData[] = [];
    const equity: DecryptedEquityData[] = [];

    records.forEach(record => {
      switch (record.type) {
        case 'salary':
          salaries.push(record.data as DecryptedSalaryData);
          break;
        case 'bonus':
          bonuses.push(record.data as DecryptedBonusData);
          break;
        case 'equity':
          equity.push(record.data as DecryptedEquityData);
          break;
      }
    });

    const exportData: JSONExportData = {
      data: {
        salaries,
        bonuses,
        equity,
      },
    };

    // Add metadata if requested
    if (options.includeMetadata !== false) {
      exportData.metadata = this.generateMetadata(records);
    }

    // Add schema if requested
    if (options.includeSchema) {
      exportData.schema = this.generateSchema();
    }

    return exportData;
  }

  private static generateMetadata(records: ExportRecord[]): ExportMetadata {
    const dataTypes = [...new Set(records.map(r => r.type))];
    const currencies = [...new Set(records.map(r => r.currency))];
    
    // Find date range
    const dates = records.map(r => r.createdAt);
    const earliest = Math.min(...dates);
    const latest = Math.max(...dates);

    return {
      exportDate: new Date().toISOString(),
      exportVersion: this.EXPORT_VERSION,
      recordCount: records.length,
      dataTypes,
      dateRange: {
        earliest: new Date(earliest).toISOString(),
        latest: new Date(latest).toISOString(),
      },
      currencies,
    };
  }

  private static generateSchema(): ExportSchema {
    return {
      version: this.SCHEMA_VERSION,
      description: 'CompTrails compensation data export schema',
      dataTypes: {
        salary: {
          description: 'Employee salary information',
          fields: {
            company: { type: 'string', required: true, description: 'Company name' },
            title: { type: 'string', required: true, description: 'Job title' },
            location: { type: 'string', required: true, description: 'Work location' },
            amount: { type: 'number', required: true, description: 'Annual salary amount' },
            currency: { type: 'string', required: true, description: 'Currency code (ISO 4217)' },
            startDate: { type: 'string', required: true, description: 'Start date (ISO 8601)' },
            endDate: { type: 'string', required: false, description: 'End date (ISO 8601)' },
            isCurrentPosition: { type: 'boolean', required: true, description: 'Whether this is the current position' },
            notes: { type: 'string', required: false, description: 'Additional notes' },
          },
        },
        bonus: {
          description: 'Bonus compensation information',
          fields: {
            company: { type: 'string', required: true, description: 'Company name' },
            type: { type: 'string', required: true, description: 'Bonus type (performance, signing, retention, spot, annual, other)' },
            amount: { type: 'number', required: true, description: 'Bonus amount' },
            currency: { type: 'string', required: true, description: 'Currency code (ISO 4217)' },
            date: { type: 'string', required: true, description: 'Bonus date (ISO 8601)' },
            payrollDate: { type: 'string', required: false, description: 'Payroll date (ISO 8601)' },
            description: { type: 'string', required: true, description: 'Bonus description' },
            notes: { type: 'string', required: false, description: 'Additional notes' },
          },
        },
        equity: {
          description: 'Equity grant information',
          fields: {
            company: { type: 'string', required: true, description: 'Company name' },
            type: { type: 'string', required: true, description: 'Equity type (ISO, NSO, RSU, ESPP, other)' },
            shares: { type: 'number', required: true, description: 'Number of shares' },
            strikePrice: { type: 'number', required: false, description: 'Strike price for options' },
            grantDate: { type: 'string', required: true, description: 'Grant date (ISO 8601)' },
            vestingStart: { type: 'string', required: true, description: 'Vesting start date (ISO 8601)' },
            vestingCliff: { type: 'number', required: false, description: 'Vesting cliff period in months' },
            vestingPeriod: { type: 'number', required: true, description: 'Total vesting period in months' },
            vestingFrequency: { type: 'string', required: true, description: 'Vesting frequency (monthly, quarterly, annual)' },
            notes: { type: 'string', required: false, description: 'Additional notes' },
          },
        },
      },
    };
  }

  static validateExportData(data: JSONExportData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate structure
    if (!data.data) {
      errors.push('Missing data property');
      return { isValid: false, errors };
    }

    const { salaries, bonuses, equity } = data.data;

    // Validate salary records
    if (salaries && Array.isArray(salaries)) {
      salaries.forEach((salary, index) => {
        const salaryErrors = this.validateSalaryRecord(salary, index);
        errors.push(...salaryErrors);
      });
    }

    // Validate bonus records
    if (bonuses && Array.isArray(bonuses)) {
      bonuses.forEach((bonus, index) => {
        const bonusErrors = this.validateBonusRecord(bonus, index);
        errors.push(...bonusErrors);
      });
    }

    // Validate equity records
    if (equity && Array.isArray(equity)) {
      equity.forEach((equityRecord, index) => {
        const equityErrors = this.validateEquityRecord(equityRecord, index);
        errors.push(...equityErrors);
      });
    }

    return { isValid: errors.length === 0, errors };
  }

  private static validateSalaryRecord(salary: DecryptedSalaryData, index: number): string[] {
    const errors: string[] = [];
    const prefix = `Salary record ${index}:`;

    if (!salary.company) errors.push(`${prefix} company is required`);
    if (!salary.title) errors.push(`${prefix} title is required`);
    if (!salary.location) errors.push(`${prefix} location is required`);
    if (typeof salary.amount !== 'number' || salary.amount < 0) errors.push(`${prefix} amount must be a positive number`);
    if (!salary.currency) errors.push(`${prefix} currency is required`);
    if (!salary.startDate) errors.push(`${prefix} startDate is required`);
    if (typeof salary.isCurrentPosition !== 'boolean') errors.push(`${prefix} isCurrentPosition must be a boolean`);

    return errors;
  }

  private static validateBonusRecord(bonus: DecryptedBonusData, index: number): string[] {
    const errors: string[] = [];
    const prefix = `Bonus record ${index}:`;

    if (!bonus.company) errors.push(`${prefix} company is required`);
    if (!bonus.type) errors.push(`${prefix} type is required`);
    if (typeof bonus.amount !== 'number' || bonus.amount < 0) errors.push(`${prefix} amount must be a positive number`);
    if (!bonus.currency) errors.push(`${prefix} currency is required`);
    if (!bonus.date) errors.push(`${prefix} date is required`);
    if (!bonus.description) errors.push(`${prefix} description is required`);

    return errors;
  }

  private static validateEquityRecord(equity: DecryptedEquityData, index: number): string[] {
    const errors: string[] = [];
    const prefix = `Equity record ${index}:`;

    if (!equity.company) errors.push(`${prefix} company is required`);
    if (!equity.type) errors.push(`${prefix} type is required`);
    if (typeof equity.shares !== 'number' || equity.shares < 1) errors.push(`${prefix} shares must be a positive number`);
    if (!equity.grantDate) errors.push(`${prefix} grantDate is required`);
    if (!equity.vestingStart) errors.push(`${prefix} vestingStart is required`);
    if (typeof equity.vestingPeriod !== 'number' || equity.vestingPeriod < 1) errors.push(`${prefix} vestingPeriod must be a positive number`);
    if (!equity.vestingFrequency) errors.push(`${prefix} vestingFrequency is required`);

    return errors;
  }
}