import { ConvexReactClient } from 'convex/react';
import { DuplicateCleanupService } from '../services/duplicateCleanupService';

/**
 * Test script for duplicate cleanup functionality
 * Run this in the browser console or as a test script
 */
export async function testDuplicateCleanup() {
  console.log('Starting duplicate cleanup test...');

  // Initialize Convex client (you'll need to replace with actual values)
  const convexClient = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  DuplicateCleanupService.setConvexClient(convexClient);

  try {
    // Test with a known user ID - replace with actual user ID
    const userId = 'test-user-id'; // You'll need to get this from your auth context
    
    console.log(`Analyzing duplicates for user ${userId}...`);
    
    // First, analyze duplicates without removing them
    const analysis = await DuplicateCleanupService.analyzeDuplicates(userId);
    
    console.log('Duplicate Analysis Results:');
    console.log('Summary:', analysis.summary);
    console.log('Recommendations:', analysis.recommendations);
    
    if (analysis.summary.duplicateRecords > 0) {
      console.log(`\nFound ${analysis.summary.duplicateRecords} duplicates out of ${analysis.summary.totalRecords} total records`);
      console.log(`Duplicate percentage: ${analysis.summary.duplicatePercentage}%`);
      
      // Run a dry-run cleanup to see what would be removed
      console.log('\nRunning dry-run cleanup...');
      const dryRunReport = await DuplicateCleanupService.cleanupDuplicates(userId, true);
      
      console.log('Dry Run Results:');
      console.log(`Would remove ${dryRunReport.duplicatesFound} duplicates`);
      console.log('Duplicate groups:', dryRunReport.duplicateGroups);
      
      // Uncomment the following lines to actually remove duplicates
      // console.log('\nRunning actual cleanup...');
      // const actualReport = await DuplicateCleanupService.cleanupDuplicates(userId, false);
      // console.log('Actual cleanup results:', actualReport);
    } else {
      console.log('No duplicates found for this user.');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

/**
 * Test cleanup for all users (admin function)
 */
export async function testCleanupAllUsers() {
  console.log('Starting cleanup test for all users...');

  const convexClient = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  DuplicateCleanupService.setConvexClient(convexClient);

  try {
    // Run dry-run for all users
    console.log('Running dry-run cleanup for all users...');
    const reports = await DuplicateCleanupService.cleanupAllDuplicates(true);
    
    console.log('All Users Cleanup Results:');
    for (const [userId, report] of Object.entries(reports)) {
      if (report.duplicatesFound > 0) {
        console.log(`User ${userId}: ${report.duplicatesFound} duplicates found`);
      }
    }
    
    // Calculate totals
    const totals = Object.values(reports).reduce(
      (acc, report) => ({
        totalRecords: acc.totalRecords + report.totalRecords,
        duplicatesFound: acc.duplicatesFound + report.duplicatesFound,
        errors: acc.errors + report.errors.length,
      }),
      { totalRecords: 0, duplicatesFound: 0, errors: 0 }
    );
    
    console.log('\nOverall Summary:');
    console.log(`Total records across all users: ${totals.totalRecords}`);
    console.log(`Total duplicates found: ${totals.duplicatesFound}`);
    console.log(`Total errors: ${totals.errors}`);
    
    if (totals.duplicatesFound > 0) {
      console.log(`\nTo actually remove duplicates, set dryRun=false`);
      console.log(`This would remove ${totals.duplicatesFound} duplicate records`);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Helper function to get current user ID from auth context
export function getCurrentUserId(): string | null {
  // This would need to be implemented based on your auth setup
  // For testing, you can hardcode a user ID or get it from localStorage/context
  return localStorage.getItem('userId') || null;
}

// Main test function that can be called from browser console
export async function runDuplicateTest() {
  const userId = getCurrentUserId();
  
  if (!userId) {
    console.error('No user ID found. Please log in first.');
    return;
  }
  
  await testDuplicateCleanup();
}

// Export for browser console usage
if (typeof window !== 'undefined') {
  (window as any).testDuplicateCleanup = testDuplicateCleanup;
  (window as any).testCleanupAllUsers = testCleanupAllUsers;
  (window as any).runDuplicateTest = runDuplicateTest;
  
  console.log('Duplicate cleanup test functions available:');
  console.log('- testDuplicateCleanup(): Test cleanup for current user');
  console.log('- testCleanupAllUsers(): Test cleanup for all users');
  console.log('- runDuplicateTest(): Run test with current user');
}