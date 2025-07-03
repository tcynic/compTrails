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
   * Converts Base64 string back to ArrayBuffer
   */
  static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
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
   * Converts Base64 string to Uint8Array
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
}