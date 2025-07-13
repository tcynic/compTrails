/**
 * Utility script to run duplicate cleanup
 * This can be executed in the browser console or integrated into the admin interface
 */

import { ConvexReactClient } from 'convex/react';
import { DuplicateCleanupService } from '../services/duplicateCleanupService';

/**
 * Initialize the duplicate cleanup service with a Convex client
 */
function initializeCleanupService(): ConvexReactClient {
  const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
  
  if (!CONVEX_URL) {
    throw new Error('CONVEX_URL not found in environment variables');
  }
  
  const client = new ConvexReactClient(CONVEX_URL);
  DuplicateCleanupService.setConvexClient(client);
  return client;
}

/**
 * Run duplicate analysis for a specific user
 */
export async function analyzeDuplicatesForUser(userId: string) {
  console.log(`🔍 Analyzing duplicates for user: ${userId}`);
  
  try {
    initializeCleanupService();
    const analysis = await DuplicateCleanupService.analyzeDuplicates(userId);
    
    console.log('📊 Analysis Results:');
    console.log(`Total records: ${analysis.summary.totalRecords}`);
    console.log(`Duplicate records: ${analysis.summary.duplicateRecords}`);
    console.log(`Duplicate percentage: ${analysis.summary.duplicatePercentage}%`);
    console.log('\n📋 Duplicates by type:');
    Object.entries(analysis.summary.duplicatesByType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
    console.log('\n🔍 Duplicates by reason:');
    Object.entries(analysis.summary.duplicatesByReason).forEach(([reason, count]) => {
      console.log(`  ${reason}: ${count}`);
    });
    console.log('\n💡 Recommendations:');
    analysis.recommendations.forEach(rec => console.log(`  • ${rec}`));
    
    return analysis;
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    throw error;
  }
}

/**
 * Run duplicate cleanup for a specific user (dry run by default)
 */
export async function cleanupDuplicatesForUser(userId: string, dryRun: boolean = true) {
  console.log(`🧹 ${dryRun ? 'Dry run' : 'Actual'} cleanup for user: ${userId}`);
  
  try {
    initializeCleanupService();
    const report = await DuplicateCleanupService.cleanupDuplicates(userId, dryRun);
    
    console.log('📊 Cleanup Results:');
    console.log(`Total records: ${report.totalRecords}`);
    console.log(`Duplicates found: ${report.duplicatesFound}`);
    console.log(`Duplicates ${dryRun ? 'would be' : ''} removed: ${report.duplicatesRemoved}`);
    
    if (report.errors.length > 0) {
      console.log('\n❌ Errors:');
      report.errors.forEach(error => console.log(`  • ${error}`));
    }
    
    if (report.duplicateGroups.length > 0) {
      console.log(`\n📁 Found ${report.duplicateGroups.length} duplicate groups`);
    }
    
    return report;
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  }
}

/**
 * Run cleanup for all users (admin function)
 */
export async function cleanupAllUserDuplicates(dryRun: boolean = true) {
  console.log(`🌐 ${dryRun ? 'Dry run' : 'Actual'} cleanup for ALL users`);
  
  try {
    initializeCleanupService();
    const reports = await DuplicateCleanupService.cleanupAllDuplicates(dryRun);
    
    const totals = Object.values(reports).reduce(
      (acc, report) => ({
        totalRecords: acc.totalRecords + report.totalRecords,
        duplicatesFound: acc.duplicatesFound + report.duplicatesFound,
        duplicatesRemoved: acc.duplicatesRemoved + report.duplicatesRemoved,
        errors: acc.errors + report.errors.length,
      }),
      { totalRecords: 0, duplicatesFound: 0, duplicatesRemoved: 0, errors: 0 }
    );

    console.log('\n🎯 Overall Summary:');
    console.log(`Total records across all users: ${totals.totalRecords}`);
    console.log(`Total duplicates found: ${totals.duplicatesFound}`);
    console.log(`Total duplicates ${dryRun ? 'would be' : ''} removed: ${totals.duplicatesRemoved}`);
    console.log(`Total errors: ${totals.errors}`);

    if (totals.duplicatesFound > 0 && dryRun) {
      console.log('\n💡 To actually remove duplicates, run:');
      console.log('cleanupAllUserDuplicates(false)');
    }

    return reports;
  } catch (error) {
    console.error('❌ Global cleanup failed:', error);
    throw error;
  }
}

// Make functions available in browser console for easy testing
if (typeof window !== 'undefined') {
  (window as any).analyzeDuplicatesForUser = analyzeDuplicatesForUser;
  (window as any).cleanupDuplicatesForUser = cleanupDuplicatesForUser;
  (window as any).cleanupAllUserDuplicates = cleanupAllUserDuplicates;
  
  console.log('🛠️  Duplicate cleanup utilities loaded. Available functions:');
  console.log('   analyzeDuplicatesForUser(userId) - Analyze duplicates for specific user');
  console.log('   cleanupDuplicatesForUser(userId, dryRun=true) - Cleanup duplicates for specific user');
  console.log('   cleanupAllUserDuplicates(dryRun=true) - Cleanup duplicates for all users');
  console.log('\n📝 Example usage:');
  console.log('   await analyzeDuplicatesForUser("user-id-here")');
  console.log('   await cleanupDuplicatesForUser("user-id-here", true)  // dry run');
  console.log('   await cleanupDuplicatesForUser("user-id-here", false) // actual cleanup');
  console.log('   await cleanupAllUserDuplicates(true)  // dry run for all users');
  console.log('   await cleanupAllUserDuplicates(false) // actual cleanup for all users');
}