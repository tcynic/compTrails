import { api } from '../../convex/_generated/api';
import { ConvexReactClient } from 'convex/react';
import { Id } from '../../convex/_generated/dataModel';

export interface DuplicateRecord {
  id: string;
  userId: string;
  type: string;
  createdAt: number;
  encryptedData: {
    data: string;
    iv: string;
    salt: string;
  };
  currency: string;
  isDuplicate: boolean;
  duplicateReason: string;
}

export interface CleanupReport {
  totalRecords: number;
  duplicatesFound: number;
  duplicatesRemoved: number;
  errors: string[];
  duplicateGroups: DuplicateRecord[][];
}

export class DuplicateCleanupService {
  private static convexClient: ConvexReactClient | null = null;

  static setConvexClient(client: ConvexReactClient): void {
    this.convexClient = client;
  }

  /**
   * Find all duplicate records for a user
   */
  static async findDuplicates(userId: string): Promise<DuplicateRecord[]> {
    if (!this.convexClient) {
      throw new Error('Convex client not initialized');
    }

    try {
      // Get all records for the user
      const allRecords = await this.convexClient.query(api.compensationRecords.getCompensationRecords, {
        userId,
      });

      const duplicates: DuplicateRecord[] = [];
      const recordMap = new Map<string, typeof allRecords>();

      // Group records by potential duplicate keys
      for (const record of allRecords) {
        // Create multiple keys to check for different types of duplicates
        const keys = [
          // Exact match (same encrypted data)
          `exact:${record.encryptedData.data}:${record.encryptedData.iv}:${record.encryptedData.salt}:${record.currency}`,
          // Same data length and currency (likely same content, different encryption)
          `length:${record.type}:${record.encryptedData.data.length}:${record.currency}`,
          // Same localId (if present)
          record.localId ? `localId:${record.localId}` : null,
        ].filter(Boolean) as string[];

        for (const key of keys) {
          if (!recordMap.has(key)) {
            recordMap.set(key, []);
          }
          recordMap.get(key)!.push(record);
        }
      }

      // Find duplicates
      for (const [key, records] of recordMap.entries()) {
        if (records.length > 1) {
          // Sort by creation date (keep the oldest)
          records.sort((a, b) => a.createdAt - b.createdAt);
          const [_original, ...dupes] = records;

          for (const dupe of dupes) {
            // Check if already marked as duplicate
            const existingDuplicate = duplicates.find(d => d.id === dupe._id);
            if (!existingDuplicate) {
              duplicates.push({
                id: dupe._id,
                userId: dupe.userId,
                type: dupe.type,
                createdAt: dupe.createdAt,
                encryptedData: dupe.encryptedData,
                currency: dupe.currency,
                isDuplicate: true,
                duplicateReason: this.getDuplicateReason(key),
              });
            }
          }
        }
      }

      return duplicates;
    } catch (error) {
      console.error('Error finding duplicates:', error);
      throw new Error(`Failed to find duplicates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up duplicate records for a user
   */
  static async cleanupDuplicates(userId: string, dryRun: boolean = true): Promise<CleanupReport> {
    if (!this.convexClient) {
      throw new Error('Convex client not initialized');
    }

    const report: CleanupReport = {
      totalRecords: 0,
      duplicatesFound: 0,
      duplicatesRemoved: 0,
      errors: [],
      duplicateGroups: [],
    };

    try {
      // Get all records for the user
      const allRecords = await this.convexClient.query(api.compensationRecords.getCompensationRecords, {
        userId,
      });

      report.totalRecords = allRecords.length;

      // Find duplicates
      const duplicates = await this.findDuplicates(userId);
      report.duplicatesFound = duplicates.length;

      if (duplicates.length === 0) {
        console.log(`No duplicates found for user ${userId}`);
        return report;
      }

      console.log(`Found ${duplicates.length} duplicate records for user ${userId}`);

      // Group duplicates for reporting
      const duplicateGroups = this.groupDuplicates(allRecords, duplicates);
      report.duplicateGroups = duplicateGroups;

      if (dryRun) {
        console.log('DRY RUN: Would remove the following duplicates:');
        for (const duplicate of duplicates) {
          console.log(`- Record ${duplicate.id} (${duplicate.type}, created: ${new Date(duplicate.createdAt).toISOString()}, reason: ${duplicate.duplicateReason})`);
        }
        return report;
      }

      // Actually remove duplicates
      console.log(`Removing ${duplicates.length} duplicate records...`);
      
      for (const duplicate of duplicates) {
        try {
          await this.convexClient.mutation(api.compensationRecords.deleteCompensationRecord, {
            id: duplicate.id as Id<"compensationRecords">,
          });
          report.duplicatesRemoved++;
          console.log(`Removed duplicate record ${duplicate.id}`);
        } catch (error) {
          const errorMsg = `Failed to remove duplicate ${duplicate.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          report.errors.push(errorMsg);
          console.error(errorMsg);
        }
      }

      console.log(`Cleanup completed. Removed ${report.duplicatesRemoved}/${report.duplicatesFound} duplicates`);
      
      if (report.errors.length > 0) {
        console.warn(`${report.errors.length} errors occurred during cleanup`);
      }

      return report;
    } catch (error) {
      const errorMsg = `Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      report.errors.push(errorMsg);
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Get a human-readable reason for why a record is considered a duplicate
   */
  private static getDuplicateReason(key: string): string {
    if (key.startsWith('exact:')) {
      return 'Exact match (same encrypted data)';
    } else if (key.startsWith('length:')) {
      return 'Same content length and type (likely same data, different encryption)';
    } else if (key.startsWith('localId:')) {
      return 'Same local ID (duplicate sync)';
    }
    return 'Unknown duplicate type';
  }

  /**
   * Group duplicates for better reporting
   */
  private static groupDuplicates(allRecords: any[], duplicates: DuplicateRecord[]): DuplicateRecord[][] {
    const groups: DuplicateRecord[][] = [];
    const processed = new Set<string>();

    for (const duplicate of duplicates) {
      if (processed.has(duplicate.id)) continue;

      // Find all related duplicates
      const group: DuplicateRecord[] = [duplicate];
      processed.add(duplicate.id);

      // Look for other duplicates with similar characteristics
      for (const other of duplicates) {
        if (processed.has(other.id)) continue;

        const isSimilar = 
          other.type === duplicate.type &&
          other.currency === duplicate.currency &&
          Math.abs(other.createdAt - duplicate.createdAt) < 60000 && // Within 1 minute
          other.encryptedData.data.length === duplicate.encryptedData.data.length;

        if (isSimilar) {
          group.push(other);
          processed.add(other.id);
        }
      }

      if (group.length > 0) {
        groups.push(group);
      }
    }

    return groups;
  }

  /**
   * Analyze duplicates without removing them
   */
  static async analyzeDuplicates(userId: string): Promise<{
    summary: {
      totalRecords: number;
      duplicateRecords: number;
      duplicatePercentage: number;
      duplicatesByType: Record<string, number>;
      duplicatesByReason: Record<string, number>;
    };
    recommendations: string[];
  }> {
    try {
      const duplicates = await this.findDuplicates(userId);
      
      if (!this.convexClient) {
        throw new Error('Convex client not initialized');
      }

      const allRecords = await this.convexClient.query(api.compensationRecords.getCompensationRecords, {
        userId,
      });

      const duplicatesByType: Record<string, number> = {};
      const duplicatesByReason: Record<string, number> = {};

      for (const duplicate of duplicates) {
        duplicatesByType[duplicate.type] = (duplicatesByType[duplicate.type] || 0) + 1;
        duplicatesByReason[duplicate.duplicateReason] = (duplicatesByReason[duplicate.duplicateReason] || 0) + 1;
      }

      const duplicatePercentage = allRecords.length > 0 ? (duplicates.length / allRecords.length) * 100 : 0;

      const recommendations: string[] = [];
      
      if (duplicates.length > 0) {
        recommendations.push(`Found ${duplicates.length} duplicate records that can be safely removed`);
      }
      
      if (duplicatePercentage > 50) {
        recommendations.push('High duplicate percentage detected - consider running cleanup immediately');
      } else if (duplicatePercentage > 20) {
        recommendations.push('Moderate duplicate percentage detected - cleanup recommended');
      }

      if (duplicatesByReason['Exact match (same encrypted data)'] > 0) {
        recommendations.push('Exact duplicates found - these are safe to remove immediately');
      }

      if (duplicatesByReason['Same content length and type (likely same data, different encryption)'] > 0) {
        recommendations.push('Potential content duplicates found - verify before removal');
      }

      return {
        summary: {
          totalRecords: allRecords.length,
          duplicateRecords: duplicates.length,
          duplicatePercentage: Math.round(duplicatePercentage * 100) / 100,
          duplicatesByType,
          duplicatesByReason,
        },
        recommendations,
      };
    } catch (error) {
      console.error('Error analyzing duplicates:', error);
      throw new Error(`Failed to analyze duplicates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cleanup all duplicates for all users (admin function)
   */
  static async cleanupAllDuplicates(dryRun: boolean = true): Promise<Record<string, CleanupReport>> {
    if (!this.convexClient) {
      throw new Error('Convex client not initialized');
    }

    console.log(`Starting ${dryRun ? 'dry run' : 'actual'} cleanup for all users...`);
    
    const reports: Record<string, CleanupReport> = {};

    try {
      // Get all unique user IDs
      const allRecords = await this.convexClient.query(api.compensationRecords.getCompensationRecords, {
        userId: '', // This might need adjustment based on your Convex query implementation
      });

      const userIds = [...new Set(allRecords.map(record => record.userId))];
      console.log(`Found ${userIds.length} users with compensation records`);

      for (const userId of userIds) {
        try {
          console.log(`Processing user ${userId}...`);
          const report = await this.cleanupDuplicates(userId, dryRun);
          reports[userId] = report;
          
          if (report.duplicatesFound > 0) {
            console.log(`User ${userId}: ${report.duplicatesFound} duplicates found, ${report.duplicatesRemoved} removed`);
          }
        } catch (error) {
          console.error(`Failed to process user ${userId}:`, error);
          reports[userId] = {
            totalRecords: 0,
            duplicatesFound: 0,
            duplicatesRemoved: 0,
            errors: [error instanceof Error ? error.message : 'Unknown error'],
            duplicateGroups: [],
          };
        }
      }

      // Summary
      const totals = Object.values(reports).reduce(
        (acc, report) => ({
          totalRecords: acc.totalRecords + report.totalRecords,
          duplicatesFound: acc.duplicatesFound + report.duplicatesFound,
          duplicatesRemoved: acc.duplicatesRemoved + report.duplicatesRemoved,
          errors: acc.errors + report.errors.length,
        }),
        { totalRecords: 0, duplicatesFound: 0, duplicatesRemoved: 0, errors: 0 }
      );

      console.log(`\nCleanup summary:`);
      console.log(`Total records: ${totals.totalRecords}`);
      console.log(`Duplicates found: ${totals.duplicatesFound}`);
      console.log(`Duplicates removed: ${totals.duplicatesRemoved}`);
      console.log(`Errors: ${totals.errors}`);

      return reports;
    } catch (error) {
      console.error('Failed to cleanup duplicates for all users:', error);
      throw new Error(`Failed to cleanup duplicates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}