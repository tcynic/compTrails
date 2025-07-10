import { addMonths, startOfDay, isAfter, isBefore, differenceInMonths, format } from 'date-fns';
import type { 
  VestingSchedule, 
  VestingCalculationResult, 
  VestingEvent, 
  DecryptedEquityData,
  GrantType 
} from '@/lib/db/types';

export class VestingService {
  /**
   * Calculate all vesting events for an equity grant
   */
  static calculateVestingSchedule(
    equityData: DecryptedEquityData,
    equityGrantId: string
  ): VestingCalculationResult {
    const grantDate = new Date(equityData.grantDate);
    const vestingStart = new Date(equityData.vestingStart);
    const vestingCliff = equityData.vestingCliff || 0;
    const vestingPeriod = equityData.vestingPeriod;
    const vestingFrequency = equityData.vestingFrequency;
    const totalShares = equityData.shares;

    const events = this.generateVestingEvents({
      grantDate,
      vestingStart,
      vestingCliff,
      vestingPeriod,
      vestingFrequency,
      totalShares,
      equityGrantId,
      grantType: equityData.type as GrantType,
      companyName: equityData.company,
    });

    const now = new Date();
    const vestedEvents = events.filter(event => event.vestingDate <= now.getTime());
    const unvestedEvents = events.filter(event => event.vestingDate > now.getTime());

    const totalVested = vestedEvents.reduce((sum, event) => sum + event.sharesVested, 0);
    const totalUnvested = unvestedEvents.reduce((sum, event) => sum + event.sharesVested, 0);

    const nextVestingEvent = unvestedEvents.length > 0 ? unvestedEvents[0] : undefined;

    return {
      events,
      totalVested,
      totalUnvested,
      nextVestingDate: nextVestingEvent ? new Date(nextVestingEvent.vestingDate) : undefined,
      nextVestingShares: nextVestingEvent?.sharesVested,
    };
  }

