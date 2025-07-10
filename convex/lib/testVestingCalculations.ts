/**
 * Comprehensive Test Suite for Vesting Calculations
 * 
 * Tests all aspects of the vesting calculation system including:
 * - Basic vesting schedules (linear, cliff, back-weighted)
 * - All equity types (ISO, NSO, RSU, ESPP)
 * - Edge cases (termination, acceleration, holidays)
 * - Error scenarios and recovery
 * - Performance under load
 */

import { VestingEngine } from './vestingEngine';
import { ServerDecryptionService } from './serverDecryption';
import { ErrorHandler } from './errorHandling';
import {
  DecryptedEquityGrant,
  VestingCalculationParams,
  VestingCalculationResult,
  VestingEvent,
  VestingCalculationError,
} from '../types/equity';

export interface TestResult {
  testName: string;
  passed: boolean;
  error?: string;
  duration: number;
  details?: any;
}

export interface TestSuite {
  suiteName: string;
  results: TestResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  totalDuration: number;
}

export class VestingCalculationTester {
  private vestingEngine: VestingEngine;
  private errorHandler: ErrorHandler;

  constructor() {
    this.vestingEngine = new VestingEngine();
    this.errorHandler = new ErrorHandler();
  }

  /**
   * Runs all test suites
   */
  async runAllTests(): Promise<TestSuite[]> {
    console.log('🧪 Starting comprehensive vesting calculation tests...');
    
    const testSuites = [
      await this.testBasicVestingSchedules(),
      await this.testEquityTypes(),
      await this.testEdgeCases(),
      await this.testErrorScenarios(),
      await this.testPerformance(),
      await this.testValidationScenarios(),
    ];
    
    const summary = this.generateTestSummary(testSuites);
    console.log('✅ All tests completed!', summary);
    
    return testSuites;
  }

  /**
   * Tests basic vesting schedules
   */
  async testBasicVestingSchedules(): Promise<TestSuite> {
    const suiteName = 'Basic Vesting Schedules';
    const results: TestResult[] = [];
    
    // Test 1: Standard 4-year vesting with 1-year cliff
    results.push(await this.runTest('Standard 4-year vesting with 1-year cliff', async () => {
      const grant = this.createTestGrant({
        shares: 4800,
        vestingCliff: 12,
        vestingPeriod: 48,
        vestingFrequency: 'monthly',
      });
      
      const result = await this.vestingEngine.calculateVesting({
        grant,
        calculationDate: new Date('2025-01-01'),
      });
      
      this.assert(result.success, 'Calculation should succeed');
      this.assert(result.events.length === 48, `Expected 48 events, got ${result.events.length}`);
      
      // First event should be cliff (12 months of shares)
      const cliffEvent = result.events[0];
      this.assert(cliffEvent.sharesVested === 1200, `Expected 1200 shares in cliff, got ${cliffEvent.sharesVested}`);
      
      // Remaining events should be 100 shares each
      for (let i = 1; i < result.events.length; i++) {
        this.assert(result.events[i].sharesVested === 100, `Expected 100 shares per month, got ${result.events[i].sharesVested}`);
      }
      
      return { eventsGenerated: result.events.length, cliffShares: cliffEvent.sharesVested };
    }));
    
    // Test 2: Monthly vesting without cliff
    results.push(await this.runTest('Monthly vesting without cliff', async () => {
      const grant = this.createTestGrant({
        shares: 2400,
        vestingCliff: 0,
        vestingPeriod: 24,
        vestingFrequency: 'monthly',
      });
      
      const result = await this.vestingEngine.calculateVesting({
        grant,
        calculationDate: new Date('2025-01-01'),
      });
      
      this.assert(result.success, 'Calculation should succeed');
      this.assert(result.events.length === 24, `Expected 24 events, got ${result.events.length}`);
      
      // All events should be 100 shares each
      result.events.forEach((event, index) => {
        this.assert(event.sharesVested === 100, `Event ${index} should vest 100 shares, got ${event.sharesVested}`);
      });
      
      return { eventsGenerated: result.events.length };
    }));
    
    // Test 3: Quarterly vesting
    results.push(await this.runTest('Quarterly vesting', async () => {
      const grant = this.createTestGrant({
        shares: 1200,
        vestingCliff: 0,
        vestingPeriod: 48,
        vestingFrequency: 'quarterly',
      });
      
      const result = await this.vestingEngine.calculateVesting({
        grant,
        calculationDate: new Date('2025-01-01'),
      });
      
      this.assert(result.success, 'Calculation should succeed');
      this.assert(result.events.length === 16, `Expected 16 quarterly events, got ${result.events.length}`);
      
      // Each event should be 75 shares (1200 / 16)
      result.events.forEach((event, index) => {
        this.assert(event.sharesVested === 75, `Event ${index} should vest 75 shares, got ${event.sharesVested}`);
      });
      
      return { eventsGenerated: result.events.length };
    }));
    
    // Test 4: Back-weighted vesting
    results.push(await this.runTest('Back-weighted vesting', async () => {
      const grant = this.createTestGrant({
        shares: 1000,
        vestingCliff: 0,
        vestingPeriod: 24,
        vestingFrequency: 'monthly',
        vestingType: 'back-weighted',
      });
      
      const result = await this.vestingEngine.calculateVesting({
        grant,
        calculationDate: new Date('2025-01-01'),
      });
      
      this.assert(result.success, 'Calculation should succeed');
      this.assert(result.events.length === 24, `Expected 24 events, got ${result.events.length}`);
      
      // Later events should have more shares than earlier events
      const firstEventShares = result.events[0].sharesVested;
      const lastEventShares = result.events[23].sharesVested;
      this.assert(lastEventShares > firstEventShares, 'Back-weighted should have more shares later');
      
      return { 
        firstEventShares, 
        lastEventShares,
        ratio: lastEventShares / firstEventShares
      };
    }));
    
    return this.compileSuite(suiteName, results);
  }

