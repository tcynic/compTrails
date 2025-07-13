/**
 * Utility script to run data integrity checks
 * This can be executed in the browser console for debugging or maintenance
 */

import { DataIntegrityService } from '../services/dataIntegrityService';

/**
 * Run a comprehensive data integrity check for the current user
 */
export async function runIntegrityCheck(userId: string, password: string) {
  console.log('🔍 Starting data integrity check...');
  
  try {
    const result = await DataIntegrityService.performIntegrityCheck(userId, password);
    
    console.log('📊 Integrity Check Results:');
    console.log(`Total records: ${result.summary.totalRecords}`);
    console.log(`Valid records: ${result.summary.validRecords}`);
    console.log(`Corrupted records: ${result.summary.corruptedRecords}`);
    console.log(`Duplicate records: ${result.summary.duplicates}`);
    console.log(`Business rule violations: ${result.summary.businessRuleViolations}`);
    
    if (result.details.corruptedRecords.length > 0) {
      console.log('\n❌ Corrupted Records:');
      result.details.corruptedRecords.forEach(record => {
        console.log(`  Record ${record.id}: ${record.error}`);
      });
    }
    
    if (result.details.duplicates.length > 0) {
      console.log('\n🔄 Duplicate Records:');
      result.details.duplicates.forEach(duplicate => {
        console.log(`  Record ${duplicate.id} is duplicate of ${duplicate.duplicateOf}: ${duplicate.reason}`);
      });
    }
    
    if (result.details.businessRuleViolations.length > 0) {
      console.log('\n⚠️ Business Rule Violations:');
      result.details.businessRuleViolations.forEach(violation => {
        console.log(`  Record ${violation.id} (${violation.rule}): ${violation.violation}`);
      });
    }
    
    if (result.warnings.length > 0) {
      console.log('\n⚠️ Warnings:');
      result.warnings.forEach(warning => console.log(`  ${warning}`));
    }
    
    console.log(`\n✨ Overall status: ${result.isValid ? 'VALID' : 'ISSUES FOUND'}`);
    
    return result;
  } catch (error) {
    console.error('❌ Integrity check failed:', error);
    throw error;
  }
}

/**
 * Get data integrity metrics and health score
 */
export async function getIntegrityMetrics(userId: string, password: string) {
  console.log('📈 Getting integrity metrics...');
  
  try {
    const metrics = await DataIntegrityService.getIntegrityMetrics(userId, password);
    
    console.log('📊 Data Health Metrics:');
    console.log(`Health Score: ${metrics.healthScore}/100`);
    console.log(`Risk Level: ${metrics.riskLevel.toUpperCase()}`);
    
    if (metrics.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      metrics.recommendations.forEach(rec => console.log(`  • ${rec}`));
    }
    
    return metrics;
  } catch (error) {
    console.error('❌ Failed to get integrity metrics:', error);
    throw error;
  }
}

/**
 * Run auto-fix for common data integrity issues
 */
export async function runAutoFix(userId: string, password: string, dryRun: boolean = true) {
  console.log(`🔧 ${dryRun ? 'Previewing' : 'Running'} auto-fix...`);
  
  try {
    const result = await DataIntegrityService.autoFixIntegrityIssues(userId, password, dryRun);
    
    console.log('🔧 Auto-Fix Results:');
    console.log(`Fixes ${dryRun ? 'that would be' : ''} applied: ${result.fixesApplied}`);
    console.log(`Success: ${result.success}`);
    
    if (result.issues.length > 0) {
      console.log('\n📝 Issues addressed:');
      result.issues.forEach(issue => console.log(`  • ${issue}`));
    }
    
    if (!dryRun && result.success && result.fixesApplied > 0) {
      console.log('\n✅ Auto-fix completed successfully!');
      console.log('💡 Consider running another integrity check to verify fixes.');
    }
    
    return result;
  } catch (error) {
    console.error('❌ Auto-fix failed:', error);
    throw error;
  }
}

/**
 * Complete data integrity workflow: check -> preview fixes -> apply fixes
 */
export async function runCompleteIntegrityWorkflow(userId: string, password: string) {
  console.log('🚀 Starting complete data integrity workflow...');
  
  try {
    // Step 1: Initial integrity check
    console.log('\n📋 Step 1: Initial integrity check');
    const initialCheck = await runIntegrityCheck(userId, password);
    
    // Step 2: Get health metrics
    console.log('\n📊 Step 2: Health metrics');
    const metrics = await getIntegrityMetrics(userId, password);
    
    // Step 3: Preview auto-fixes if issues found
    if (!initialCheck.isValid) {
      console.log('\n🔧 Step 3: Previewing auto-fixes');
      const previewResult = await runAutoFix(userId, password, true);
      
      if (previewResult.fixesApplied > 0) {
        console.log(`\n❓ Found ${previewResult.fixesApplied} issues that can be auto-fixed.`);
        console.log('💡 To apply fixes, run: runAutoFix(userId, password, false)');
        console.log('⚠️  WARNING: This will modify your data. Make sure you have backups!');
      } else {
        console.log('\n✨ No issues can be auto-fixed. Manual intervention may be required.');
      }
    } else {
      console.log('\n✅ Step 3: No issues found, skipping auto-fix');
    }
    
    console.log('\n🎉 Integrity workflow completed!');
    
    return {
      integrityCheck: initialCheck,
      metrics,
      hasAutoFixableIssues: !initialCheck.isValid
    };
    
  } catch (error) {
    console.error('❌ Integrity workflow failed:', error);
    throw error;
  }
}

// Helper function to get current user credentials (would need to be implemented based on app structure)
export function getCurrentUserCredentials(): { userId: string; password: string } | null {
  // This would need to be implemented based on how the app stores user credentials
  // For now, return null and require manual input
  console.log('ℹ️  To use these functions, you need to provide userId and password manually:');
  console.log('   await runIntegrityCheck("your-user-id", "your-password")');
  return null;
}

// Make functions available in browser console
if (typeof window !== 'undefined') {
  (window as any).runIntegrityCheck = runIntegrityCheck;
  (window as any).getIntegrityMetrics = getIntegrityMetrics;
  (window as any).runAutoFix = runAutoFix;
  (window as any).runCompleteIntegrityWorkflow = runCompleteIntegrityWorkflow;
  (window as any).getCurrentUserCredentials = getCurrentUserCredentials;
  
  console.log('🛠️  Data integrity utilities loaded. Available functions:');
  console.log('   runIntegrityCheck(userId, password) - Run comprehensive integrity check');
  console.log('   getIntegrityMetrics(userId, password) - Get health score and metrics');
  console.log('   runAutoFix(userId, password, dryRun=true) - Auto-fix common issues');
  console.log('   runCompleteIntegrityWorkflow(userId, password) - Complete workflow');
  console.log('\n📝 Example usage:');
  console.log('   await runIntegrityCheck("user-id-here", "password-here")');
  console.log('   await runCompleteIntegrityWorkflow("user-id-here", "password-here")');
}