  /**
   * Generate individual vesting events based on schedule
   */
  private static generateVestingEvents(params: {
    grantDate: Date;
    vestingStart: Date;
    vestingCliff?: number;
    vestingPeriod: number;
    vestingFrequency: 'monthly' | 'quarterly' | 'annual';
    totalShares: number;
    equityGrantId: string;
    grantType: GrantType;
    companyName: string;
  }): VestingEvent[] {
    const {
      grantDate,
      vestingStart,
      vestingCliff = 0,
      vestingPeriod,
      vestingFrequency,
      totalShares,
      equityGrantId,
      grantType,
      companyName,
    } = params;

    const events: VestingEvent[] = [];

    // Calculate cliff date
    const cliffDate = vestingCliff > 0 ? addMonths(vestingStart, vestingCliff) : vestingStart;

    // Calculate vesting frequency in months
    const frequencyMonths = this.getFrequencyMonths(vestingFrequency);

    // Calculate total number of vesting periods
    const totalPeriods = vestingPeriod / frequencyMonths;
    const sharesPerPeriod = totalShares / totalPeriods;

    // Generate vesting events
    let currentDate = cliffDate;
    const endDate = addMonths(vestingStart, vestingPeriod);
    let periodIndex = 0;

    while (isBefore(currentDate, endDate) || currentDate.getTime() === endDate.getTime()) {
      let sharesThisPeriod = sharesPerPeriod;

      // Handle cliff vesting
      if (currentDate.getTime() === cliffDate.getTime() && vestingCliff > 0) {
        // Cliff includes all shares that would have vested up to the cliff date
        const cliffPeriods = vestingCliff / frequencyMonths;
        sharesThisPeriod = sharesPerPeriod * cliffPeriods;
      }

      // Create vesting event
      events.push({
        id: `${equityGrantId}_${periodIndex}`, // Temporary ID for client-side use
        userId: '', // Will be set when saving to database
        equityGrantId,
        vestingDate: startOfDay(currentDate).getTime(),
        sharesVested: Math.round(sharesThisPeriod * 100) / 100, // Round to 2 decimal places
        calculatedAt: Date.now(),
        grantType,
        companyName,
        processed: false,
        calculationSource: 'manual' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Move to next vesting period
      currentDate = addMonths(currentDate, frequencyMonths);
      periodIndex++;
    }

    return events;
  }

  /**
   * Get frequency in months
   */
  private static getFrequencyMonths(frequency: 'monthly' | 'quarterly' | 'annual'): number {
    switch (frequency) {
      case 'monthly':
        return 1;
      case 'quarterly':
        return 3;
      case 'annual':
        return 12;
      default:
        return 1;
    }
  }

  /**
   * Calculate vesting progress percentage
   */
  static calculateVestingProgress(
    grantDate: Date,
    vestingStart: Date,
    vestingPeriod: number,
    currentDate: Date = new Date()
  ): number {
    const vestingEnd = addMonths(vestingStart, vestingPeriod);

    if (isBefore(currentDate, vestingStart)) {
      return 0; // Vesting hasn't started
    }

    if (isAfter(currentDate, vestingEnd)) {
      return 100; // Fully vested
    }

    const totalVestingMonths = vestingPeriod;
    const monthsVested = differenceInMonths(currentDate, vestingStart);

    return Math.min((monthsVested / totalVestingMonths) * 100, 100);
  }

  /**
   * Get upcoming vesting events within specified days
   */
  static getUpcomingVestingEvents(
    events: VestingEvent[],
    daysAhead: number = 30
  ): VestingEvent[] {
    const now = new Date();
    const futureDate = new Date(now.getTime() + (daysAhead * 24 * 60 * 60 * 1000));

    return events
      .filter(event => {
        const eventDate = new Date(event.vestingDate);
        return eventDate >= now && eventDate <= futureDate && !event.processed;
      })
      .sort((a, b) => a.vestingDate - b.vestingDate);
  }

  /**
   * Calculate total vested value with FMV
   */
  static calculateVestedValue(
    events: VestingEvent[],
    currentFMV: number,
    strikePrice?: number
  ): {
    totalShares: number;
    totalValue: number;
    unrealizedGain: number;
  } {
    const vestedEvents = events.filter(event => event.processed);
    const totalShares = vestedEvents.reduce((sum, event) => sum + event.sharesVested, 0);

    let totalValue = totalShares * currentFMV;
    let unrealizedGain = totalValue;

    // For options, subtract the strike price
    if (strikePrice !== undefined) {
      const totalCost = totalShares * strikePrice;
      unrealizedGain = totalValue - totalCost;
    }

    return {
      totalShares,
      totalValue,
      unrealizedGain,
    };
  }

  /**
   * Generate vesting schedule summary
   */
  static generateVestingSummary(
    equityData: DecryptedEquityData,
    currentFMV?: number
  ): {
    schedule: string;
    totalShares: number;
    currentlyVested: number;
    nextVestingDate?: string;
    nextVestingShares?: number;
    estimatedValue?: number;
  } {
    const schedule = this.formatVestingSchedule(equityData);
    const calculation = this.calculateVestingSchedule(equityData, 'temp');

    let estimatedValue: number | undefined;
    if (currentFMV) {
      const valueCalc = this.calculateVestedValue(
        calculation.events,
        currentFMV,
        equityData.strikePrice
      );
      estimatedValue = valueCalc.totalValue;
    }

    return {
      schedule,
      totalShares: equityData.shares,
      currentlyVested: calculation.totalVested,
      nextVestingDate: calculation.nextVestingDate
        ? format(calculation.nextVestingDate, 'MMM dd, yyyy')
        : undefined,
      nextVestingShares: calculation.nextVestingShares,
      estimatedValue,
    };
  }

  /**
   * Format vesting schedule as human-readable string
   */
  static formatVestingSchedule(equityData: DecryptedEquityData): string {
    const { vestingCliff, vestingPeriod, vestingFrequency } = equityData;

    let schedule = `${vestingPeriod} months, ${vestingFrequency} vesting`;

    if (vestingCliff && vestingCliff > 0) {
      schedule += ` with ${vestingCliff}-month cliff`;
    }

    return schedule;
  }

  /**
   * Validate vesting schedule parameters
   */
  static validateVestingSchedule(equityData: Partial<DecryptedEquityData>): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!equityData.shares || equityData.shares <= 0) {
      errors.push('Shares must be greater than 0');
    }

    if (!equityData.grantDate) {
      errors.push('Grant date is required');
    }

    if (!equityData.vestingStart) {
      errors.push('Vesting start date is required');
    }

    if (!equityData.vestingPeriod || equityData.vestingPeriod <= 0) {
      errors.push('Vesting period must be greater than 0');
    }

    if (equityData.vestingCliff && equityData.vestingCliff < 0) {
      errors.push('Vesting cliff cannot be negative');
    }

    if (
      equityData.vestingCliff &&
      equityData.vestingPeriod &&
      equityData.vestingCliff >= equityData.vestingPeriod
    ) {
      errors.push('Vesting cliff must be less than vesting period');
    }

    if (equityData.grantDate && equityData.vestingStart) {
      const grantDate = new Date(equityData.grantDate);
      const vestingStart = new Date(equityData.vestingStart);
      
      if (isAfter(grantDate, vestingStart)) {
        errors.push('Vesting start date cannot be before grant date');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate tax implications for vesting events
   */
  static calculateTaxImplications(
    event: VestingEvent,
    fmvAtVesting: number,
    strikePrice?: number,
    grantType: GrantType = 'RSU'
  ): {
    ordinaryIncome: number;
    capitalGain: number;
    totalTaxableIncome: number;
  } {
    let ordinaryIncome = 0;
    let capitalGain = 0;

    switch (grantType) {
      case 'RSU':
        // RSUs are taxed as ordinary income at vesting
        ordinaryIncome = event.sharesVested * fmvAtVesting;
        break;

      case 'ISO':
        // ISOs: No tax at vesting (AMT may apply)
        // Tax at sale depends on qualifying vs disqualifying disposition
        ordinaryIncome = 0;
        break;

      case 'NSO':
        // NSOs: Ordinary income on exercise (FMV - strike price)
        if (strikePrice !== undefined) {
          ordinaryIncome = event.sharesVested * (fmvAtVesting - strikePrice);
        }
        break;

      case 'ESPP':
        // ESPP: Complex rules depending on discount and holding period
        // Simplified calculation for demonstration
        if (strikePrice !== undefined) {
          const discount = fmvAtVesting - strikePrice;
          ordinaryIncome = event.sharesVested * discount;
        }
        break;
    }

    const totalTaxableIncome = ordinaryIncome + capitalGain;

    return {
      ordinaryIncome,
      capitalGain,
      totalTaxableIncome,
    };
  }
}