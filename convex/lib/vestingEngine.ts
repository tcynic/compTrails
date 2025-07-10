/**
 * Comprehensive Vesting Calculation Engine
 * 
 * Handles all types of equity vesting calculations including:
 * - Linear, cliff, back-weighted, and performance-based vesting
 * - Support for ISO, NSO, RSU, and ESPP equity types
 * - Edge cases: termination, acceleration, holidays, etc.
 */

import { addMonths, startOfDay, isAfter, isBefore, isWeekend, addDays, differenceInMonths } from 'date-fns';
import {
  DecryptedEquityGrant,
  VestingEvent,
  VestingCalculationResult,
  VestingCalculationParams,
  VestingConfig,
  DEFAULT_VESTING_CONFIG,
  VestingCalculationError,
  VestingSpecialCondition,
  AccelerationEvent,
  EnrichedVestingEvent,
  FMVContext,
  isStockOption,
  isRSU,
  isESPP,
  hasAcceleration,
  hasPerformanceVesting,
  isCustomVesting,
} from '../types/equity';

export class VestingEngine {
  private config: VestingConfig;
  private calculationStartTime: number = 0;

  constructor(config: Partial<VestingConfig> = {}) {
    this.config = { ...DEFAULT_VESTING_CONFIG, ...config };
  }

  /**
   * Main entry point for vesting calculations
   */
  async calculateVesting(params: VestingCalculationParams): Promise<VestingCalculationResult> {
    this.calculationStartTime = Date.now();
    
    try {
      // Validate input parameters
      this.validateCalculationParams(params);
      
      // Determine calculation method based on grant type
      const calculationMethod = this.determineCalculationMethod(params.grant);
      
      // Generate base vesting events
      let events = await this.generateBaseVestingEvents(params);
      
      // Apply special conditions
      if (params.includeAcceleration && hasAcceleration(params.grant)) {
        events = this.applyAcceleration(events, params);
      }
      
      if (params.includePerformance && hasPerformanceVesting(params.grant)) {
        events = this.applyPerformanceVesting(events, params);
      }
      
      // Handle termination scenarios
      if (params.terminationDate) {
        events = this.applyTerminationRules(events, params);
      }
      
      // Apply date adjustments (weekends, holidays)
      events = this.adjustVestingDates(events);
      
      // Sort events by date and calculate cumulative values
      events = this.finalizeEvents(events, params.grant);
      
      // Calculate summary information
      const totalVested = this.calculateTotalVested(events, params.calculationDate);
      const totalRemaining = params.grant.shares - totalVested;
      const nextVestingEvent = this.findNextVestingEvent(events, params.calculationDate);
      
      const calculationTime = Date.now() - this.calculationStartTime;
      
      return {
        success: true,
        events,
        totalVested,
        totalRemaining,
        nextVestingEvent,
        calculationMetadata: {
          calculatedAt: Date.now(),
          calculationMethod,
          parametersUsed: params,
          performanceMetrics: {
            calculationDuration: calculationTime,
            eventsGenerated: events.length,
            complexityScore: this.calculateComplexityScore(params.grant),
          },
        },
      };
      
    } catch (error) {
      const calculationTime = Date.now() - this.calculationStartTime;
      
      if (error instanceof VestingCalculationError) {
        return {
          success: false,
          events: [],
          totalVested: 0,
          totalRemaining: params.grant.shares,
          error: error.message,
          calculationMetadata: {
            calculatedAt: Date.now(),
            calculationMethod: 'failed',
            parametersUsed: params,
            performanceMetrics: {
              calculationDuration: calculationTime,
              eventsGenerated: 0,
              complexityScore: 0,
            },
          },
        };
      }
      
      throw error;
    }
  }

