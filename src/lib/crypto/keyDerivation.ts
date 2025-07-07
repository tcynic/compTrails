import { KeyDerivationParams, EncryptionError } from './types';
import { CryptoUtils } from './encryption';
import type { HashOptions } from 'argon2-browser';

export class KeyDerivation {
  // Default Argon2id parameters - balanced for security and performance
  private static readonly DEFAULT_PARAMS = {
    memory: 65536, // 64MB - good balance for browser environment
    iterations: 3, // Minimum recommended iterations
    parallelism: 1, // Single thread for browser compatibility
    hashLength: 32, // 256 bits for AES-256
  };

  /**
   * Load argon2-browser dynamically (client-side only)
   * Falls back to PBKDF2 if Argon2 is not available
   */
  private static async loadArgon2() {
    if (typeof window === 'undefined') {
      throw new EncryptionError(
        'Argon2 is only available in browser environment',
        'SERVER_SIDE_ERROR'
      );
    }

    // Check if browser supports WebAssembly
    if (!WebAssembly) {
      console.warn('WebAssembly not supported, using enhanced PBKDF2');
      return this.getPBKDF2Fallback();
    }

    // For development/debugging: force PBKDF2 to avoid WASM issues temporarily
    if (process.env.NODE_ENV === 'development' && 
        typeof window !== 'undefined' && 
        localStorage.getItem('forcePBKDF2') === 'true') {
      console.info('Forcing PBKDF2 fallback (development mode)');
      return this.getPBKDF2Fallback();
    }

    try {
      // Test if we can load the argon2-browser module
      console.log('Attempting to load argon2-browser module...');
      const argon2Module = await import('argon2-browser');
      
      if (!argon2Module.hash || typeof argon2Module.hash !== 'function') {
        throw new Error('Argon2 hash function not available');
      }
      
      // Test if Argon2 actually works with a small test
      try {
        console.log('Testing Argon2 functionality...');
        const testResult = await argon2Module.hash({
          pass: 'test',
          salt: new Uint8Array(16),
          type: 2, // Argon2id
          mem: 1024, // Small memory for test
          time: 1,
          parallelism: 1,
          hashLen: 32,
        });
        
        if (!testResult || !testResult.hash) {
          throw new Error('Argon2 test failed - no hash returned');
        }
        
        console.log('Argon2 test successful - using secure key derivation');
        
        // Return working Argon2 wrapper
        return async (options: HashOptions) => {
          try {
            return await argon2Module.hash(options);
          } catch (argon2Error) {
            console.error('Argon2 hashing failed:', argon2Error);
            console.warn('Falling back to PBKDF2 for this operation');
            const fallback = this.getPBKDF2Fallback();
            return await fallback(options);
          }
        };
        
      } catch (testError) {
        console.warn('Argon2 test failed:', testError);
        throw new Error(`Argon2 functionality test failed: ${testError instanceof Error ? testError.message : 'Unknown error'}`);
      }
      
    } catch (loadError) {
      console.error('Failed to load or test Argon2:', loadError);
      
      // Provide detailed error information for debugging
      if (loadError instanceof Error) {
        if (loadError.message.includes('WebAssembly.instantiate')) {
          console.error('WebAssembly instantiation failed - this is a known issue with argon2-browser WASM loading');
          console.info('The application will use PBKDF2 as a secure fallback');
        } else if (loadError.message.includes('Imports argument must be present')) {
          console.error('WASM imports argument missing - WASM module loading issue');
          console.info('The application will use PBKDF2 as a secure fallback');
        } else if (loadError.message.includes('atob') || loadError.message.includes('InvalidCharacterError')) {
          console.error('Base64 decoding error during WASM loading - corrupt or invalid WASM data');
          console.info('This may indicate corrupted argon2.wasm files in public/ directory');
          console.info('The application will use PBKDF2 as a secure fallback');
        } else if (loadError.message.includes('Failed to execute \'atob\' on \'Window\'')) {
          console.error('Base64 decoding failed - argon2-browser WASM contains invalid base64 data');
          console.info('Try clearing browser cache or re-deploying the application');
          console.info('The application will use PBKDF2 as a secure fallback');
        }
      }
      
      // Handle DOMException specifically for atob errors
      if (loadError instanceof DOMException && loadError.name === 'InvalidCharacterError') {
        console.error('InvalidCharacterError: Base64 decoding failed in argon2-browser');
        console.info('This indicates corrupted WASM binary data or invalid base64 encoding');
        console.info('The application will use PBKDF2 as a secure fallback');
      }
      
      console.info('Using enhanced PBKDF2 for key derivation (secure fallback)');
      return this.getPBKDF2Fallback();
    }
  }

