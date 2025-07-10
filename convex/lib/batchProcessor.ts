/**
 * Batch Processing Service for Vesting Calculations
 * 
 * Handles efficient batch processing of vesting calculations with:
 * - Parallel processing capabilities
 * - Progress tracking and logging
 * - Memory management
 * - Error recovery
 */

import {
  DecryptedEquityGrant,
  VestingBatchRequest,
  VestingBatchResult,
  VestingBatchOptions,
  VestingCalculationResult,
  VestingCalculationError,
  DEFAULT_VESTING_CONFIG,
} from '../types/equity';
import { VestingEngine } from './vestingEngine';
import { ServerDecryptionService } from './serverDecryption';

export class BatchProcessor {
  private static readonly DEFAULT_BATCH_SIZE = 100;
  private static readonly DEFAULT_CONCURRENCY = 10;
  private static readonly MAX_MEMORY_THRESHOLD = 500 * 1024 * 1024; // 500MB

  private cache = new Map<string, VestingCalculationResult>();
  private cacheExpiry = new Map<string, number>();
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes

  /**
   * Processes a batch of vesting calculations
   */
  async processBatch(request: VestingBatchRequest): Promise<VestingBatchResult> {
    const startTime = Date.now();
    const results: Array<{ grantId: string; result: VestingCalculationResult }> = [];
    const errors: Array<{ grantId: string; error: string }> = [];
    
    try {
      console.log(`Starting batch processing for ${request.grants.length} grants (batch ID: ${request.batchId})`);
      
      // Validate batch size
      if (request.grants.length > DEFAULT_VESTING_CONFIG.maxBatchSize) {
        throw new VestingCalculationError(
          `Batch size ${request.grants.length} exceeds maximum ${DEFAULT_VESTING_CONFIG.maxBatchSize}`,
          'MEMORY_LIMIT_EXCEEDED'
        );
      }
      
      // Process grants in chunks to manage memory
      const chunkSize = request.options?.parallelProcessing ? 
        (request.options?.maxConcurrency || BatchProcessor.DEFAULT_CONCURRENCY) :
        BatchProcessor.DEFAULT_BATCH_SIZE;
      
      for (let i = 0; i < request.grants.length; i += chunkSize) {
        const chunk = request.grants.slice(i, i + chunkSize);
        
        // Check memory usage
        await this.checkMemoryUsage();
        
        if (request.options?.parallelProcessing) {
          await this.processChunkParallel(chunk, request, results, errors);
        } else {
          await this.processChunkSequential(chunk, request, results, errors);
        }
        
        // Clean cache periodically
        if (i % (chunkSize * 5) === 0) {
          this.cleanExpiredCache();
        }
        
        console.log(`Processed ${Math.min(i + chunkSize, request.grants.length)}/${request.grants.length} grants`);
      }
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      console.log(`Batch processing completed for ${request.batchId}: ${results.length} successful, ${errors.length} failed in ${processingTime}ms`);
      
      return {
        batchId: request.batchId,
        success: errors.length === 0,
        processedCount: results.length,
        failedCount: errors.length,
        results,
        errors,
        processingTime,
        metadata: {
          startTime,
          endTime,
          averageProcessingTime: results.length > 0 ? processingTime / results.length : 0,
          peakMemoryUsage: this.getCurrentMemoryUsage(),
        },
      };
      
    } catch (error) {
      const endTime = Date.now();
      const errorMessage = error instanceof Error ? error.message : 'Unknown batch processing error';
      
      console.error(`Batch processing failed for ${request.batchId}:`, error);
      
      return {
        batchId: request.batchId,
        success: false,
        processedCount: results.length,
        failedCount: request.grants.length - results.length,
        results,
        errors: [{ grantId: 'batch', error: errorMessage }],
        processingTime: endTime - startTime,
        metadata: {
          startTime,
          endTime,
          averageProcessingTime: 0,
          peakMemoryUsage: this.getCurrentMemoryUsage(),
        },
      };
    }
  }

  /**
   * Processes a chunk of grants in parallel
   */
  private async processChunkParallel(
    chunk: DecryptedEquityGrant[],
    request: VestingBatchRequest,
    results: Array<{ grantId: string; result: VestingCalculationResult }>,
    errors: Array<{ grantId: string; error: string }>
  ): Promise<void> {
    const promises = chunk.map(grant => 
      this.processGrant(grant, request)
        .then(result => ({ grantId: this.getGrantId(grant), result }))
        .catch(error => ({ 
          grantId: this.getGrantId(grant), 
          error: error instanceof Error ? error.message : 'Unknown error' 
        }))
    );
    
    const chunkResults = await Promise.all(promises);
    
    for (const result of chunkResults) {
      if ('result' in result) {
        results.push(result);
      } else {
        errors.push(result);
      }
    }
  }