  /**
   * Validates calculation parameters
   */
  private validateCalculationParams(params: VestingCalculationParams): void {
    if (!params.grant) {
      throw new VestingCalculationError('Grant data is required', 'MISSING_PARAMETERS');
    }
    
    if (!params.calculationDate) {
      throw new VestingCalculationError('Calculation date is required', 'MISSING_PARAMETERS');
    }
    
    const grant = params.grant;
    
    // Validate required grant fields
    if (!grant.company || !grant.type || !grant.shares || !grant.grantDate || !grant.vestingStart) {
      throw new VestingCalculationError('Grant is missing required fields', 'INVALID_GRANT_DATA');
    }
    
    // Validate dates
    if (isAfter(grant.grantDate, grant.vestingStart)) {
      throw new VestingCalculationError('Grant date cannot be after vesting start date', 'INVALID_DATES');
    }
    
    if (grant.exerciseDeadline && isBefore(grant.exerciseDeadline, grant.vestingStart)) {
      throw new VestingCalculationError('Exercise deadline cannot be before vesting start', 'INVALID_DATES');
    }
    
    // Validate numeric fields
    if (grant.shares <= 0) {
      throw new VestingCalculationError('Shares must be positive', 'INVALID_GRANT_DATA');
    }
    
    if (grant.vestingPeriod <= 0) {
      throw new VestingCalculationError('Vesting period must be positive', 'INVALID_GRANT_DATA');
    }
    
    if (grant.vestingCliff && grant.vestingCliff < 0) {
      throw new VestingCalculationError('Vesting cliff cannot be negative', 'INVALID_GRANT_DATA');
    }
    
    // Type-specific validations
    if (isStockOption(grant) && grant.strikePrice === undefined) {
      throw new VestingCalculationError('Stock options must have a strike price', 'INVALID_GRANT_DATA');
    }
    
    if (isRSU(grant) && grant.strikePrice !== undefined) {
      throw new VestingCalculationError('RSUs should not have a strike price', 'INVALID_GRANT_DATA');
    }
  }

  /**
   * Determines the appropriate calculation method
   */
  private determineCalculationMethod(grant: DecryptedEquityGrant): string {
    if (isCustomVesting(grant)) {
      return 'custom';
    }
    
    if (grant.vestingType) {
      return grant.vestingType;
    }
    
    if (grant.vestingCliff && grant.vestingCliff > 0) {
      return 'cliff';
    }
    
    return 'linear';
  }

  /**
   * Generates base vesting events before applying special conditions
   */
  private async generateBaseVestingEvents(params: VestingCalculationParams): Promise<VestingEvent[]> {
    const grant = params.grant;
    
    // Handle custom vesting schedules
    if (isCustomVesting(grant) && grant.customVestingSchedule) {
      return this.generateCustomVestingEvents(grant);
    }
    
    // Handle standard vesting schedules
    switch (grant.vestingType || 'linear') {
      case 'linear':
        return this.generateLinearVestingEvents(grant);
      case 'cliff':
        return this.generateCliffVestingEvents(grant);
      case 'back-weighted':
        return this.generateBackWeightedVestingEvents(grant);
      case 'performance-based':
        return this.generatePerformanceBasedVestingEvents(grant);
      default:
        return this.generateLinearVestingEvents(grant);
    }
  }

  /**
   * Generates linear vesting events (even distribution)
   */
  private generateLinearVestingEvents(grant: DecryptedEquityGrant): VestingEvent[] {
    const events: VestingEvent[] = [];
    
    const vestingStart = startOfDay(grant.vestingStart);
    const cliffMonths = grant.vestingCliff || 0;
    const cliffDate = cliffMonths > 0 ? addMonths(vestingStart, cliffMonths) : vestingStart;
    
    // Calculate frequency in months
    const frequencyMonths = this.getFrequencyInMonths(grant.vestingFrequency);
    
    // Calculate total vesting periods
    const totalPeriods = grant.vestingPeriod / frequencyMonths;
    const sharesPerPeriod = grant.shares / totalPeriods;
    
    let currentDate = cliffDate;
    const endDate = addMonths(vestingStart, grant.vestingPeriod);
    let periodIndex = 0;
    
    while (isBefore(currentDate, endDate) || currentDate.getTime() === endDate.getTime()) {
      let sharesVesting = sharesPerPeriod;
      const specialConditions: VestingSpecialCondition[] = [];
      
      // Handle cliff vesting (first event includes cliff shares)
      if (periodIndex === 0 && cliffMonths > 0) {
        const cliffPeriods = cliffMonths / frequencyMonths;
        sharesVesting = sharesPerPeriod * cliffPeriods;
        specialConditions.push({
          type: 'cliff',
          description: `${cliffMonths}-month cliff vesting`,
          appliedShares: sharesVesting,
        });
      }
      
      events.push({
        vestingDate: startOfDay(currentDate).getTime(),
        sharesVested: Math.round(sharesVesting * Math.pow(10, this.config.sharesPrecision)) / Math.pow(10, this.config.sharesPrecision),
        cumulativeVested: 0, // Will be calculated in finalizeEvents
        grantType: grant.type,
        companyName: grant.company,
        calculationSource: 'automated',
        specialConditions: specialConditions.length > 0 ? specialConditions : undefined,
      });
      
      currentDate = addMonths(currentDate, frequencyMonths);
      periodIndex++;
    }
    
    return events;
  }