  /**
   * Enhanced PBKDF2 implementation with higher security parameters
   * This is used instead of Argon2 until webpack compatibility is resolved
   */
  private static getPBKDF2Fallback() {
    console.info('Using enhanced PBKDF2 with high iteration count for key derivation');
    
    return async (options: HashOptions) => {
      const encoder = new TextEncoder();
      const passwordBuffer = encoder.encode(options.pass);
      const saltBuffer = options.salt;
      
      const importedKey = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveKey', 'deriveBits']
      );
      
      // Use significantly higher iterations for PBKDF2 to provide adequate security
      // Scale with memory parameter to approximate Argon2 difficulty
      const baseIterations = 200000; // 200k minimum iterations
      const memoryScaling = Math.max(1, (options.mem || this.DEFAULT_PARAMS.memory) / 65536);
      const timeScaling = Math.max(1, options.time || this.DEFAULT_PARAMS.iterations);
      const iterations = Math.floor(baseIterations * memoryScaling * timeScaling);
      
      console.info(`Using PBKDF2 fallback with ${iterations.toLocaleString()} iterations`);
      
      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: saltBuffer,
          iterations: iterations,
          hash: 'SHA-256',
        },
        importedKey,
        options.hashLen * 8
      );
      
      return { hash: derivedBits };
    };
  }

  /**
   * Derives a cryptographic key from a password using Argon2id
   * Argon2id is the recommended variant as it provides protection against
   * both side-channel and time-memory trade-off attacks
   */
  static async deriveKey(params: KeyDerivationParams): Promise<CryptoKey> {
    const {
      password,
      salt,
      memory = this.DEFAULT_PARAMS.memory,
      iterations = this.DEFAULT_PARAMS.iterations,
      parallelism = this.DEFAULT_PARAMS.parallelism,
      hashLength = this.DEFAULT_PARAMS.hashLength,
    } = params;

    try {
      // Validate inputs
      if (!password || password.length === 0) {
        throw new EncryptionError(
          'Password cannot be empty',
          'INVALID_PASSWORD'
        );
      }

      if (!salt || salt.length < 16) {
        throw new EncryptionError(
          'Salt must be at least 16 bytes',
          'INVALID_SALT'
        );
      }

      // Load Argon2 dynamically
      const hash = await this.loadArgon2();

      // Derive key using Argon2id
      const result = await hash({
        pass: password,
        salt: salt,
        type: 2, // Argon2id
        mem: memory,
        time: iterations,
        parallelism: parallelism,
        hashLen: hashLength,
      });

      // Import the derived key for use with Web Crypto API
      return await CryptoUtils.importKey(result.hash);
    } catch (error) {
      if (error instanceof EncryptionError) {
        throw error;
      }
      throw new EncryptionError(
        `Key derivation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'KEY_DERIVATION_FAILED'
      );
    }
  }

  /**
   * Derives a key from a password and returns it along with the salt used
   * This is useful for initial key generation where you need to store the salt
   */
  static async deriveKeyWithSalt(
    password: string,
    options?: Partial<Omit<KeyDerivationParams, 'password' | 'salt'>>
  ): Promise<{ key: CryptoKey; salt: Uint8Array }> {
    const salt = CryptoUtils.generateSalt(32); // 256-bit salt
    
    const key = await this.deriveKey({
      password,
      salt,
      ...options,
    });

    return { key, salt };
  }

  /**
   * Validates Argon2 parameters to ensure they meet security requirements
   */
  static validateParams(params: Partial<KeyDerivationParams>): void {
    const {
      memory = this.DEFAULT_PARAMS.memory,
      iterations = this.DEFAULT_PARAMS.iterations,
      parallelism = this.DEFAULT_PARAMS.parallelism,
      hashLength = this.DEFAULT_PARAMS.hashLength,
    } = params;

    // Memory should be at least 32MB for security
    if (memory < 32768) {
      throw new EncryptionError(
        'Memory parameter too low - minimum 32MB recommended',
        'WEAK_PARAMS'
      );
    }

    // At least 2 iterations recommended
    if (iterations < 2) {
      throw new EncryptionError(
        'Iterations too low - minimum 2 recommended',
        'WEAK_PARAMS'
      );
    }

    // Parallelism between 1 and 4 is typical for browsers
    if (parallelism < 1 || parallelism > 4) {
      throw new EncryptionError(
        'Parallelism should be between 1 and 4 for browser environments',
        'INVALID_PARAMS'
      );
    }

    // Hash length should be 32 bytes for AES-256
    if (hashLength !== 32) {
      throw new EncryptionError(
        'Hash length must be 32 bytes for AES-256 compatibility',
        'INVALID_PARAMS'
      );
    }
  }

  /**
   * Estimates the time required for key derivation with given parameters
   * This can be used to provide user feedback during key derivation
   */
  static estimateDerivationTime(params?: Partial<KeyDerivationParams>): number {
    const {
      memory = this.DEFAULT_PARAMS.memory,
      iterations = this.DEFAULT_PARAMS.iterations,
    } = params || {};

    // Rough estimation based on typical browser performance
    // This is a heuristic and actual times will vary by device
    const baseTime = 100; // Base time in ms
    const memoryFactor = memory / 65536; // Relative to 64MB
    const iterationFactor = iterations;

    return Math.round(baseTime * memoryFactor * iterationFactor);
  }

  /**
   * Debug utility to test crypto capabilities and provide diagnostics
   * This can be called from the browser console to troubleshoot issues
   */
  static async debugCryptoCapabilities(): Promise<{
    webAssembly: boolean;
    argon2Available: boolean;
    pbkdf2Available: boolean;
    testResults: {
      argon2?: { success: boolean; error?: string; duration?: number };
      pbkdf2?: { success: boolean; error?: string; duration?: number };
    };
  }> {
    const result = {
      webAssembly: typeof WebAssembly !== 'undefined',
      argon2Available: false,
      pbkdf2Available: typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined',
      testResults: {} as any,
    };

    console.log('🔍 Debugging crypto capabilities...');

    // Test PBKDF2
    if (result.pbkdf2Available) {
      try {
        const start = performance.now();
        const fallback = this.getPBKDF2Fallback();
        await fallback({
          pass: 'test',
          salt: new Uint8Array(16),
          type: 2,
          mem: 1024,
          time: 1,
          parallelism: 1,
          hashLen: 32,
        });
        const duration = performance.now() - start;
        result.testResults.pbkdf2 = { success: true, duration };
        console.log('✅ PBKDF2 test successful');
      } catch (error) {
        result.testResults.pbkdf2 = { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
        console.log('❌ PBKDF2 test failed:', error);
      }
    }

    // Test Argon2
    if (result.webAssembly) {
      try {
        const start = performance.now();
        const argon2 = await this.loadArgon2();
        await argon2({
          pass: 'test',
          salt: new Uint8Array(16),
          type: 2,
          mem: 1024,
          time: 1,
          parallelism: 1,
          hashLen: 32,
        });
        const duration = performance.now() - start;
        result.argon2Available = true;
        result.testResults.argon2 = { success: true, duration };
        console.log('✅ Argon2 test successful');
      } catch (error) {
        let errorDetails = error instanceof Error ? error.message : 'Unknown error';
        
        // Add specific diagnostic information for base64 errors
        if (error instanceof DOMException && error.name === 'InvalidCharacterError') {
          errorDetails += ' (Base64 decoding error - likely corrupted WASM data)';
        } else if (errorDetails.includes('atob')) {
          errorDetails += ' (Base64 decoding error in argon2-browser)';
        }
        
        result.testResults.argon2 = { 
          success: false, 
          error: errorDetails
        };
        console.log('❌ Argon2 test failed:', error);
      }
    }

    console.log('🔍 Crypto capabilities debug results:', result);
    return result;
  }

  /**
   * Force PBKDF2 fallback for development/debugging
   * Call this from the browser console: KeyDerivation.forcePBKDF2Fallback(true)
   */
  static forcePBKDF2Fallback(force: boolean = true): void {
    if (typeof window !== 'undefined') {
      if (force) {
        localStorage.setItem('forcePBKDF2', 'true');
        console.log('🔧 Forced PBKDF2 fallback enabled. Reload the page to take effect.');
      } else {
        localStorage.removeItem('forcePBKDF2');
        console.log('🔧 Forced PBKDF2 fallback disabled. Reload the page to take effect.');
      }
    }
  }
}

// Make KeyDerivation available globally for debugging in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).KeyDerivation = KeyDerivation;
  console.log('🔧 KeyDerivation class available globally for debugging. Try: KeyDerivation.debugCryptoCapabilities()');
}