  /**
   * Tests different equity types
   */
  async testEquityTypes(): Promise<TestSuite> {
    const suiteName = 'Equity Types';
    const results: TestResult[] = [];
    
    // Test ISO
    results.push(await this.runTest('ISO (Incentive Stock Options)', async () => {
      const grant = this.createTestGrant({
        type: 'ISO',
        shares: 1000,
        strikePrice: 10.00,
        vestingPeriod: 48,
        vestingFrequency: 'monthly',
      });
      
      const result = await this.vestingEngine.calculateVesting({
        grant,
        calculationDate: new Date('2025-01-01'),
      });
      
      this.assert(result.success, 'ISO calculation should succeed');
      this.assert(result.events.every(e => e.grantType === 'ISO'), 'All events should be ISO type');
      
      return { totalEvents: result.events.length };
    }));
    
    // Test NSO
    results.push(await this.runTest('NSO (Non-Qualified Stock Options)', async () => {
      const grant = this.createTestGrant({
        type: 'NSO',
        shares: 1000,
        strikePrice: 5.00,
        vestingPeriod: 36,
        vestingFrequency: 'monthly',
      });
      
      const result = await this.vestingEngine.calculateVesting({
        grant,
        calculationDate: new Date('2025-01-01'),
      });
      
      this.assert(result.success, 'NSO calculation should succeed');
      this.assert(result.events.every(e => e.grantType === 'NSO'), 'All events should be NSO type');
      
      return { totalEvents: result.events.length };
    }));
    
    // Test RSU
    results.push(await this.runTest('RSU (Restricted Stock Units)', async () => {
      const grant = this.createTestGrant({
        type: 'RSU',
        shares: 800,
        strikePrice: undefined, // RSUs don't have strike price
        vestingPeriod: 32,
        vestingFrequency: 'quarterly',
      });
      
      const result = await this.vestingEngine.calculateVesting({
        grant,
        calculationDate: new Date('2025-01-01'),
      });
      
      this.assert(result.success, 'RSU calculation should succeed');
      this.assert(result.events.every(e => e.grantType === 'RSU'), 'All events should be RSU type');
      
      return { totalEvents: result.events.length };
    }));
    
    // Test ESPP
    results.push(await this.runTest('ESPP (Employee Stock Purchase Plan)', async () => {
      const grant = this.createTestGrant({
        type: 'ESPP',
        shares: 600,
        vestingPeriod: 24,
        vestingFrequency: 'quarterly',
      });
      
      const result = await this.vestingEngine.calculateVesting({
        grant,
        calculationDate: new Date('2025-01-01'),
      });
      
      this.assert(result.success, 'ESPP calculation should succeed');
      this.assert(result.events.every(e => e.grantType === 'ESPP'), 'All events should be ESPP type');
      
      return { totalEvents: result.events.length };
    }));
    
    return this.compileSuite(suiteName, results);
  }

