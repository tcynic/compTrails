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
import type { DecryptedCompensationRecord } from '@/hooks/useCompensationData';

interface SessionCacheEntry {
  summaries: CompensationSummary[];
  userId: string;
  cachedAt: number;
  expiresAt: number;
  dataVersion: string; // Hash of data for change detection
}

interface FullRecordsCacheEntry {
  records: DecryptedCompensationRecord[];
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
  fullRecordHits: number;
  fullRecordMisses: number;
  fullRecordRequests: number;
}

export class SessionDataCache {
  private static instance: SessionDataCache;
  private cache: Map<string, SessionCacheEntry> = new Map();
  private fullRecordsCache: Map<string, FullRecordsCacheEntry> = new Map();
  private readonly TTL_MS = 10 * 60 * 1000; // 10 minutes (shorter than key cache)
  private readonly FULL_RECORDS_TTL_MS = 15 * 60 * 1000; // 15 minutes for full records
  private readonly MAX_ENTRIES = 5; // Limit memory usage
  private readonly MAX_FULL_RECORD_ENTRIES = 3; // Smaller limit for full records due to size
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    invalidations: 0,
    totalRequests: 0,
    fullRecordHits: 0,
    fullRecordMisses: 0,
    fullRecordRequests: 0,
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
   * Generate cache key for full records
   */
  private generateFullRecordsCacheKey(userId: string): string {
    return `fullRecords:${userId}`;
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
   * Generate data version hash for full records
   */
  private generateFullRecordsDataVersion(records: DecryptedCompensationRecord[]): string {
    // Create a more comprehensive hash for full records
    const dataString = records
      .map(r => `${r.id}:${r.createdAt}:${r.type}:${r.lastModified || r.createdAt}`)
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
   * Get cached full records if available and valid
   */
  getFullRecords(userId: string): DecryptedCompensationRecord[] | null {
    this.stats.fullRecordRequests++;
    
    const cacheKey = this.generateFullRecordsCacheKey(userId);
    const cached = this.fullRecordsCache.get(cacheKey);
    
    if (!cached) {
      this.stats.fullRecordMisses++;
      console.log(`[SessionDataCache] Full records cache MISS for user ${userId.substring(0, 8)}...`);
      return null;
    }
    
    // Check if expired
    if (cached.expiresAt <= Date.now()) {
      this.fullRecordsCache.delete(cacheKey);
      this.stats.fullRecordMisses++;
      console.log(`[SessionDataCache] Full records cache EXPIRED for user ${userId.substring(0, 8)}...`);
      return null;
    }
    
    // Check if user matches (safety check)
    if (cached.userId !== userId) {
      this.fullRecordsCache.delete(cacheKey);
      this.stats.fullRecordMisses++;
      console.log(`[SessionDataCache] Full records cache INVALID USER for ${userId.substring(0, 8)}...`);
      return null;
    }
    
    this.stats.fullRecordHits++;
    console.log(`[SessionDataCache] Full records cache HIT for user ${userId.substring(0, 8)}... (${cached.records.length} records)`);
    return cached.records;
  }

  /**
   * Cache full records for future use
   */
  setFullRecords(userId: string, records: DecryptedCompensationRecord[]): void {
    const cacheKey = this.generateFullRecordsCacheKey(userId);
    const now = Date.now();
    const dataVersion = this.generateFullRecordsDataVersion(records);
    
    // Check if data actually changed
    const existing = this.fullRecordsCache.get(cacheKey);
    if (existing && existing.dataVersion === dataVersion) {
      // Data hasn't changed, just update expiry
      existing.expiresAt = now + this.FULL_RECORDS_TTL_MS;
      console.log(`[SessionDataCache] Full records data unchanged, refreshed TTL for user ${userId.substring(0, 8)}...`);
      return;
    }
    
    const entry: FullRecordsCacheEntry = {
      records: records.map(r => ({ ...r })), // Deep clone to prevent mutations
      userId,
      cachedAt: now,
      expiresAt: now + this.FULL_RECORDS_TTL_MS,
      dataVersion,
    };
    
    // Enforce memory limits for full records
    if (this.fullRecordsCache.size >= this.MAX_FULL_RECORD_ENTRIES) {
      this.evictOldestFullRecordsEntry();
    }
    
    this.fullRecordsCache.set(cacheKey, entry);
    
    // Calculate approximate memory usage
    const avgRecordSize = 1024; // ~1KB per full record (rough estimate)
    const memoryKB = Math.round((records.length * avgRecordSize) / 1024);
    
    console.log(`[SessionDataCache] Cached ${records.length} full records for user ${userId.substring(0, 8)}... (version: ${dataVersion}, ~${memoryKB}KB)`);
  }

  /**
   * Check if cached full records are available for user
   */
  hasCachedFullRecords(userId: string): boolean {
    const cacheKey = this.generateFullRecordsCacheKey(userId);
    const cached = this.fullRecordsCache.get(cacheKey);
    
    return !!(cached && 
             cached.expiresAt > Date.now() && 
             cached.userId === userId);
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
    const summariesCacheKey = this.generateCacheKey(userId);
    const fullRecordsCacheKey = this.generateFullRecordsCacheKey(userId);
    
    let invalidatedCount = 0;
    
    if (this.cache.delete(summariesCacheKey)) {
      invalidatedCount++;
    }
    
    if (this.fullRecordsCache.delete(fullRecordsCacheKey)) {
      invalidatedCount++;
    }
    
    if (invalidatedCount > 0) {
      this.stats.invalidations += invalidatedCount;
      console.log(`[SessionDataCache] Invalidated ${invalidatedCount} cache entries for user ${userId.substring(0, 8)}...`);
    }
  }

  /**
   * Clear all cached data
   */
  clearAll(): void {
    const summariesCleared = this.cache.size;
    const fullRecordsCleared = this.fullRecordsCache.size;
    const totalCleared = summariesCleared + fullRecordsCleared;
    
    this.cache.clear();
    this.fullRecordsCache.clear();
    this.stats.invalidations += totalCleared;
    console.log(`[SessionDataCache] Cleared all cache (${summariesCleared} summaries + ${fullRecordsCleared} full record entries = ${totalCleared} total)`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { 
    cacheSize: number; 
    fullRecordsCacheSize: number;
    hitRate: number;
    fullRecordsHitRate: number;
    memoryUsageEstimate: string;
  } {
    const hitRate = this.stats.totalRequests > 0 
      ? (this.stats.hits / this.stats.totalRequests) * 100 
      : 0;
    
    const fullRecordsHitRate = this.stats.fullRecordRequests > 0
      ? (this.stats.fullRecordHits / this.stats.fullRecordRequests) * 100
      : 0;
    
    // Memory usage estimate for summaries
    const avgSummarySize = 200; // bytes per summary (rough estimate)
    const totalSummaries = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.summaries.length, 0);
    const summariesMemoryBytes = totalSummaries * avgSummarySize;
    
    // Memory usage estimate for full records
    const avgFullRecordSize = 1024; // bytes per full record (rough estimate)
    const totalFullRecords = Array.from(this.fullRecordsCache.values())
      .reduce((sum, entry) => sum + entry.records.length, 0);
    const fullRecordsMemoryBytes = totalFullRecords * avgFullRecordSize;
    
    const totalMemoryBytes = summariesMemoryBytes + fullRecordsMemoryBytes;
    const totalMemoryKB = Math.round(totalMemoryBytes / 1024);
    
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      fullRecordsCacheSize: this.fullRecordsCache.size,
      hitRate: Math.round(hitRate * 100) / 100,
      fullRecordsHitRate: Math.round(fullRecordsHitRate * 100) / 100,
      memoryUsageEstimate: `${totalMemoryKB} KB (${Math.round(summariesMemoryBytes/1024)}KB summaries + ${Math.round(fullRecordsMemoryBytes/1024)}KB full records)`,
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
      console.log(`[SessionDataCache] Evicted oldest summaries entry: ${oldestKey}`);
    }
  }

  /**
   * Remove oldest full records cache entry to free memory
   */
  private evictOldestFullRecordsEntry(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    
    for (const [key, entry] of this.fullRecordsCache.entries()) {
      if (entry.cachedAt < oldestTime) {
        oldestTime = entry.cachedAt;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.fullRecordsCache.delete(oldestKey);
      console.log(`[SessionDataCache] Evicted oldest full records entry: ${oldestKey}`);
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
    let expiredSummariesCount = 0;
    let expiredFullRecordsCount = 0;
    
    // Clean up expired summaries
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
        expiredSummariesCount++;
      }
    }
    
    // Clean up expired full records
    for (const [key, entry] of this.fullRecordsCache.entries()) {
      if (entry.expiresAt <= now) {
        this.fullRecordsCache.delete(key);
        expiredFullRecordsCount++;
      }
    }
    
    const totalExpired = expiredSummariesCount + expiredFullRecordsCount;
    if (totalExpired > 0) {
      console.log(`[SessionDataCache] Cleaned up ${totalExpired} expired entries (${expiredSummariesCount} summaries + ${expiredFullRecordsCount} full records)`);
    }
  }

  /**
   * Log cache statistics
   */
  private logStats(): void {
    const stats = this.getStats();
    console.log('[SessionDataCache] Session statistics:', {
      summariesRequests: stats.totalRequests,
      summariesHits: stats.hits,
      summariesMisses: stats.misses,
      summariesHitRate: `${stats.hitRate}%`,
      fullRecordsRequests: stats.fullRecordRequests,
      fullRecordsHits: stats.fullRecordHits,
      fullRecordsMisses: stats.fullRecordMisses,
      fullRecordsHitRate: `${stats.fullRecordsHitRate}%`,
      invalidations: stats.invalidations,
      finalCacheSize: `${stats.cacheSize} summaries + ${stats.fullRecordsCacheSize} full records`,
      memoryUsage: stats.memoryUsageEstimate,
    });
  }
}

// Export singleton instance
export const sessionDataCache = SessionDataCache.getInstance();