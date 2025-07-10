/**
 * Server-Side Decryption Service for Convex
 * 
 * Provides secure decryption capabilities for equity grant data
 * in the Convex serverless environment with proper security controls.
 */

import { EncryptionError } from './types';

// Constants for encryption/decryption
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // bytes for GCM mode
const SALT_LENGTH = 32; // bytes

// Rate limiting configuration
const RATE_LIMITS = {
  maxDecryptionsPerMinute: 1000,
  maxDecryptionsPerHour: 10000,
  cooldownPeriod: 60000, // 1 minute
};

// In-memory rate limiting store (production should use Redis or similar)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export interface EncryptedData {
  data: string; // Base64 encoded encrypted data
  iv: string; // Base64 encoded initialization vector
  salt: string; // Base64 encoded salt
}

export interface DecryptionResult {
  success: boolean;
  data?: string;
  error?: string;
}

export interface ServerDecryptionOptions {
  skipRateLimit?: boolean;
  auditContext?: {
    userId: string;
    operation: string;
    grantId?: string;
  };
}

/**
 * Server-side decryption service with security controls
 */
export class ServerDecryptionService {
  private static auditLog: Array<{
    timestamp: number;
    userId: string;
    operation: string;
    success: boolean;
    error?: string;
    grantId?: string;
  }> = [];