  /**
   * Tests edge cases
   */
  async testEdgeCases(): Promise<TestSuite> {
    const suiteName = 'Edge Cases';
    const results: TestResult[] = [];
    
    // Test termination scenarios
    results.push(await this.runTest('Termination before full vesting', async () => {
      const grant = this.createTestGrant({
        shares: 4800,
        vestingCliff: 12,
        vestingPeriod: 48,
        vestingFrequency: 'monthly',
        terminationDate: new Date('2026-06-01'), // 18 months after grant
      });
      
      const result = await this.vestingEngine.calculateVesting({
        grant,
        calculationDate: new Date('2025-01-01'),
        terminationDate: new Date('2026-06-01'),
      });
      
      this.assert(result.success, 'Termination calculation should succeed');
      
      // Should only have events up to termination date
      const terminationTimestamp = new Date('2026-06-01').getTime();
      const eventsAfterTermination = result.events.filter(e => e.vestingDate > terminationTimestamp);
      this.assert(eventsAfterTermination.length === 0, 'No events should be after termination');
      
      return { 
        eventsBeforeTermination: result.events.length,
        totalVested: result.totalVested
      };
    }));
    
    // Test acceleration
    results.push(await this.runTest('Acceleration on acquisition', async () => {
      const grant = this.createTestGrant({
        shares: 4800,
        vestingCliff: 12,
        vestingPeriod: 48,
        vestingFrequency: 'monthly',
        acceleratedVesting: {
          enabled: true,
          triggerEvents: ['acquisition'],
          accelerationType: 'single',
          percentageAccelerated: 100,
        },
      });
      
      const result = await this.vestingEngine.calculateVesting({
        grant,
        calculationDate: new Date('2025-01-01'),
        includeAcceleration: true,
        accelerationEvents: [{
          type: 'acquisition',
          date: new Date('2026-01-01'), // 1 year after grant
          description: 'Company acquisition',
        }],
      });
      
      this.assert(result.success, 'Acceleration calculation should succeed');
      
      // Should have acceleration event
      const accelerationEvents = result.events.filter(e => 
        e.specialConditions?.some(c => c.type === 'acceleration')
      );
      this.assert(accelerationEvents.length > 0, 'Should have acceleration events');
      
      return { 
        totalEvents: result.events.length,
        accelerationEvents: accelerationEvents.length
      };
    }));
    
    // Test fractional shares
    results.push(await this.runTest('Fractional shares handling', async () => {
      const grant = this.createTestGrant({
        shares: 1001, // Odd number that doesn't divide evenly
        vestingCliff: 0,
        vestingPeriod: 24,
        vestingFrequency: 'monthly',
      });
      
      const result = await this.vestingEngine.calculateVesting({
        grant,
        calculationDate: new Date('2025-01-01'),
      });
      
      this.assert(result.success, 'Fractional shares calculation should succeed');
      
      // Total vested should be very close to original shares
      const totalCalculated = result.events.reduce((sum, e) => sum + e.sharesVested, 0);
      const difference = Math.abs(totalCalculated - grant.shares);
      this.assert(difference < 1, `Total shares difference should be < 1, got ${difference}`);
      
      return { 
        originalShares: grant.shares,
        calculatedShares: totalCalculated,
        difference
      };
    }));
    
    return this.compileSuite(suiteName, results);
  }

