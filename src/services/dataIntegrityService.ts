/**
 * Data Integrity Service
 * 
 * Provides tools for validating and monitoring compensation data integrity.
 * Includes validation for business rules, data consistency, and sync integrity.
 */

import { LocalStorageService } from './localStorageService';
import { EncryptionService } from './encryptionService';

export interface IntegrityCheckResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    totalRecords: number;
    validRecords: number;
    corruptedRecords: number;
    duplicates: number;
    businessRuleViolations: number;
  };
  details: {
    corruptedRecords: Array<{ id: number; error: string }>;
    duplicates: Array<{ id: number; duplicateOf: number; reason: string }>;
    businessRuleViolations: Array<{ id: number; rule: string; violation: string }>;
  };
}

export interface ValidationRule {
  name: string;
  description: string;
  validate: (record: any, allRecords: any[]) => { isValid: boolean; error?: string };
}

export class DataIntegrityService {
  
  /**
   * Business rule validation rules
   */
  private static readonly VALIDATION_RULES: ValidationRule[] = [
    {
      name: 'salary_date_range',
      description: 'Salary records should have valid date ranges (start date before end date)',
      validate: (record, _allRecords) => {
        if (record.type !== 'salary') return { isValid: true };
        
        if (record.startDate && record.endDate) {
          const start = new Date(record.startDate);
          const end = new Date(record.endDate);
          
          if (start >= end) {
            return {
              isValid: false,
              error: `Start date (${record.startDate}) must be before end date (${record.endDate})`
            };
          }
        }
        
        return { isValid: true };
      }
    },
    {
      name: 'salary_overlap_check',
      description: 'Salary records should not overlap in time for the same position',
      validate: (record, allRecords) => {
        if (record.type !== 'salary') return { isValid: true };
        
        const salaries = allRecords.filter(r => r.type === 'salary' && r.id !== record.id);
        
        for (const other of salaries) {
          // Check for overlapping date ranges
          if (record.startDate && other.startDate) {
            const recordStart = new Date(record.startDate);
            const recordEnd = record.endDate ? new Date(record.endDate) : new Date();
            const otherStart = new Date(other.startDate);
            const otherEnd = other.endDate ? new Date(other.endDate) : new Date();
            
            // Check if ranges overlap
            if (recordStart < otherEnd && recordEnd > otherStart) {
              return {
                isValid: false,
                error: `Salary period overlaps with another salary record (${other.startDate} - ${other.endDate})`
              };
            }
          }
        }
        
        return { isValid: true };
      }
    },
    {
      name: 'multiple_current_salary',
      description: 'Only one salary can be marked as current position',
      validate: (record, allRecords) => {
        if (record.type !== 'salary' || !record.isCurrentPosition) return { isValid: true };
        
        const currentSalaries = allRecords.filter(r => 
          r.type === 'salary' && 
          r.isCurrentPosition && 
          r.id !== record.id
        );
        
        if (currentSalaries.length > 0) {
          return {
            isValid: false,
            error: 'Multiple salaries marked as current position - only one allowed'
          };
        }
        
        return { isValid: true };
      }
    },
    {
      name: 'positive_amounts',
      description: 'Compensation amounts should be positive numbers',
      validate: (record, _allRecords) => {
        if (record.amount !== undefined) {
          const amount = parseFloat(record.amount);
          if (isNaN(amount) || amount <= 0) {
            return {
              isValid: false,
              error: `Invalid amount: ${record.amount} - must be a positive number`
            };
          }
        }
        
        return { isValid: true };
      }
    },
    {
      name: 'valid_currency',
      description: 'Currency codes should be valid ISO 4217 codes',
      validate: (record, _allRecords) => {
        const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK'];
        
        if (record.currency && !validCurrencies.includes(record.currency)) {
          return {
            isValid: false,
            error: `Invalid currency code: ${record.currency} - must be a valid ISO 4217 code`
          };
        }
        
        return { isValid: true };
      }
    },
    {
      name: 'equity_vesting_validation',
      description: 'Equity grants should have valid vesting schedules',
      validate: (record, _allRecords) => {
        if (record.type !== 'equity') return { isValid: true };
        
        if (record.vestingSchedule) {
          const { cliffMonths, vestingMonths, totalShares } = record.vestingSchedule;
          
          if (cliffMonths && cliffMonths < 0) {
            return {
              isValid: false,
              error: 'Cliff months cannot be negative'
            };
          }
          
          if (vestingMonths && vestingMonths <= 0) {
            return {
              isValid: false,
              error: 'Vesting months must be positive'
            };
          }
          
          if (totalShares && totalShares <= 0) {
            return {
              isValid: false,
              error: 'Total shares must be positive'
            };
          }
          
          if (cliffMonths && vestingMonths && cliffMonths > vestingMonths) {
            return {
              isValid: false,
              error: 'Cliff period cannot be longer than total vesting period'
            };
          }
        }
        
        return { isValid: true };
      }
    }
  ];

