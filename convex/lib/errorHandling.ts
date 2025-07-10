/**
 * Comprehensive Error Handling and Recovery System for Vesting Calculations
 * 
 * Provides:
 * - Graceful error handling with detailed logging
 * - Retry logic with exponential backoff
 * - Circuit breaker pattern for preventing cascading failures
 * - Data consistency checks and recovery mechanisms
 */

import { VestingCalculationError, VestingErrorCode } from '../types/equity';

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  jitter: boolean;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number; // milliseconds
  monitoringPeriod: number; // milliseconds
}

export interface ErrorRecoveryOptions {
  enableRetry: boolean;
  retryOptions: RetryOptions;
  enableCircuitBreaker: boolean;
  circuitBreakerConfig: CircuitBreakerConfig;
  enableAuditLogging: boolean;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeout: 60000, // 1 minute
  monitoringPeriod: 300000, // 5 minutes
};

const DEFAULT_ERROR_RECOVERY_OPTIONS: ErrorRecoveryOptions = {
  enableRetry: true,
  retryOptions: DEFAULT_RETRY_OPTIONS,
  enableCircuitBreaker: true,
  circuitBreakerConfig: DEFAULT_CIRCUIT_BREAKER_CONFIG,
  enableAuditLogging: true,
};

export class ErrorHandler {
  private static circuitBreakers = new Map<string, CircuitBreaker>();
  private static errorLog: ErrorLogEntry[] = [];
  private static readonly MAX_LOG_ENTRIES = 1000;

  private options: ErrorRecoveryOptions;

  constructor(options: Partial<ErrorRecoveryOptions> = {}) {
    this.options = { ...DEFAULT_ERROR_RECOVERY_OPTIONS, ...options };
  }

  /**
   * Executes an operation with comprehensive error handling
   */
  async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T> {
    const circuitBreaker = this.getCircuitBreaker(context.operationType);
    
    // Check circuit breaker state
    if (this.options.enableCircuitBreaker && circuitBreaker.isOpen()) {
      const error = new VestingCalculationError(
        `Circuit breaker open for ${context.operationType}`,
        'RATE_LIMIT_EXCEEDED',
        context.grantId,
        context
      );
      this.logError(error, context);
      throw error;
    }

    if (this.options.enableRetry) {
      return await this.executeWithRetry(operation, context, circuitBreaker);
    } else {
      return await this.executeSingle(operation, context, circuitBreaker);
    }
  }