  /**
   * Tests error scenarios
   */
  async testErrorScenarios(): Promise<TestSuite> {
    const suiteName = 'Error Scenarios';
    const results: TestResult[] = [];
    
    // Test invalid grant data
    results.push(await this.runTest('Invalid grant data', async () => {
      const invalidGrant = {
        ...this.createTestGrant(),
        shares: -100, // Invalid negative shares
      };
      
      try {
        await this.vestingEngine.calculateVesting({
          grant: invalidGrant as any,
          calculationDate: new Date('2025-01-01'),
        });
        
        this.assert(false, 'Should have thrown error for invalid grant');
      } catch (error) {
        this.assert(error instanceof VestingCalculationError, 'Should throw VestingCalculationError');
        this.assert((error as VestingCalculationError).code === 'INVALID_GRANT_DATA', 'Should have correct error code');
      }
      
      return { errorHandled: true };
    }));
    
    // Test missing required fields
    results.push(await this.runTest('Missing required fields', async () => {
      const incompleteGrant = {
        company: 'Test Company',
        // Missing other required fields
      };
      
      try {
        await this.vestingEngine.calculateVesting({
          grant: incompleteGrant as any,
          calculationDate: new Date('2025-01-01'),
        });
        
        this.assert(false, 'Should have thrown error for incomplete grant');
      } catch (error) {
        this.assert(error instanceof VestingCalculationError, 'Should throw VestingCalculationError');
        this.assert((error as VestingCalculationError).code === 'MISSING_PARAMETERS', 'Should have correct error code');
      }
      
      return { errorHandled: true };
    }));
    
    // Test invalid dates
    results.push(await this.runTest('Invalid dates', async () => {
      const grant = this.createTestGrant({
        grantDate: new Date('2025-01-01'),
        vestingStart: new Date('2024-01-01'), // Before grant date
      });
      
      try {
        await this.vestingEngine.calculateVesting({
          grant,
          calculationDate: new Date('2025-01-01'),
        });
        
        this.assert(false, 'Should have thrown error for invalid dates');
      } catch (error) {
        this.assert(error instanceof VestingCalculationError, 'Should throw VestingCalculationError');
        this.assert((error as VestingCalculationError).code === 'INVALID_DATES', 'Should have correct error code');
      }
      
      return { errorHandled: true };
    }));
    
    return this.compileSuite(suiteName, results);
  }

  /**
   * Tests performance under load
   */
  async testPerformance(): Promise<TestSuite> {
    const suiteName = 'Performance Tests';
    const results: TestResult[] = [];
    
    // Test single calculation performance
    results.push(await this.runTest('Single calculation performance', async () => {
      const grant = this.createTestGrant({
        shares: 4800,
        vestingPeriod: 48,
        vestingFrequency: 'monthly',
      });
      
      const startTime = Date.now();
      const result = await this.vestingEngine.calculateVesting({
        grant,
        calculationDate: new Date('2025-01-01'),
      });
      const duration = Date.now() - startTime;
      
      this.assert(result.success, 'Performance test calculation should succeed');
      this.assert(duration < 1000, `Single calculation should take < 1s, took ${duration}ms`);
      
      return { duration, eventsGenerated: result.events.length };
    }));
    
    // Test batch calculation performance
    results.push(await this.runTest('Batch calculation performance', async () => {
      const grants = Array.from({ length: 100 }, () => this.createTestGrant({
        shares: Math.floor(Math.random() * 5000) + 1000,
        vestingPeriod: [24, 36, 48][Math.floor(Math.random() * 3)],
        vestingFrequency: ['monthly', 'quarterly'][Math.floor(Math.random() * 2)] as any,
      }));
      
      const startTime = Date.now();
      const results = await Promise.all(
        grants.map(grant => this.vestingEngine.calculateVesting({
          grant,
          calculationDate: new Date('2025-01-01'),
        }))
      );
      const duration = Date.now() - startTime;
      
      const successfulCalculations = results.filter(r => r.success).length;
      this.assert(successfulCalculations === 100, `All 100 calculations should succeed, got ${successfulCalculations}`);
      this.assert(duration < 30000, `Batch of 100 should take < 30s, took ${duration}ms`);
      
      return { 
        totalCalculations: 100,
        duration,
        averageDuration: duration / 100,
        successRate: (successfulCalculations / 100) * 100
      };
    }));
    
    return this.compileSuite(suiteName, results);
  }

