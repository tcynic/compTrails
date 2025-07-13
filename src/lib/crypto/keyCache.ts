/**
 * Key Derivation Cache
 * 
 * Implements secure caching of derived encryption keys to dramatically improve
 * performance by avoiding redundant Argon2 key derivation operations.
 * 
 * Security features:
 * - Keys cached by password hash + salt fingerprint (not raw values)
 * - 15-minute TTL with automatic cleanup
 * - Memory-only storage (no persistence)
 * - Automatic invalidation on authentication changes
 * - Secure cleanup on session timeout
 */

import { CryptoUtils } from './encryption';
import { KeyDerivation } from './keyDerivation';
import type { KeyDerivationParams } from './types';

interface CachedKey {
  key: CryptoKey;
  createdAt: number;
  expiresAt: number;
  lastUsedAt: number;
  usageCount: number;
}

interface CacheStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  keysInCache: number;
  oldestKeyAge: number;
  hitRatePercentage: number;
}

export class KeyDerivationCache {
  private static instance: KeyDerivationCache | null = null;
  private cache = new Map<string, CachedKey>();
  private readonly TTL_MS = 15 * 60 * 1000; // 15 minutes
  private readonly MAX_CACHE_SIZE = 50; // Prevent memory exhaustion
  private cleanupInterval: NodeJS.Timeout | null = null;
  private stats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  private constructor() {
    // Start automatic cleanup
    this.startCleanupTimer();
    
    // Clean up cache when page unloads
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.clearAll();
      });
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): KeyDerivationCache {
    if (!KeyDerivationCache.instance) {
      KeyDerivationCache.instance = new KeyDerivationCache();
    }
    return KeyDerivationCache.instance;
  }

  /**
   * Generate secure cache key from password and salt
   * Uses SHA-256 hash to avoid storing sensitive data directly
   */
  private async generateCacheKey(password: string, salt: Uint8Array): Promise<string> {
    try {
      // Create deterministic fingerprint without storing sensitive data
      const encoder = new TextEncoder();
      const passwordBytes = encoder.encode(password);
      
      // Combine password and salt for unique key
      const combined = new Uint8Array(passwordBytes.length + salt.length);
      combined.set(passwordBytes);
      combined.set(salt, passwordBytes.length);
      
      // Hash the combination to create cache key
      const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
      const hashArray = new Uint8Array(hashBuffer);
      
      // Convert to base64 for map key
      return CryptoUtils.uint8ArrayToBase64(hashArray);
    } catch (error) {
      throw new Error(`Failed to generate cache key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get cached key or derive new one if not available
   * This is the main method that replaces direct KeyDerivation.deriveKey calls
   */
  async getOrDeriveKey(
    password: string,
    salt: Uint8Array,
    params?: Partial<Omit<KeyDerivationParams, 'password' | 'salt'>>
  ): Promise<CryptoKey> {
    this.stats.totalRequests++;
    
    try {
      const cacheKey = await this.generateCacheKey(password, salt);
      const cached = this.cache.get(cacheKey);
      
      // Check if we have a valid cached key
      if (cached && cached.expiresAt > Date.now()) {
        // Update usage statistics
        cached.lastUsedAt = Date.now();
        cached.usageCount++;
        this.stats.cacheHits++;
        
        console.log(`[KeyCache] Cache HIT - Key used ${cached.usageCount} times, age: ${Date.now() - cached.createdAt}ms`);
        return cached.key;
      }
      
      // Cache miss - need to derive key
      this.stats.cacheMisses++;
      console.log(`[KeyCache] Cache MISS - Deriving new key`);
      
      // Remove expired entry if it exists
      if (cached) {
        this.cache.delete(cacheKey);
      }
      
      // Derive new key using existing KeyDerivation service
      const startTime = Date.now();
      const key = await KeyDerivation.deriveKey({
        password,
        salt,
        ...params,
      });
      const derivationTime = Date.now() - startTime;
      
      // Store in cache with TTL
      const cachedKey: CachedKey = {
        key,
        createdAt: Date.now(),
        expiresAt: Date.now() + this.TTL_MS,
        lastUsedAt: Date.now(),
        usageCount: 1,
      };
      
      // Enforce cache size limit
      if (this.cache.size >= this.MAX_CACHE_SIZE) {
        this.evictOldestKey();
      }
      
      this.cache.set(cacheKey, cachedKey);
      
      console.log(`[KeyCache] Key derived and cached in ${derivationTime}ms, TTL: ${this.TTL_MS}ms`);
      return key;
      
    } catch (error) {
      console.error('[KeyCache] Error in getOrDeriveKey:', error);
      // Fallback to direct key derivation on cache errors
      return KeyDerivation.deriveKey({
        password,
        salt,
        ...params,
      });
    }
  }

  /**
   * Clear all cached keys (useful for logout or security reset)
   */
  clearAll(): void {
    console.log(`[KeyCache] Clearing all cached keys (${this.cache.size} keys)`);
    this.cache.clear();
    this.resetStats();
  }

  /**
   * Clear expired keys from cache
   */
  private cleanupExpiredKeys(): void {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [key, cachedKey] of this.cache.entries()) {
      if (cachedKey.expiresAt <= now) {
        this.cache.delete(key);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      console.log(`[KeyCache] Cleaned up ${expiredCount} expired keys`);
    }
  }

  /**
   * Evict oldest key to maintain cache size limit
   */
  private evictOldestKey(): void {
    let oldestKey = '';
    let oldestTime = Date.now();
    
    for (const [key, cachedKey] of this.cache.entries()) {
      if (cachedKey.createdAt < oldestTime) {
        oldestTime = cachedKey.createdAt;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.log(`[KeyCache] Evicted oldest key (age: ${Date.now() - oldestTime}ms)`);
    }
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    // Clean up expired keys every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredKeys();
    }, 5 * 60 * 1000);
  }

  /**
   * Stop cleanup timer (useful for testing or shutdown)
   */
  stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }

  /**
   * Get cache performance statistics
   */
  getStats(): CacheStats {
    const hitRate = this.stats.totalRequests > 0 
      ? (this.stats.cacheHits / this.stats.totalRequests) * 100 
      : 0;
    
    let oldestKeyAge = 0;
    if (this.cache.size > 0) {
      const now = Date.now();
      for (const cachedKey of this.cache.values()) {
        const age = now - cachedKey.createdAt;
        if (age > oldestKeyAge) {
          oldestKeyAge = age;
        }
      }
    }
    
    return {
      totalRequests: this.stats.totalRequests,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
      keysInCache: this.cache.size,
      oldestKeyAge,
      hitRatePercentage: Math.round(hitRate * 100) / 100,
    };
  }

  /**
   * Precompute keys for multiple salts (optimization for batch operations)
   */
  async precomputeKeys(
    password: string,
    salts: Uint8Array[],
    params?: Partial<Omit<KeyDerivationParams, 'password' | 'salt'>>
  ): Promise<Map<string, CryptoKey>> {
    const keyMap = new Map<string, CryptoKey>();
    
    // Use Promise.all for parallel key derivation, but limit concurrency
    const BATCH_SIZE = 5; // Prevent overwhelming the system
    const batches = [];
    
    for (let i = 0; i < salts.length; i += BATCH_SIZE) {
      const batch = salts.slice(i, i + BATCH_SIZE);
      batches.push(batch);
    }
    
    for (const batch of batches) {
      const batchPromises = batch.map(async (salt) => {
        const saltKey = CryptoUtils.uint8ArrayToBase64(salt);
        const key = await this.getOrDeriveKey(password, salt, params);
        return { saltKey, key };
      });
      
      const batchResults = await Promise.all(batchPromises);
      for (const { saltKey, key } of batchResults) {
        keyMap.set(saltKey, key);
      }
    }
    
    console.log(`[KeyCache] Precomputed ${keyMap.size} keys in batches`);
    return keyMap;
  }

  /**
   * Force cache invalidation (useful for password changes)
   */
  invalidateAll(): void {
    console.log('[KeyCache] Force invalidating all cached keys');
    this.clearAll();
  }
}

// Export singleton instance for easy access
export const keyCache = KeyDerivationCache.getInstance();