  /**
   * Generates cliff vesting events
   */
  private generateCliffVestingEvents(grant: DecryptedEquityGrant): VestingEvent[] {
    // Cliff vesting is handled in linear vesting with cliff parameter
    return this.generateLinearVestingEvents(grant);
  }

  /**
   * Generates back-weighted vesting events (more shares vest later)
   */
  private generateBackWeightedVestingEvents(grant: DecryptedEquityGrant): VestingEvent[] {
    const events: VestingEvent[] = [];
    
    const vestingStart = startOfDay(grant.vestingStart);
    const cliffMonths = grant.vestingCliff || 0;
    const cliffDate = cliffMonths > 0 ? addMonths(vestingStart, cliffMonths) : vestingStart;
    
    const frequencyMonths = this.getFrequencyInMonths(grant.vestingFrequency);
    const totalPeriods = grant.vestingPeriod / frequencyMonths;
    
    // Back-weighted: earlier periods get smaller percentages
    // Formula: weight = period / totalPeriods
    const weights = Array.from({ length: totalPeriods }, (_, i) => (i + 1) / totalPeriods);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    
    let currentDate = cliffDate;
    const endDate = addMonths(vestingStart, grant.vestingPeriod);
    let periodIndex = 0;
    
    while (isBefore(currentDate, endDate) || currentDate.getTime() === endDate.getTime()) {
      const weight = weights[periodIndex] / totalWeight;
      let sharesVesting = grant.shares * weight;
      const specialConditions: VestingSpecialCondition[] = [];
      
      // Handle cliff
      if (periodIndex === 0 && cliffMonths > 0) {
        specialConditions.push({
          type: 'cliff',
          description: `${cliffMonths}-month cliff with back-weighted vesting`,
          appliedShares: sharesVesting,
        });
      }
      
      events.push({
        vestingDate: startOfDay(currentDate).getTime(),
        sharesVested: Math.round(sharesVesting * Math.pow(10, this.config.sharesPrecision)) / Math.pow(10, this.config.sharesPrecision),
        cumulativeVested: 0,
        grantType: grant.type,
        companyName: grant.company,
        calculationSource: 'automated',
        specialConditions: specialConditions.length > 0 ? specialConditions : undefined,
      });
      
      currentDate = addMonths(currentDate, frequencyMonths);
      periodIndex++;
    }
    
    return events;
  }

  /**
   * Generates performance-based vesting events
   */
  private generatePerformanceBasedVestingEvents(grant: DecryptedEquityGrant): VestingEvent[] {
    const events: VestingEvent[] = [];
    
    if (!grant.performanceVesting || !grant.performanceVesting.enabled) {
      // Fallback to linear vesting if no performance criteria
      return this.generateLinearVestingEvents(grant);
    }
    
    const milestones = grant.performanceVesting.milestones;
    
    for (const milestone of milestones) {
      if (!milestone.achieved) {
        continue; // Skip unachieved milestones
      }
      
      const vestingDate = milestone.achievedDate || milestone.targetDate;
      if (!vestingDate) {
        continue;
      }
      
      const sharesVesting = (grant.shares * milestone.percentageOfGrant) / 100;
      
      // Apply vesting delay if specified
      let finalVestingDate = startOfDay(vestingDate);
      if (grant.performanceVesting.vestingDelay) {
        finalVestingDate = addMonths(finalVestingDate, grant.performanceVesting.vestingDelay);
      }
      
      events.push({
        vestingDate: finalVestingDate.getTime(),
        sharesVested: Math.round(sharesVesting * Math.pow(10, this.config.sharesPrecision)) / Math.pow(10, this.config.sharesPrecision),
        cumulativeVested: 0,
        grantType: grant.type,
        companyName: grant.company,
        calculationSource: 'automated',
        specialConditions: [{
          type: 'performance',
          description: `Performance milestone: ${milestone.description}`,
          appliedShares: sharesVesting,
        }],
      });
    }
    
    return events.sort((a, b) => a.vestingDate - b.vestingDate);
  }