  /**
   * Decrypts equity grant data using server-side decryption key
   * 
   * @param encryptedData - The encrypted data object
   * @param options - Decryption options including audit context
   * @returns Promise resolving to decryption result
   */
  static async decryptEquityData(
    encryptedData: EncryptedData,
    options: ServerDecryptionOptions = {}
  ): Promise<DecryptionResult> {
    const startTime = Date.now();
    
    try {
      // Validate inputs
      const validation = this.validateEncryptedData(encryptedData);
      if (!validation.isValid) {
        const error = `Invalid encrypted data: ${validation.errors.join(', ')}`;
        this.logAuditEvent(options.auditContext, false, error);
        return { success: false, error };
      }

      // Apply rate limiting (unless skipped)
      if (!options.skipRateLimit) {
        const rateLimitResult = this.checkRateLimit(options.auditContext?.userId || 'anonymous');
        if (!rateLimitResult.allowed) {
          const error = `Rate limit exceeded: ${rateLimitResult.message}`;
          this.logAuditEvent(options.auditContext, false, error);
          return { success: false, error };
        }
      }

      // Get server decryption key
      const serverKey = await this.getServerDecryptionKey();
      if (!serverKey) {
        const error = 'Server decryption key not available';
        this.logAuditEvent(options.auditContext, false, error);
        return { success: false, error };
      }

      // Perform decryption
      const decryptedData = await this.performDecryption(encryptedData, serverKey);
      
      // Parse and validate JSON
      let parsedData;
      try {
        parsedData = JSON.parse(decryptedData);
      } catch (parseError) {
        const error = 'Failed to parse decrypted JSON data';
        this.logAuditEvent(options.auditContext, false, error);
        return { success: false, error };
      }

      // Validate equity data structure
      const dataValidation = this.validateEquityData(parsedData);
      if (!dataValidation.isValid) {
        const error = `Invalid equity data structure: ${dataValidation.errors.join(', ')}`;
        this.logAuditEvent(options.auditContext, false, error);
        return { success: false, error };
      }

      // Log successful decryption
      this.logAuditEvent(options.auditContext, true);
      
      return {
        success: true,
        data: JSON.stringify(parsedData),
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown decryption error';
      this.logAuditEvent(options.auditContext, false, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Validates encrypted data structure and format
   */
  private static validateEncryptedData(data: EncryptedData): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!data) {
      errors.push('Encrypted data object is required');
      return { isValid: false, errors };
    }

    // Validate required fields
    if (!data.data || typeof data.data !== 'string') {
      errors.push('Encrypted data field is required and must be a string');
    }

    if (!data.iv || typeof data.iv !== 'string') {
      errors.push('IV field is required and must be a string');
    }

    if (!data.salt || typeof data.salt !== 'string') {
      errors.push('Salt field is required and must be a string');
    }

    // Validate base64 format
    if (data.data && !this.isValidBase64(data.data)) {
      errors.push('Encrypted data must be valid base64');
    }

    if (data.iv && !this.isValidBase64(data.iv)) {
      errors.push('IV must be valid base64');
    }

    if (data.salt && !this.isValidBase64(data.salt)) {
      errors.push('Salt must be valid base64');
    }

    // Validate lengths after base64 decoding
    try {
      if (data.iv) {
        const ivBuffer = this.base64ToArrayBuffer(data.iv);
        if (ivBuffer.byteLength !== IV_LENGTH) {
          errors.push(`IV must be ${IV_LENGTH} bytes`);
        }
      }

      if (data.salt) {
        const saltBuffer = this.base64ToArrayBuffer(data.salt);
        if (saltBuffer.byteLength !== SALT_LENGTH) {
          errors.push(`Salt must be ${SALT_LENGTH} bytes`);
        }
      }
    } catch {
      errors.push('Failed to decode base64 data');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates decrypted equity data structure
   */
  private static validateEquityData(data: any): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
      errors.push('Equity data must be an object');
      return { isValid: false, errors };
    }

    // Required fields
    const requiredFields = ['company', 'type', 'shares', 'grantDate', 'vestingStart', 'vestingPeriod', 'vestingFrequency'];
    
    for (const field of requiredFields) {
      if (!(field in data)) {
        errors.push(`Required field '${field}' is missing`);
      }
    }

    // Field type validation
    if (data.company && typeof data.company !== 'string') {
      errors.push('Company must be a string');
    }

    if (data.type && !['ISO', 'NSO', 'RSU', 'ESPP', 'other'].includes(data.type)) {
      errors.push('Type must be one of: ISO, NSO, RSU, ESPP, other');
    }

    if (data.shares && (typeof data.shares !== 'number' || data.shares <= 0)) {
      errors.push('Shares must be a positive number');
    }

    if (data.strikePrice !== undefined && (typeof data.strikePrice !== 'number' || data.strikePrice < 0)) {
      errors.push('Strike price must be a non-negative number');
    }

    if (data.vestingCliff !== undefined && (typeof data.vestingCliff !== 'number' || data.vestingCliff < 0)) {
      errors.push('Vesting cliff must be a non-negative number');
    }

    if (data.vestingPeriod && (typeof data.vestingPeriod !== 'number' || data.vestingPeriod <= 0)) {
      errors.push('Vesting period must be a positive number');
    }

    if (data.vestingFrequency && !['monthly', 'quarterly', 'annual'].includes(data.vestingFrequency)) {
      errors.push('Vesting frequency must be one of: monthly, quarterly, annual');
    }

    // Date validation
    const dateFields = ['grantDate', 'vestingStart'];
    for (const field of dateFields) {
      if (data[field]) {
        const date = new Date(data[field]);
        if (isNaN(date.getTime())) {
          errors.push(`${field} must be a valid date`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Gets the server decryption key from environment variables
   */
  private static async getServerDecryptionKey(): Promise<CryptoKey | null> {
    try {
      // In production, this would be retrieved from secure environment variables
      // For now, we'll use a development key (this should be replaced with actual env var)
      const serverKeyHex = process.env.CONVEX_SERVER_ENCRYPTION_KEY;
      
      if (!serverKeyHex) {
        console.error('CONVEX_SERVER_ENCRYPTION_KEY environment variable not set');
        return null;
      }

      // Convert hex string to ArrayBuffer
      const keyBuffer = this.hexToArrayBuffer(serverKeyHex);
      
      // Import the key for use with Web Crypto API
      return await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        {
          name: ALGORITHM,
          length: KEY_LENGTH,
        },
        false, // not extractable for security
        ['decrypt']
      );
    } catch (error) {
      console.error('Failed to get server decryption key:', error);
      return null;
    }
  }

  /**
   * Performs the actual AES-GCM decryption
   */
  private static async performDecryption(
    encryptedData: EncryptedData,
    key: CryptoKey
  ): Promise<string> {
    try {
      // Decode base64 data
      const dataBuffer = this.base64ToArrayBuffer(encryptedData.data);
      const iv = new Uint8Array(this.base64ToArrayBuffer(encryptedData.iv));

      // Decrypt the data
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: ALGORITHM,
          iv: iv,
        },
        key,
        dataBuffer
      );

      // Convert to string
      return new TextDecoder().decode(decryptedBuffer);
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Rate limiting check
   */
  private static checkRateLimit(identifier: string): {
    allowed: boolean;
    message?: string;
  } {
    const now = Date.now();
    const key = `decrypt:${identifier}`;
    
    // Clean up expired entries
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetTime < now) {
        rateLimitStore.delete(k);
      }
    }

    const current = rateLimitStore.get(key);
    
    if (!current) {
      // First request
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + RATE_LIMITS.cooldownPeriod,
      });
      return { allowed: true };
    }

    if (current.resetTime < now) {
      // Reset period expired
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + RATE_LIMITS.cooldownPeriod,
      });
      return { allowed: true };
    }

    // Check limits
    if (current.count >= RATE_LIMITS.maxDecryptionsPerMinute) {
      return {
        allowed: false,
        message: `Rate limit exceeded: ${current.count} decryptions in the last minute`,
      };
    }

    // Increment counter
    current.count++;
    return { allowed: true };
  }

