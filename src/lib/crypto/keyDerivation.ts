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
      console.warn('WebAssembly not supported, falling back to enhanced PBKDF2');
      return this.getPBKDF2Fallback();
    }

    try {
      // Configure the WASM path to point to the public directory
      // This prevents the library from trying to use the Node.js require path
      // which causes base64 decoding errors
      const global = globalThis as any;
      
      // Set the WASM path configuration BEFORE importing the module
      global.argon2WasmPath = '/argon2.wasm';
      global.argon2SimdWasmPath = '/argon2-simd.wasm';
      
      // Force argon2-browser to use browser environment detection
      // This prevents it from detecting 'require' and using Node.js code paths
      global.process = global.process || {};
      global.process.browser = true;
      global.process.env = global.process.env || {};
      global.process.env.NODE_ENV = 'development';
      
      // Override the WASM binary loader to force using fetch instead of require
      // This prevents the base64 decoding issue entirely
      global.loadArgon2WasmBinary = async () => {
        console.log('Loading WASM via custom fetch handler');
        try {
          const response = await fetch('/argon2.wasm');
          if (!response.ok) {
            throw new Error(`Failed to load WASM: ${response.status} ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          console.log('WASM file loaded successfully via fetch');
          return new Uint8Array(arrayBuffer);
        } catch (error) {
          console.error('Custom WASM loader failed:', error);
          throw error;
        }
      };
      
      // Override the environment detection to force browser mode
      global.loadArgon2WasmModule = async () => {
        console.log('Loading Argon2 WASM module in browser mode');
        return await WebAssembly.instantiate(await global.loadArgon2WasmBinary());
      };
      
      // Import argon2-browser with proper destructuring
      const { hash } = await import('argon2-browser');
      
      if (typeof hash !== 'function') {
        throw new Error('Argon2 hash function not available');
      }
      
      console.log('Successfully loaded Argon2 - using secure key derivation');
      
      // Return a wrapper that handles the argon2-browser API
      return async (options: HashOptions) => {
        try {
          console.log('Calling Argon2 hash with options:', {
            type: options.type,
            mem: options.mem,
            time: options.time,
            parallelism: options.parallelism,
            hashLen: options.hashLen
          });
          
          const result = await hash(options);
          console.log('Argon2 hash completed successfully');
          return result;
        } catch (argon2Error) {
          console.error('Argon2 hashing failed:', argon2Error);
          
          // Check if it's a base64 decoding error specifically
          if (argon2Error instanceof Error && argon2Error.message.includes('atob')) {
            console.error('Base64 decoding error detected - WASM loading issue');
            console.error('This usually indicates that the WASM file path is incorrect or the file is corrupted');
          } else if (argon2Error instanceof Error && argon2Error.message.includes('Failed to load WASM')) {
            console.error('WASM loading failed - check that /argon2.wasm is accessible');
          }
          
          console.warn('Falling back to PBKDF2 due to Argon2 error');
          // Fallback to PBKDF2 if Argon2 hash fails at runtime
          const fallback = this.getPBKDF2Fallback();
          return await fallback(options);
        }
      };
    } catch (importError) {
      console.error('Failed to load Argon2 module:', importError);
      
      // Check if it's a base64 decoding error during import
      if (importError instanceof Error && importError.message.includes('atob')) {
        console.error('Base64 decoding error during Argon2 import - WASM loading issue');
        console.error('This usually indicates that the WASM file path is incorrect or the file is corrupted');
      } else if (importError instanceof Error && importError.message.includes('Failed to load WASM')) {
        console.error('WASM loading failed during import - check that /argon2.wasm is accessible');
      }
      
      console.warn('Falling back to enhanced PBKDF2');
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
}