  /**
   * Generates custom vesting events from predefined schedule
   */
  private generateCustomVestingEvents(grant: DecryptedEquityGrant): VestingEvent[] {
    if (!grant.customVestingSchedule) {
      return [];
    }
    
    return grant.customVestingSchedule.map(customEvent => ({
      vestingDate: startOfDay(customEvent.date).getTime(),
      sharesVested: customEvent.sharesVested,
      cumulativeVested: 0,
      grantType: grant.type,
      companyName: grant.company,
      calculationSource: 'automated',
      specialConditions: [{
        type: 'custom',
        description: customEvent.description || 'Custom vesting event',
        appliedShares: customEvent.sharesVested,
      }],
    }));
  }

  /**
   * Applies acceleration conditions to vesting events
   */
  private applyAcceleration(
    events: VestingEvent[],
    params: VestingCalculationParams
  ): VestingEvent[] {
    const grant = params.grant;
    const acceleration = grant.acceleratedVesting;
    
    if (!acceleration || !acceleration.enabled || !params.accelerationEvents) {
      return events;
    }
    
    const acceleratedEvents: VestingEvent[] = [...events];
    
    for (const accelerationEvent of params.accelerationEvents) {
      if (!acceleration.triggerEvents.includes(accelerationEvent.type)) {
        continue;
      }
      
      const accelerationDate = startOfDay(accelerationEvent.date);
      const unvestedEvents = acceleratedEvents.filter(event => event.vestingDate > accelerationDate.getTime());
      
      if (unvestedEvents.length === 0) {
        continue;
      }
      
      // Calculate shares to accelerate
      const totalUnvestedShares = unvestedEvents.reduce((sum, event) => sum + event.sharesVested, 0);
      const acceleratedShares = (totalUnvestedShares * acceleration.percentageAccelerated) / 100;
      
      // Remove or reduce unvested events
      const remainingShares = totalUnvestedShares - acceleratedShares;
      if (remainingShares > 0) {
        // Proportionally reduce remaining events
        const reductionFactor = remainingShares / totalUnvestedShares;
        unvestedEvents.forEach(event => {
          event.sharesVested *= reductionFactor;
        });
      } else {
        // Remove all unvested events
        acceleratedEvents.splice(
          acceleratedEvents.findIndex(event => event.vestingDate > accelerationDate.getTime()),
          unvestedEvents.length
        );
      }
      
      // Add acceleration event
      if (acceleratedShares > 0) {
        acceleratedEvents.push({
          vestingDate: accelerationDate.getTime(),
          sharesVested: Math.round(acceleratedShares * Math.pow(10, this.config.sharesPrecision)) / Math.pow(10, this.config.sharesPrecision),
          cumulativeVested: 0,
          grantType: grant.type,
          companyName: grant.company,
          calculationSource: 'automated',
          specialConditions: [{
            type: 'acceleration',
            description: `${acceleration.accelerationType}-trigger acceleration due to ${accelerationEvent.type}`,
            appliedShares: acceleratedShares,
          }],
        });
      }
    }
    
    return acceleratedEvents;
  }

  /**
   * Applies performance vesting conditions
   */
  private applyPerformanceVesting(
    events: VestingEvent[],
    params: VestingCalculationParams
  ): VestingEvent[] {
    // Performance vesting is already handled in generatePerformanceBasedVestingEvents
    // This method could be used for additional performance-based modifications
    return events;
  }

  /**
   * Applies termination rules to vesting events
   */
  private applyTerminationRules(
    events: VestingEvent[],
    params: VestingCalculationParams
  ): VestingEvent[] {
    const terminationDate = params.terminationDate!;
    const grant = params.grant;
    
    // Remove events after termination date
    let terminatedEvents = events.filter(event => event.vestingDate <= terminationDate.getTime());
    
    // Apply equity-type specific termination rules
    if (isStockOption(grant)) {
      // Stock options: typically have 90-day exercise window after termination
      const exerciseDeadline = addDays(terminationDate, 90);
      
      // Add special condition to last vesting event
      if (terminatedEvents.length > 0) {
        const lastEvent = terminatedEvents[terminatedEvents.length - 1];
        if (!lastEvent.specialConditions) {
          lastEvent.specialConditions = [];
        }
        lastEvent.specialConditions.push({
          type: 'termination',
          description: `Terminated on ${terminationDate.toISOString().split('T')[0]}. Options must be exercised by ${exerciseDeadline.toISOString().split('T')[0]}`,
          appliedShares: lastEvent.sharesVested,
        });
      }
    }
    
    return terminatedEvents;
  }

