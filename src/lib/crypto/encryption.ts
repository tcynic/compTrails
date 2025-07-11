import { EncryptionError } from './types';

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // bytes for GCM mode

export class CryptoUtils {
  /**
   * Generates a cryptographically secure random key for AES-256-GCM encryption
   */
  static async generateKey(): Promise<CryptoKey> {
    try {
      return await crypto.subtle.generateKey(
        {
          name: ALGORITHM,
          length: KEY_LENGTH,
        },
        true, // extractable
        ['encrypt', 'decrypt']
      );
    } catch {
      throw new EncryptionError(
        'Failed to generate encryption key',
        'KEY_GENERATION_FAILED'
      );
    }
  }

  /**
   * Imports a raw key buffer as a CryptoKey for use with Web Crypto API
   */
  static async importKey(keyBuffer: ArrayBuffer): Promise<CryptoKey> {
    try {
      return await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        {
          name: ALGORITHM,
          length: KEY_LENGTH,
        },
        false, // not extractable for security
        ['encrypt', 'decrypt']
      );
    } catch {
      throw new EncryptionError(
        'Failed to import encryption key',
        'KEY_IMPORT_FAILED'
      );
    }
  }

  /**
   * Generates a cryptographically secure random initialization vector
   */
  static generateIV(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  }

  /**
   * Generates a cryptographically secure random salt
   */
  static generateSalt(length: number = 32): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  /**
   * Encrypts data using AES-256-GCM with the provided key
   */
  static async encrypt(
    data: string,
    key: CryptoKey,
    iv?: Uint8Array
  ): Promise<{ encryptedData: ArrayBuffer; iv: Uint8Array }> {
    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const ivBuffer = iv || this.generateIV();

      const encryptedData = await crypto.subtle.encrypt(
        {
          name: ALGORITHM,
          iv: ivBuffer,
        },
        key,
        dataBuffer
      );

      return {
        encryptedData,
        iv: ivBuffer,
      };
    } catch {
      throw new EncryptionError(
        'Failed to encrypt data',
        'ENCRYPTION_FAILED'
      );
    }
  }

  /**
   * Decrypts data using AES-256-GCM with the provided key
   */
  static async decrypt(
    encryptedData: ArrayBuffer,
    key: CryptoKey,
    iv: Uint8Array
  ): Promise<string> {
    try {
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: ALGORITHM,
          iv: iv,
        },
        key,
        encryptedData
      );

      const decoder = new TextDecoder();
      return decoder.decode(decryptedBuffer);
    } catch {
      throw new EncryptionError(
        'Failed to decrypt data - invalid key or corrupted data',
        'DECRYPTION_FAILED'
      );
    }
  }

  /**
   * Converts ArrayBuffer to Base64 string for storage/transmission
   */
  static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Validates if a string is valid base64
   */
  static validateBase64(base64: string): boolean {
    if (!base64 || typeof base64 !== 'string') {
      return false;
    }
    
    // Check for valid base64 characters only
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(base64)) {
      return false;
    }
    
    // Check length is multiple of 4
    if (base64.length % 4 !== 0) {
      return false;
    }
    
    return true;
  }

  /**
   * Sanitizes a base64 string by removing invalid characters and ensuring proper padding
   */
  static sanitizeBase64(base64: string): string {
    if (!base64 || typeof base64 !== 'string') {
      throw new EncryptionError('Invalid base64 input', 'INVALID_BASE64');
    }
    
    // Remove whitespace, line breaks, and other invalid characters
    let sanitized = base64.replace(/[^A-Za-z0-9+/=]/g, '');
    
    // Ensure proper padding
    const remainder = sanitized.length % 4;
    if (remainder > 0) {
      sanitized += '='.repeat(4 - remainder);
    }
    
    return sanitized;
  }

  /**
   * Converts Base64 string back to ArrayBuffer with validation
   */
  static base64ToArrayBuffer(base64: string): ArrayBuffer {
    try {
      // Sanitize the input first
      const sanitized = this.sanitizeBase64(base64);
      
      // Validate the sanitized string
      if (!this.validateBase64(sanitized)) {
        throw new EncryptionError(
          'Invalid base64 string format',
          'INVALID_BASE64'
        );
      }
      
      const binary = atob(sanitized);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    } catch (error) {
      if (error instanceof EncryptionError) {
        throw error;
      }
      
      // Handle specific atob errors
      if (error instanceof DOMException && error.name === 'InvalidCharacterError') {
        throw new EncryptionError(
          'Base64 string contains invalid characters and cannot be decoded',
          'INVALID_BASE64'
        );
      }
      
      throw new EncryptionError(
        `Failed to decode base64 string: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'BASE64_DECODE_FAILED'
      );
    }
  }

  /**
   * Converts Uint8Array to Base64 string
   */
  static uint8ArrayToBase64(uint8Array: Uint8Array): string {
    const buffer = new ArrayBuffer(uint8Array.length);
    new Uint8Array(buffer).set(uint8Array);
    return this.arrayBufferToBase64(buffer);
  }

  /**
   * Converts Base64 string to Uint8Array with validation
   */
  static base64ToUint8Array(base64: string): Uint8Array {
    return new Uint8Array(this.base64ToArrayBuffer(base64));
  }

  /**
   * Securely compares two ArrayBuffers in constant time to prevent timing attacks
   */
  static secureCompare(a: ArrayBuffer, b: ArrayBuffer): boolean {
    if (a.byteLength !== b.byteLength) {
      return false;
    }

    const viewA = new Uint8Array(a);
    const viewB = new Uint8Array(b);
    let result = 0;

    for (let i = 0; i < viewA.length; i++) {
      result |= viewA[i] ^ viewB[i];
    }

    return result === 0;
  }

  /**
   * Compares two Uint8Arrays for equality (useful for comparing salts, IVs, etc.)
   */
  static arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    
    return true;
  }
}