  /**
   * Logs audit events for security monitoring
   */
  private static logAuditEvent(
    context: ServerDecryptionOptions['auditContext'],
    success: boolean,
    error?: string
  ): void {
    const event = {
      timestamp: Date.now(),
      userId: context?.userId || 'anonymous',
      operation: context?.operation || 'decrypt_equity_data',
      success,
      error,
      grantId: context?.grantId,
    };

    this.auditLog.push(event);
    
    // Keep only last 1000 entries to prevent memory issues
    if (this.auditLog.length > 1000) {
      this.auditLog.splice(0, this.auditLog.length - 1000);
    }

    // Log to console for debugging (in production, this would go to proper logging system)
    if (success) {
      console.log(`[AUDIT] Successful decryption for user ${event.userId}`);
    } else {
      console.error(`[AUDIT] Failed decryption for user ${event.userId}: ${error}`);
    }
  }

  /**
   * Gets audit log entries (for monitoring and debugging)
   */
  static getAuditLog(limit = 100): typeof ServerDecryptionService.auditLog {
    return this.auditLog.slice(-limit);
  }

  /**
   * Utility function to validate base64 strings
   */
  private static isValidBase64(str: string): boolean {
    try {
      // Check if string is valid base64
      const decoded = atob(str);
      const reencoded = btoa(decoded);
      return reencoded === str;
    } catch {
      return false;
    }
  }

  /**
   * Converts base64 string to ArrayBuffer
   */
  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Converts hex string to ArrayBuffer
   */
  private static hexToArrayBuffer(hex: string): ArrayBuffer {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes.buffer;
  }

  /**
   * Gets decryption statistics for monitoring
   */
  static getDecryptionStats(): {
    totalAttempts: number;
    successfulDecryptions: number;
    failedDecryptions: number;
    successRate: number;
    recentErrors: string[];
  } {
    const totalAttempts = this.auditLog.length;
    const successful = this.auditLog.filter(entry => entry.success).length;
    const failed = totalAttempts - successful;
    const successRate = totalAttempts > 0 ? (successful / totalAttempts) * 100 : 0;
    
    const recentErrors = this.auditLog
      .filter(entry => !entry.success && entry.error)
      .slice(-10)
      .map(entry => entry.error!);

    return {
      totalAttempts,
      successfulDecryptions: successful,
      failedDecryptions: failed,
      successRate,
      recentErrors,
    };
  }
}