  /**
   * Executes operation with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    circuitBreaker: CircuitBreaker
  ): Promise<T> {
    const { maxAttempts, baseDelay, maxDelay, backoffMultiplier, jitter } = this.options.retryOptions;
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await operation();
        
        // Success - record in circuit breaker
        if (this.options.enableCircuitBreaker) {
          circuitBreaker.recordSuccess();
        }
        
        // Log successful retry if this wasn't the first attempt
        if (attempt > 1) {
          this.logRecovery(context, attempt);
        }
        
        return result;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Record failure in circuit breaker
        if (this.options.enableCircuitBreaker) {
          circuitBreaker.recordFailure();
        }
        
        // Check if we should retry
        if (attempt === maxAttempts || !this.shouldRetry(lastError)) {
          break;
        }
        
        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt, baseDelay, maxDelay, backoffMultiplier, jitter);
        
        console.warn(`Attempt ${attempt} failed for ${context.operationType}, retrying in ${delay}ms:`, lastError.message);
        
        await this.sleep(delay);
      }
    }
    
    // All attempts failed
    const finalError = new VestingCalculationError(
      `Operation failed after ${maxAttempts} attempts: ${lastError?.message}`,
      this.categorizeError(lastError),
      context.grantId,
      { ...context, originalError: lastError }
    );
    
    this.logError(finalError, context);
    throw finalError;
  }

  /**
   * Executes operation without retry
   */
  private async executeSingle<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    circuitBreaker: CircuitBreaker
  ): Promise<T> {
    try {
      const result = await operation();
      
      if (this.options.enableCircuitBreaker) {
        circuitBreaker.recordSuccess();
      }
      
      return result;
      
    } catch (error) {
      if (this.options.enableCircuitBreaker) {
        circuitBreaker.recordFailure();
      }
      
      const wrappedError = error instanceof VestingCalculationError 
        ? error 
        : new VestingCalculationError(
            error instanceof Error ? error.message : String(error),
            this.categorizeError(error),
            context.grantId,
            context
          );
      
      this.logError(wrappedError, context);
      throw wrappedError;
    }
  }

  /**
   * Determines if an error should trigger a retry
   */
  private shouldRetry(error: Error): boolean {
    // Don't retry validation errors or permanent failures
    if (error instanceof VestingCalculationError) {
      const nonRetryableCodes: VestingErrorCode[] = [
        'INVALID_GRANT_DATA',
        'INVALID_DATES',
        'MISSING_PARAMETERS',
      ];
      
      return !nonRetryableCodes.includes(error.code);
    }
    
    // Retry most other errors
    return true;
  }

  /**
   * Categorizes errors into appropriate error codes
   */
  private categorizeError(error: any): VestingErrorCode {
    if (error instanceof VestingCalculationError) {
      return error.code;
    }
    
    const message = error?.message?.toLowerCase() || '';
    
    if (message.includes('decrypt') || message.includes('invalid key')) {
      return 'DECRYPTION_FAILED';
    }
    
    if (message.includes('timeout') || message.includes('time')) {
      return 'PERFORMANCE_TIMEOUT';
    }
    
    if (message.includes('memory') || message.includes('limit')) {
      return 'MEMORY_LIMIT_EXCEEDED';
    }
    
    if (message.includes('rate') || message.includes('too many')) {
      return 'RATE_LIMIT_EXCEEDED';
    }
    
    if (message.includes('invalid') || message.includes('required')) {
      return 'INVALID_GRANT_DATA';
    }
    
    return 'CALCULATION_FAILED';
  }

  /**
   * Calculates delay for exponential backoff with jitter
   */
  private calculateDelay(
    attempt: number,
    baseDelay: number,
    maxDelay: number,
    multiplier: number,
    jitter: boolean
  ): number {
    let delay = baseDelay * Math.pow(multiplier, attempt - 1);
    delay = Math.min(delay, maxDelay);
    
    if (jitter) {
      // Add ±25% jitter to prevent thundering herd
      const jitterAmount = delay * 0.25;
      delay += (Math.random() - 0.5) * 2 * jitterAmount;
    }
    
    return Math.max(delay, 0);
  }

  /**
   * Gets or creates a circuit breaker for an operation type
   */
  private getCircuitBreaker(operationType: string): CircuitBreaker {
    if (!ErrorHandler.circuitBreakers.has(operationType)) {
      ErrorHandler.circuitBreakers.set(
        operationType,
        new CircuitBreaker(this.options.circuitBreakerConfig)
      );
    }
    
    return ErrorHandler.circuitBreakers.get(operationType)!;
  }

  /**
   * Logs error events for audit and monitoring
   */
  private logError(error: VestingCalculationError, context: ErrorContext): void {
    if (!this.options.enableAuditLogging) return;
    
    const logEntry: ErrorLogEntry = {
      timestamp: Date.now(),
      errorCode: error.code,
      message: error.message,
      context,
      stackTrace: error.stack,
    };
    
    ErrorHandler.errorLog.push(logEntry);
    
    // Keep log size manageable
    if (ErrorHandler.errorLog.length > ErrorHandler.MAX_LOG_ENTRIES) {
      ErrorHandler.errorLog.splice(0, ErrorHandler.errorLog.length - ErrorHandler.MAX_LOG_ENTRIES);
    }
    
    console.error(`[ERROR] ${error.code}: ${error.message}`, {
      grantId: error.grantId,
      context: error.context,
    });
  }

  /**
   * Logs successful recovery after retry
   */
  private logRecovery(context: ErrorContext, attempt: number): void {
    if (!this.options.enableAuditLogging) return;
    
    console.info(`[RECOVERY] Operation ${context.operationType} succeeded on attempt ${attempt}`, {
      grantId: context.grantId,
      userId: context.userId,
    });
  }

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets error statistics for monitoring
   */
  static getErrorStats(): ErrorStats {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    
    const recentErrors = ErrorHandler.errorLog.filter(entry => entry.timestamp > oneHourAgo);
    const dailyErrors = ErrorHandler.errorLog.filter(entry => entry.timestamp > oneDayAgo);
    
    const errorsByCode = dailyErrors.reduce((acc, entry) => {
      acc[entry.errorCode] = (acc[entry.errorCode] || 0) + 1;
      return acc;
    }, {} as Record<VestingErrorCode, number>);
    
    const circuitBreakerStats = Array.from(ErrorHandler.circuitBreakers.entries()).map(
      ([operationType, breaker]) => ({
        operationType,
        state: breaker.getState(),
        failureCount: breaker.getFailureCount(),
        lastFailureTime: breaker.getLastFailureTime(),
      })
    );
    
    return {
      totalErrors: ErrorHandler.errorLog.length,
      recentErrors: recentErrors.length,
      dailyErrors: dailyErrors.length,
      errorsByCode,
      circuitBreakerStats,
      topErrors: this.getTopErrors(dailyErrors),
    };
  }

  /**
   * Gets the most common errors
   */
  private static getTopErrors(errors: ErrorLogEntry[]): Array<{ message: string; count: number }> {
    const errorCounts = errors.reduce((acc, entry) => {
      const key = entry.message.substring(0, 100); // Truncate for grouping
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(errorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([message, count]) => ({ message, count }));
  }

  /**
   * Clears old error log entries
   */
  static clearOldErrors(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - olderThanMs;
    const initialLength = ErrorHandler.errorLog.length;
    
    ErrorHandler.errorLog = ErrorHandler.errorLog.filter(entry => entry.timestamp > cutoff);
    
    const removedCount = initialLength - ErrorHandler.errorLog.length;
    if (removedCount > 0) {
      console.log(`Cleared ${removedCount} old error log entries`);
    }
  }

  /**
   * Forces a circuit breaker to open (for testing or emergency)
   */
  static forceCircuitBreakerOpen(operationType: string): void {
    const breaker = ErrorHandler.circuitBreakers.get(operationType);
    if (breaker) {
      breaker.forceOpen();
      console.warn(`Circuit breaker for ${operationType} forced open`);
    }
  }

  /**
   * Resets a circuit breaker (for recovery)
   */
  static resetCircuitBreaker(operationType: string): void {
    const breaker = ErrorHandler.circuitBreakers.get(operationType);
    if (breaker) {
      breaker.reset();
      console.info(`Circuit breaker for ${operationType} reset`);
    }
  }
}

/**
 * Circuit Breaker implementation
 */
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  
  constructor(private config: CircuitBreakerConfig) {}

  isOpen(): boolean {
    if (this.state === 'open') {
      // Check if recovery timeout has passed
      if (Date.now() - this.lastFailureTime > this.config.recoveryTimeout) {
        this.state = 'half-open';
        this.successCount = 0;
        return false;
      }
      return true;
    }
    
    return false;
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      // After a few successes, close the circuit
      if (this.successCount >= 3) {
        this.state = 'closed';
        this.failureCount = 0;
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'half-open') {
      // Failed during recovery, go back to open
      this.state = 'open';
    } else if (this.state === 'closed' && this.failureCount >= this.config.failureThreshold) {
      // Threshold reached, open the circuit
      this.state = 'open';
    }
  }

  forceOpen(): void {
    this.state = 'open';
    this.lastFailureTime = Date.now();
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  getState(): string {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  getLastFailureTime(): number {
    return this.lastFailureTime;
  }
}

// Supporting interfaces
export interface ErrorContext {
  operationType: string;
  grantId?: string;
  userId?: string;
  batchId?: string;
  additionalData?: Record<string, any>;
}

interface ErrorLogEntry {
  timestamp: number;
  errorCode: VestingErrorCode;
  message: string;
  context: ErrorContext;
  stackTrace?: string;
}

interface ErrorStats {
  totalErrors: number;
  recentErrors: number;
  dailyErrors: number;
  errorsByCode: Record<VestingErrorCode, number>;
  circuitBreakerStats: Array<{
    operationType: string;
    state: string;
    failureCount: number;
    lastFailureTime: number;
  }>;
  topErrors: Array<{ message: string; count: number }>;
}