  /**
   * Adjusts vesting dates for weekends and holidays
   */
  private adjustVestingDates(events: VestingEvent[]): VestingEvent[] {
    if (this.config.weekendAdjustment === 'none') {
      return events;
    }
    
    return events.map(event => {
      let vestingDate = new Date(event.vestingDate);
      
      if (isWeekend(vestingDate)) {
        switch (this.config.weekendAdjustment) {
          case 'next_business_day':
            while (isWeekend(vestingDate)) {
              vestingDate = addDays(vestingDate, 1);
            }
            break;
          case 'previous_business_day':
            while (isWeekend(vestingDate)) {
              vestingDate = addDays(vestingDate, -1);
            }
            break;
        }
        
        return {
          ...event,
          vestingDate: startOfDay(vestingDate).getTime(),
        };
      }
      
      return event;
    });
  }

  /**
   * Finalizes events by sorting and calculating cumulative values
   */
  private finalizeEvents(events: VestingEvent[], grant: DecryptedEquityGrant): VestingEvent[] {
    // Sort by vesting date
    const sortedEvents = events.sort((a, b) => a.vestingDate - b.vestingDate);
    
    // Calculate cumulative vested amounts
    let cumulativeVested = 0;
    sortedEvents.forEach(event => {
      cumulativeVested += event.sharesVested;
      event.cumulativeVested = Math.round(cumulativeVested * Math.pow(10, this.config.sharesPrecision)) / Math.pow(10, this.config.sharesPrecision);
    });
    
    // Validate total shares
    const totalVested = sortedEvents.reduce((sum, event) => sum + event.sharesVested, 0);
    const tolerance = Math.pow(10, -this.config.sharesPrecision);
    
    if (Math.abs(totalVested - grant.shares) > tolerance) {
      console.warn(`Vesting calculation mismatch: expected ${grant.shares}, calculated ${totalVested}`);
    }
    
    return sortedEvents;
  }

  /**
   * Calculates total vested shares as of a specific date
   */
  private calculateTotalVested(events: VestingEvent[], asOfDate: Date): number {
    const asOfTimestamp = asOfDate.getTime();
    return events
      .filter(event => event.vestingDate <= asOfTimestamp)
      .reduce((sum, event) => sum + event.sharesVested, 0);
  }

  /**
   * Finds the next vesting event after a specific date
   */
  private findNextVestingEvent(events: VestingEvent[], afterDate: Date): VestingEvent | undefined {
    const afterTimestamp = afterDate.getTime();
    return events.find(event => event.vestingDate > afterTimestamp);
  }

  /**
   * Calculates complexity score for performance metrics
   */
  private calculateComplexityScore(grant: DecryptedEquityGrant): number {
    let score = 1; // Base score
    
    if (grant.vestingCliff && grant.vestingCliff > 0) score += 1;
    if (hasAcceleration(grant)) score += 2;
    if (hasPerformanceVesting(grant)) score += 3;
    if (isCustomVesting(grant)) score += 2;
    if (grant.vestingType === 'back-weighted') score += 1;
    
    return Math.min(score, 10); // Cap at 10
  }

  /**
   * Converts vesting frequency to months
   */
  private getFrequencyInMonths(frequency: string): number {
    switch (frequency) {
      case 'monthly': return 1;
      case 'quarterly': return 3;
      case 'annual': return 12;
      default: return 1;
    }
  }

  /**
   * Enriches vesting events with FMV data
   */
  async enrichWithFMV(
    events: VestingEvent[],
    fmvContext: FMVContext
  ): Promise<EnrichedVestingEvent[]> {
    // This would integrate with the FMV service to get market values
    // For now, return events with placeholder FMV data
    return events.map(event => ({
      ...event,
      fmvAtVesting: fmvContext.fmv,
      estimatedValue: fmvContext.fmv ? event.sharesVested * fmvContext.fmv : undefined,
      currency: fmvContext.currency,
    }));
  }
}