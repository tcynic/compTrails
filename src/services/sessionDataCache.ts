/**
 * Session Data Cache Service
 * 
 * Provides in-memory caching of compensation summaries across page navigation.
 * This enables instant page loads by avoiding repeated decryption of the same data
 * within a single browser session.
 * 
 * Performance benefits:
 * - Instant page navigation (0ms data load times)
 * - Reduced IndexedDB queries
 * - Minimized decryption operations
 * - Maintains data freshness with smart invalidation
 */

import type { CompensationSummary } from '@/hooks/useCompensationSummaries';

interface SessionCacheEntry {
  summaries: CompensationSummary[];
  userId: string;
  cachedAt: number;
  expiresAt: number;
  dataVersion: string; // Hash of data for change detection
}

interface CacheStats {
  hits: number;
  misses: number;
  invalidations: number;
  totalRequests: number;
}

export class SessionDataCache {
  private static instance: SessionDataCache;
  private cache: Map<string, SessionCacheEntry> = new Map();
  private readonly TTL_MS = 10 * 60 * 1000; // 10 minutes (shorter than key cache)
  private readonly MAX_ENTRIES = 5; // Limit memory usage
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    invalidations: 0,
    totalRequests: 0,
  };

  private constructor() {
    // Set up automatic cleanup
    this.startPeriodicCleanup();
    
    // Listen for page unload to log stats
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.logStats();
      });
    }
  }

  static getInstance(): SessionDataCache {
    if (!SessionDataCache.instance) {
      SessionDataCache.instance = new SessionDataCache();
    }
    return SessionDataCache.instance;
  }

  /**
   * Generate cache key for user-specific data
   */
  private generateCacheKey(userId: string): string {
    return `summaries:${userId}`;
  }

  /**
   * Generate data version hash for change detection
   */
  private generateDataVersion(summaries: CompensationSummary[]): string {
    // Create a simple hash based on record count, IDs, and modification times
    const dataString = summaries
      .map(s => `${s.id}:${s.createdAt}:${s.type}`)
      .sort()
      .join('|');
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get cached summaries if available and valid
   */
  getSummaries(userId: string): CompensationSummary[] | null {
    this.stats.totalRequests++;
    
    const cacheKey = this.generateCacheKey(userId);
    const cached = this.cache.get(cacheKey);
    
    if (!cached) {
      this.stats.misses++;
      console.log(`[SessionDataCache] Cache MISS for user ${userId.substring(0, 8)}...`);
      return null;
    }
    
    // Check if expired
    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(cacheKey);
      this.stats.misses++;
      console.log(`[SessionDataCache] Cache EXPIRED for user ${userId.substring(0, 8)}...`);
      return null;
    }
    
    // Check if user matches (safety check)
    if (cached.userId !== userId) {
      this.cache.delete(cacheKey);
      this.stats.misses++;
      console.log(`[SessionDataCache] Cache INVALID USER for ${userId.substring(0, 8)}...`);
      return null;
    }
    
    this.stats.hits++;
    console.log(`[SessionDataCache] Cache HIT for user ${userId.substring(0, 8)}... (${cached.summaries.length} summaries)`);
    return cached.summaries;
  }

  /**
   * Cache summaries for future use
   */
  setSummaries(userId: string, summaries: CompensationSummary[]): void {
    const cacheKey = this.generateCacheKey(userId);
    const now = Date.now();
    const dataVersion = this.generateDataVersion(summaries);
    
    // Check if data actually changed
    const existing = this.cache.get(cacheKey);
    if (existing && existing.dataVersion === dataVersion) {
      // Data hasn't changed, just update expiry
      existing.expiresAt = now + this.TTL_MS;
      console.log(`[SessionDataCache] Data unchanged, refreshed TTL for user ${userId.substring(0, 8)}...`);
      return;
    }
    
    const entry: SessionCacheEntry = {
      summaries: [...summaries], // Clone to prevent mutations
      userId,
      cachedAt: now,
      expiresAt: now + this.TTL_MS,
      dataVersion,
    };
    
    // Enforce memory limits
    if (this.cache.size >= this.MAX_ENTRIES) {
      this.evictOldestEntry();
    }
    
    this.cache.set(cacheKey, entry);
    console.log(`[SessionDataCache] Cached ${summaries.length} summaries for user ${userId.substring(0, 8)}... (version: ${dataVersion})`);
  }

  /**
   * Check if cached data is available for user
   */
  hasCachedSummaries(userId: string): boolean {
    const cacheKey = this.generateCacheKey(userId);
    const cached = this.cache.get(cacheKey);
    
    return !!(cached && 
             cached.expiresAt > Date.now() && 
             cached.userId === userId);
  }

  /**
   * Get data version for cached summaries (for change detection)
   */
  getCachedDataVersion(userId: string): string | null {
    const cacheKey = this.generateCacheKey(userId);
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expiresAt > Date.now() && cached.userId === userId) {
      return cached.dataVersion;
    }
    
    return null;
  }

  /**
   * Invalidate cache for specific user
   */
  invalidateUser(userId: string): void {
    const cacheKey = this.generateCacheKey(userId);
    if (this.cache.delete(cacheKey)) {
      this.stats.invalidations++;
      console.log(`[SessionDataCache] Invalidated cache for user ${userId.substring(0, 8)}...`);
    }
  }

  /**
   * Clear all cached data
   */
  clearAll(): void {
    const entriesCleared = this.cache.size;
    this.cache.clear();
    this.stats.invalidations += entriesCleared;
    console.log(`[SessionDataCache] Cleared all cache (${entriesCleared} entries)`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { 
    cacheSize: number; 
    hitRate: number;
    memoryUsageEstimate: string;
  } {
    const hitRate = this.stats.totalRequests > 0 
      ? (this.stats.hits / this.stats.totalRequests) * 100 
      : 0;
    
    // Rough memory usage estimate
    const avgSummarySize = 200; // bytes per summary (rough estimate)
    const totalSummaries = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.summaries.length, 0);
    const memoryBytes = totalSummaries * avgSummarySize;
    const memoryKB = Math.round(memoryBytes / 1024);
    
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      hitRate: Math.round(hitRate * 100) / 100,
      memoryUsageEstimate: `${memoryKB} KB`,
    };
  }

  /**
   * Remove oldest cache entry to free memory
   */
  private evictOldestEntry(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.cachedAt < oldestTime) {
        oldestTime = entry.cachedAt;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.log(`[SessionDataCache] Evicted oldest entry: ${oldestKey}`);
    }
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startPeriodicCleanup(): void {
    // Only run in browser environment
    if (typeof window === 'undefined') return;
    
    const cleanupInterval = 5 * 60 * 1000; // 5 minutes
    
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, cleanupInterval);
  }

  /**
   * Remove expired cache entries
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      console.log(`[SessionDataCache] Cleaned up ${expiredCount} expired entries`);
    }
  }

  /**
   * Log cache statistics
   */
  private logStats(): void {
    const stats = this.getStats();
    console.log('[SessionDataCache] Session statistics:', {
      requests: stats.totalRequests,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: `${stats.hitRate}%`,
      invalidations: stats.invalidations,
      finalCacheSize: stats.cacheSize,
      memoryUsage: stats.memoryUsageEstimate,
    });
  }
}

// Export singleton instance
export const sessionDataCache = SessionDataCache.getInstance();