  /**
   * Tests validation scenarios from the requirements
   */
  async testValidationScenarios(): Promise<TestSuite> {
    const suiteName = 'Validation Scenarios';
    const results: TestResult[] = [];
    
    // Test standard 4-year vesting with 1-year cliff (common scenario)
    results.push(await this.runTest('Standard 4-year 1-year cliff validation', async () => {
      const grant = this.createTestGrant({
        shares: 48000,
        vestingCliff: 12,
        vestingPeriod: 48,
        vestingFrequency: 'monthly',
      });
      
      const result = await this.vestingEngine.calculateVesting({
        grant,
        calculationDate: new Date('2025-01-01'),
      });
      
      // Validate cliff behavior
      const cliffEvent = result.events[0];
      const expectedCliffShares = 12000; // 25% of shares (12 months of 48)
      
      this.assert(result.success, 'Standard validation should succeed');
      this.assert(cliffEvent.sharesVested === expectedCliffShares, 
        `Cliff should vest ${expectedCliffShares} shares, got ${cliffEvent.sharesVested}`);
      
      // Validate remaining monthly vesting
      for (let i = 1; i < result.events.length; i++) {
        const expectedMonthlyShares = 1000; // (48000 - 12000) / 36 remaining months
        this.assert(Math.abs(result.events[i].sharesVested - expectedMonthlyShares) < 1,
          `Monthly vesting should be ~${expectedMonthlyShares} shares`);
      }
      
      return {
        cliffShares: cliffEvent.sharesVested,
        monthlyShares: result.events[1].sharesVested,
        totalEvents: result.events.length
      };
    }));
    
    // Test back-dated grant
    results.push(await this.runTest('Back-dated grant calculation', async () => {
      const grant = this.createTestGrant({
        grantDate: new Date('2023-01-01'), // Back-dated
        vestingStart: new Date('2023-01-01'),
        shares: 2400,
        vestingPeriod: 24,
        vestingFrequency: 'monthly',
      });
      
      const result = await this.vestingEngine.calculateVesting({
        grant,
        calculationDate: new Date('2025-01-01'), // 2 years later
      });
      
      this.assert(result.success, 'Back-dated calculation should succeed');
      
      // Should show all events as already vested
      const alreadyVested = result.totalVested;
      this.assert(alreadyVested === 2400, `All shares should be vested, got ${alreadyVested}`);
      
      return {
        totalVested: alreadyVested,
        totalShares: grant.shares,
        fullyVested: alreadyVested === grant.shares
      };
    }));
    
    return this.compileSuite(suiteName, results);
  }

  /**
   * Utility method to run a single test
   */
  private async runTest(testName: string, testFn: () => Promise<any>): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const details = await testFn();
      const duration = Date.now() - startTime;
      
      console.log(`✅ ${testName} - ${duration}ms`);
      
      return {
        testName,
        passed: true,
        duration,
        details,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.log(`❌ ${testName} - ${duration}ms - ${errorMessage}`);
      
      return {
        testName,
        passed: false,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Creates a test equity grant with defaults
   */
  private createTestGrant(overrides: Partial<DecryptedEquityGrant> = {}): DecryptedEquityGrant {
    return {
      company: 'Test Company Inc.',
      type: 'RSU',
      shares: 1000,
      grantDate: new Date('2024-01-01'),
      vestingStart: new Date('2024-01-01'),
      vestingCliff: 0,
      vestingPeriod: 48,
      vestingFrequency: 'monthly',
      vestingType: 'linear',
      ...overrides,
    } as DecryptedEquityGrant;
  }

  /**
   * Assertion helper
   */
  private assert(condition: boolean, message: string): void {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  /**
   * Compiles test results into a suite
   */
  private compileSuite(suiteName: string, results: TestResult[]): TestSuite {
    const totalTests = results.length;
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    
    return {
      suiteName,
      results,
      totalTests,
      passedTests,
      failedTests,
      totalDuration,
    };
  }

  /**
   * Generates test summary
   */
  private generateTestSummary(testSuites: TestSuite[]): any {
    const totalTests = testSuites.reduce((sum, suite) => sum + suite.totalTests, 0);
    const totalPassed = testSuites.reduce((sum, suite) => sum + suite.passedTests, 0);
    const totalFailed = testSuites.reduce((sum, suite) => sum + suite.failedTests, 0);
    const totalDuration = testSuites.reduce((sum, suite) => sum + suite.totalDuration, 0);
    
    return {
      suites: testSuites.length,
      totalTests,
      totalPassed,
      totalFailed,
      successRate: ((totalPassed / totalTests) * 100).toFixed(1) + '%',
      totalDuration: totalDuration + 'ms',
      averageTestDuration: (totalDuration / totalTests).toFixed(1) + 'ms',
    };
  }
}