  /**
   * Perform comprehensive data integrity check for a user
   */
  static async performIntegrityCheck(
    userId: string, 
    password: string
  ): Promise<IntegrityCheckResult> {
    const result: IntegrityCheckResult = {
      isValid: true,
      errors: [],
      warnings: [],
      summary: {
        totalRecords: 0,
        validRecords: 0,
        corruptedRecords: 0,
        duplicates: 0,
        businessRuleViolations: 0,
      },
      details: {
        corruptedRecords: [],
        duplicates: [],
        businessRuleViolations: [],
      }
    };

    try {
      console.log(`[DataIntegrityService] Starting integrity check for user ${userId}`);
      
      // Get all compensation records
      const allRecords = await LocalStorageService.getCompensationRecords(userId);
      result.summary.totalRecords = allRecords.length;
      
      console.log(`[DataIntegrityService] Checking ${allRecords.length} records`);
      
      // Decrypt and validate each record
      const decryptedRecords = [];
      
      for (const record of allRecords) {
        try {
          // Test decryption
          const decryptResult = await EncryptionService.decryptData(record.encryptedData, password);
          
          if (!decryptResult.success) {
            result.details.corruptedRecords.push({
              id: record.id!,
              error: `Decryption failed: ${decryptResult.error}`
            });
            result.summary.corruptedRecords++;
            result.isValid = false;
            continue;
          }
          
          // Parse decrypted data
          let decryptedData;
          try {
            decryptedData = JSON.parse(decryptResult.data);
          } catch (parseError) {
            result.details.corruptedRecords.push({
              id: record.id!,
              error: `Data parsing failed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
            });
            result.summary.corruptedRecords++;
            result.isValid = false;
            continue;
          }
          
          decryptedRecords.push({
            ...record,
            ...decryptedData
          });
          
        } catch (error) {
          result.details.corruptedRecords.push({
            id: record.id!,
            error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
          result.summary.corruptedRecords++;
          result.isValid = false;
        }
      }
      
      // Check for duplicates
      await this.checkForDuplicates(decryptedRecords, result);
      
      // Validate business rules
      await this.validateBusinessRules(decryptedRecords, result);
      
      // Calculate summary
      result.summary.validRecords = result.summary.totalRecords - 
        result.summary.corruptedRecords - 
        result.summary.duplicates - 
        result.summary.businessRuleViolations;
      
      console.log(`[DataIntegrityService] Integrity check completed:`, result.summary);
      
      return result;
      
    } catch (error) {
      const errorMsg = `Integrity check failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[DataIntegrityService] ${errorMsg}`);
      
      result.isValid = false;
      result.errors.push(errorMsg);
      return result;
    }
  }

  /**
   * Check for duplicate records
   */
  private static async checkForDuplicates(
    records: any[], 
    result: IntegrityCheckResult
  ): Promise<void> {
    const fingerprints = new Map<string, number>();
    
    for (const record of records) {
      // Create content fingerprint
      const content = JSON.stringify({
        type: record.type,
        amount: record.amount,
        currency: record.currency,
        startDate: record.startDate,
        endDate: record.endDate,
        company: record.company,
      });
      
      let hash = 0;
      for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      const fingerprint = hash.toString(36);
      
      if (fingerprints.has(fingerprint)) {
        const duplicateOf = fingerprints.get(fingerprint)!;
        result.details.duplicates.push({
          id: record.id,
          duplicateOf,
          reason: 'Identical content fingerprint'
        });
        result.summary.duplicates++;
        result.isValid = false;
      } else {
        fingerprints.set(fingerprint, record.id);
      }
    }
  }

  /**
   * Validate business rules
   */
  private static async validateBusinessRules(
    records: any[], 
    result: IntegrityCheckResult
  ): Promise<void> {
    for (const record of records) {
      for (const rule of this.VALIDATION_RULES) {
        try {
          const validation = rule.validate(record, records);
          
          if (!validation.isValid) {
            result.details.businessRuleViolations.push({
              id: record.id,
              rule: rule.name,
              violation: validation.error || 'Unknown violation'
            });
            result.summary.businessRuleViolations++;
            result.isValid = false;
          }
        } catch (error) {
          result.warnings.push(`Rule validation failed for ${rule.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
  }

  /**
   * Auto-fix common data integrity issues
   */
  static async autoFixIntegrityIssues(
    userId: string, 
    password: string,
    dryRun: boolean = true
  ): Promise<{
    success: boolean;
    fixesApplied: number;
    issues: string[];
  }> {
    const result = {
      success: true,
      fixesApplied: 0,
      issues: [] as string[]
    };

    try {
      console.log(`[DataIntegrityService] ${dryRun ? 'Dry run' : 'Actual'} auto-fix for user ${userId}`);
      
      // Get integrity check results
      const integrityCheck = await this.performIntegrityCheck(userId, password);
      
      // Fix corrupted records by removing them (they're unrecoverable)
      for (const corrupted of integrityCheck.details.corruptedRecords) {
        if (!dryRun) {
          // Skip sync for corrupted records since they likely don't have valid Convex IDs
          await LocalStorageService.deleteCompensationRecord(corrupted.id, true);
        }
        result.fixesApplied++;
        result.issues.push(`${dryRun ? 'Would remove' : 'Removed'} corrupted record ${corrupted.id}: ${corrupted.error}`);
      }
      
      // Fix multiple current salaries by keeping the most recent one
      const currentSalaryViolations = integrityCheck.details.businessRuleViolations
        .filter(v => v.rule === 'multiple_current_salary');
      
      if (currentSalaryViolations.length > 0) {
        // Get all salary records and find the most recent current salary
        const allRecords = await LocalStorageService.getCompensationRecords(userId);
        const salaryRecords = [];
        
        for (const record of allRecords) {
          if (record.type === 'salary') {
            try {
              const decryptResult = await EncryptionService.decryptData(record.encryptedData, password);
              if (decryptResult.success) {
                const data = JSON.parse(decryptResult.data);
                if (data.isCurrentPosition) {
                  salaryRecords.push({ ...record, ...data });
                }
              }
            } catch (error) {
              console.warn(`Could not process salary record ${record.id}:`, error);
            }
          }
        }
        
        // Sort by start date and keep only the most recent
        salaryRecords.sort((a, b) => new Date(b.startDate || 0).getTime() - new Date(a.startDate || 0).getTime());
        
        for (let i = 1; i < salaryRecords.length; i++) {
          const recordToFix = salaryRecords[i];
          if (!dryRun) {
            // Update to set isCurrentPosition to false
            const updatedData = { ...recordToFix, isCurrentPosition: false };
            const encryptedData = await EncryptionService.encryptData(JSON.stringify(updatedData), password);
            
            await LocalStorageService.updateCompensationRecord(recordToFix.id!, {
              encryptedData,
              updatedAt: Date.now(),
              version: (recordToFix.version || 1) + 1,
            });
          }
          
          result.fixesApplied++;
          result.issues.push(`${dryRun ? 'Would fix' : 'Fixed'} multiple current salary issue for record ${recordToFix.id}`);
        }
      }
      
      console.log(`[DataIntegrityService] Auto-fix completed: ${result.fixesApplied} fixes applied`);
      
      return result;
      
    } catch (error) {
      const errorMsg = `Auto-fix failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[DataIntegrityService] ${errorMsg}`);
      
      result.success = false;
      result.issues.push(errorMsg);
      return result;
    }
  }

  /**
   * Monitor data integrity metrics over time
   */
  static async getIntegrityMetrics(userId: string, password: string): Promise<{
    healthScore: number; // 0-100 score
    riskLevel: 'low' | 'medium' | 'high';
    recommendations: string[];
  }> {
    try {
      const integrityCheck = await this.performIntegrityCheck(userId, password);
      
      // Calculate health score based on various factors
      let healthScore = 100;
      
      // Deduct points for issues
      const corruptionPenalty = (integrityCheck.summary.corruptedRecords / integrityCheck.summary.totalRecords) * 50;
      const duplicatePenalty = (integrityCheck.summary.duplicates / integrityCheck.summary.totalRecords) * 30;
      const violationPenalty = (integrityCheck.summary.businessRuleViolations / integrityCheck.summary.totalRecords) * 20;
      
      healthScore -= corruptionPenalty + duplicatePenalty + violationPenalty;
      healthScore = Math.max(0, Math.min(100, healthScore));
      
      // Determine risk level
      let riskLevel: 'low' | 'medium' | 'high';
      if (healthScore >= 90) riskLevel = 'low';
      else if (healthScore >= 70) riskLevel = 'medium';
      else riskLevel = 'high';
      
      // Generate recommendations
      const recommendations: string[] = [];
      
      if (integrityCheck.summary.corruptedRecords > 0) {
        recommendations.push(`${integrityCheck.summary.corruptedRecords} corrupted records detected - consider auto-fix or manual review`);
      }
      
      if (integrityCheck.summary.duplicates > 0) {
        recommendations.push(`${integrityCheck.summary.duplicates} duplicate records found - run duplicate cleanup`);
      }
      
      if (integrityCheck.summary.businessRuleViolations > 0) {
        recommendations.push(`${integrityCheck.summary.businessRuleViolations} business rule violations - review data consistency`);
      }
      
      if (integrityCheck.summary.totalRecords === 0) {
        recommendations.push('No compensation records found - ensure data sync is working properly');
      }
      
      if (healthScore === 100) {
        recommendations.push('Data integrity is excellent - no issues detected');
      }
      
      return {
        healthScore: Math.round(healthScore),
        riskLevel,
        recommendations
      };
      
    } catch (error) {
      console.error('[DataIntegrityService] Failed to calculate integrity metrics:', error);
      return {
        healthScore: 0,
        riskLevel: 'high',
        recommendations: ['Failed to assess data integrity - check system health']
      };
    }
  }
}