  /**
   * Processes a chunk of grants sequentially
   */
  private async processChunkSequential(
    chunk: DecryptedEquityGrant[],
    request: VestingBatchRequest,
    results: Array<{ grantId: string; result: VestingCalculationResult }>,
    errors: Array<{ grantId: string; error: string }>
  ): Promise<void> {
    for (const grant of chunk) {
      try {
        const result = await this.processGrant(grant, request);
        results.push({ grantId: this.getGrantId(grant), result });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ grantId: this.getGrantId(grant), error: errorMessage });
      }
    }
  }

  /**
   * Processes a single grant with caching
   */
  private async processGrant(
    grant: DecryptedEquityGrant,
    request: VestingBatchRequest
  ): Promise<VestingCalculationResult> {
    const grantId = this.getGrantId(grant);
    const cacheKey = this.generateCacheKey(grant, request);
    
    // Check cache first
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      console.log(`Using cached result for grant ${grantId}`);
      return cached;
    }
    
    // Create vesting engine
    const vestingEngine = new VestingEngine();
    
    // Calculate vesting
    const result = await vestingEngine.calculateVesting({
      grant,
      calculationDate: request.calculationDate || new Date(),
      includeAcceleration: request.options?.includeAcceleration,
      includePerformance: request.options?.includePerformance,
    });
    
    // Cache successful results
    if (result.success) {
      this.setCachedResult(cacheKey, result);
    }
    
    return result;
  }

  /**
   * Generates a unique cache key for a grant and request
   */
  private generateCacheKey(grant: DecryptedEquityGrant, request: VestingBatchRequest): string {
    const grantHash = this.hashGrant(grant);
    const optionsHash = this.hashOptions(request.options);
    const dateHash = request.calculationDate?.getTime() || Date.now();
    
    return `${grantHash}_${optionsHash}_${dateHash}`;
  }

  /**
   * Creates a hash of grant data for caching
   */
  private hashGrant(grant: DecryptedEquityGrant): string {
    const key = `${grant.company}_${grant.type}_${grant.shares}_${grant.grantDate.getTime()}_${grant.vestingStart.getTime()}_${grant.vestingPeriod}_${grant.vestingFrequency}`;
    return btoa(key).slice(0, 16); // Simple hash
  }

  /**
   * Creates a hash of batch options
   */
  private hashOptions(options?: VestingBatchOptions): string {
    if (!options) return 'default';
    
    const key = `${options.includeAcceleration}_${options.includePerformance}_${options.includeFMV}`;
    return btoa(key).slice(0, 8);
  }

  /**
   * Gets cached result if valid
   */
  private getCachedResult(cacheKey: string): VestingCalculationResult | null {
    const expiry = this.cacheExpiry.get(cacheKey);
    if (!expiry || Date.now() > expiry) {
      this.cache.delete(cacheKey);
      this.cacheExpiry.delete(cacheKey);
      return null;
    }
    
    return this.cache.get(cacheKey) || null;
  }

  /**
   * Sets cached result with expiry
   */
  private setCachedResult(cacheKey: string, result: VestingCalculationResult): void {
    this.cache.set(cacheKey, result);
    this.cacheExpiry.set(cacheKey, Date.now() + this.cacheTimeout);
  }

  /**
   * Cleans expired cache entries
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, expiry] of this.cacheExpiry.entries()) {
      if (now > expiry) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
    }
    
    if (expiredKeys.length > 0) {
      console.log(`Cleaned ${expiredKeys.length} expired cache entries`);
    }
  }

  /**
   * Checks memory usage and cleans cache if needed
   */
  private async checkMemoryUsage(): Promise<void> {
    const currentUsage = this.getCurrentMemoryUsage();
    
    if (currentUsage > BatchProcessor.MAX_MEMORY_THRESHOLD) {
      console.warn(`Memory usage ${currentUsage} exceeds threshold, clearing cache`);
      this.clearCache();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
  }

  /**
   * Gets current memory usage (approximate)
   */
  private getCurrentMemoryUsage(): number {
    // In a real environment, this would use process.memoryUsage() or similar
    // For now, estimate based on cache size
    return this.cache.size * 1000; // Rough estimate
  }

  /**
   * Clears all cached data
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Gets a unique identifier for a grant
   */
  private getGrantId(grant: DecryptedEquityGrant): string {
    return `${grant.company}_${grant.type}_${grant.grantDate.getTime()}`;
  }

  /**
   * Gets cache statistics
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
    memoryUsage: number;
  } {
    return {
      size: this.cache.size,
      hitRate: 0, // Would track this in a real implementation
      memoryUsage: this.getCurrentMemoryUsage(),
    };
  }

  /**
   * Processes grants with FMV enrichment
   */
  async processBatchWithFMV(
    request: VestingBatchRequest,
    fmvLookup: (company: string, date: Date) => Promise<number | null>
  ): Promise<VestingBatchResult> {
    // First process the batch normally
    const batchResult = await this.processBatch(request);
    
    // Then enrich with FMV data if requested
    if (request.options?.includeFMV) {
      for (const result of batchResult.results) {
        try {
          // Find the corresponding grant
          const grant = request.grants.find(g => this.getGrantId(g) === result.grantId);
          if (!grant) continue;
          
          // Enrich events with FMV data
          for (const event of result.result.events) {
            const vestingDate = new Date(event.vestingDate);
            const fmv = await fmvLookup(grant.company, vestingDate);
            
            if (fmv !== null) {
              // Add FMV data to event (would extend interface)
              (event as any).fmvAtVesting = fmv;
              (event as any).estimatedValue = event.sharesVested * fmv;
            }
          }
        } catch (error) {
          console.warn(`Failed to enrich FMV for grant ${result.grantId}:`, error);
        }
      }
    }
    
    return batchResult;
  }

  /**
   * Creates multiple smaller batches from a large request
   */
  static createBatches(
    grants: DecryptedEquityGrant[],
    maxBatchSize: number = BatchProcessor.DEFAULT_BATCH_SIZE,
    baseOptions?: VestingBatchOptions
  ): VestingBatchRequest[] {
    const batches: VestingBatchRequest[] = [];
    
    for (let i = 0; i < grants.length; i += maxBatchSize) {
      const chunk = grants.slice(i, i + maxBatchSize);
      
      batches.push({
        grants: chunk,
        calculationDate: new Date(),
        batchId: `batch_${Date.now()}_${i}`,
        options: baseOptions,
      });
    }
    
    return batches;
  }
}