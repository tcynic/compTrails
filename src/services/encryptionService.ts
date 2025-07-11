import { CryptoUtils } from '@/lib/crypto/encryption';
import { KeyDerivation } from '@/lib/crypto/keyDerivation';
import {
  EncryptedData,
  EncryptionOptions,
  DecryptionResult,
  EncryptionError,
} from '@/lib/crypto/types';

export class EncryptionService {
  /**
   * Encrypts data using password-based encryption with Argon2id key derivation
   * and AES-256-GCM encryption
   */
  static async encryptData(
    data: string,
    password: string,
    options?: EncryptionOptions
  ): Promise<EncryptedData> {
    try {
      // Validate inputs
      if (!data) {
        throw new EncryptionError('Data cannot be empty', 'INVALID_INPUT');
      }

      if (!password || password.length < 8) {
        throw new EncryptionError(
          'Password must be at least 8 characters long',
          'WEAK_PASSWORD'
        );
      }

      // Generate salt for key derivation
      const salt = CryptoUtils.generateSalt(32);

      // Derive encryption key from password
      const key = await KeyDerivation.deriveKey({
        password,
        salt,
        ...options?.keyDerivationParams,
      });

      // Encrypt the data
      const { encryptedData, iv } = await CryptoUtils.encrypt(data, key);

      // Return encrypted data in a portable format
      return {
        encryptedData: CryptoUtils.arrayBufferToBase64(encryptedData),
        iv: CryptoUtils.uint8ArrayToBase64(iv),
        salt: CryptoUtils.uint8ArrayToBase64(salt),
        algorithm: 'AES-GCM',
        keyDerivation: 'Argon2id',
      };
    } catch (error) {
      if (error instanceof EncryptionError) {
        throw error;
      }
      throw new EncryptionError(
        `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ENCRYPTION_FAILED'
      );
    }
  }

  /**
   * Decrypts data that was encrypted with encryptData
   */
  static async decryptData(
    encryptedData: EncryptedData,
    password: string,
    options?: EncryptionOptions
  ): Promise<DecryptionResult> {
    try {
      // Validate inputs
      if (!encryptedData || !password) {
        return {
          data: '',
          success: false,
          error: 'Invalid encrypted data or password',
        };
      }

      // Validate encrypted data structure and format
      const validation = this.validateEncryptedData(encryptedData);
      if (!validation.isValid) {
        return {
          data: '',
          success: false,
          error: `Invalid encrypted data: ${validation.errors.join(', ')}`,
        };
      }

      // Parse encrypted data components with validation
      let dataBuffer: ArrayBuffer;
      let iv: Uint8Array;
      let salt: Uint8Array;

      try {
        // Validate base64 strings before decoding
        if (!CryptoUtils.validateBase64(encryptedData.encryptedData)) {
          throw new EncryptionError('Invalid encrypted data format', 'INVALID_ENCRYPTED_DATA');
        }
        if (!CryptoUtils.validateBase64(encryptedData.iv)) {
          throw new EncryptionError('Invalid IV format', 'INVALID_IV');
        }
        if (!CryptoUtils.validateBase64(encryptedData.salt)) {
          throw new EncryptionError('Invalid salt format', 'INVALID_SALT');
        }

        dataBuffer = CryptoUtils.base64ToArrayBuffer(encryptedData.encryptedData);
        iv = CryptoUtils.base64ToUint8Array(encryptedData.iv);
        salt = CryptoUtils.base64ToUint8Array(encryptedData.salt);
      } catch (error) {
        if (error instanceof EncryptionError) {
          throw error;
        }
        throw new EncryptionError(
          `Failed to parse encrypted data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'PARSING_FAILED'
        );
      }

      // Derive decryption key from password
      const key = await KeyDerivation.deriveKey({
        password,
        salt,
        ...options?.keyDerivationParams,
      });

      // Decrypt the data
      const decryptedData = await CryptoUtils.decrypt(dataBuffer, key, iv);

      return {
        data: decryptedData,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof EncryptionError
        ? error.message
        : 'Decryption failed - invalid password or corrupted data';

      return {
        data: '',
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Changes the password for encrypted data by decrypting with old password
   * and re-encrypting with new password
   */
  static async changePassword(
    encryptedData: EncryptedData,
    oldPassword: string,
    newPassword: string,
    options?: EncryptionOptions
  ): Promise<{ success: boolean; data?: EncryptedData; error?: string }> {
    try {
      // Decrypt with old password
      const decryptResult = await this.decryptData(encryptedData, oldPassword, options);
      
      if (!decryptResult.success) {
        return {
          success: false,
          error: 'Invalid old password',
        };
      }

      // Re-encrypt with new password
      const newEncryptedData = await this.encryptData(
        decryptResult.data,
        newPassword,
        options
      );

      return {
        success: true,
        data: newEncryptedData,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Password change failed',
      };
    }
  }

  /**
   * Validates encrypted data structure and base64 format
   */
  static validateEncryptedData(encryptedData: EncryptedData): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check required fields
    if (!encryptedData.encryptedData) {
      errors.push('Missing encrypted data');
    } else if (!CryptoUtils.validateBase64(encryptedData.encryptedData)) {
      errors.push('Invalid encrypted data format');
    }

    if (!encryptedData.iv) {
      errors.push('Missing initialization vector');
    } else if (!CryptoUtils.validateBase64(encryptedData.iv)) {
      errors.push('Invalid IV format');
    }

    if (!encryptedData.salt) {
      errors.push('Missing salt');
    } else if (!CryptoUtils.validateBase64(encryptedData.salt)) {
      errors.push('Invalid salt format');
    }

    if (!encryptedData.algorithm) {
      errors.push('Missing algorithm specification');
    } else if (encryptedData.algorithm !== 'AES-GCM') {
      errors.push('Unsupported algorithm');
    }

    if (!encryptedData.keyDerivation) {
      errors.push('Missing key derivation method');
    } else if (encryptedData.keyDerivation !== 'Argon2id') {
      errors.push('Unsupported key derivation method');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates the strength of a password
   */
  static validatePassword(password: string): {
    isValid: boolean;
    score: number; // 0-4, where 4 is strongest
    feedback: string[];
  } {
    const feedback: string[] = [];
    let score = 0;

    // Length check
    if (password.length < 8) {
      feedback.push('Password must be at least 8 characters long');
      return { isValid: false, score: 0, feedback };
    }

    if (password.length >= 12) score++;
    if (password.length >= 16) score++;

    // Character variety checks
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigits = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    const varietyCount = [hasLower, hasUpper, hasDigits, hasSpecial].filter(Boolean).length;
    
    if (varietyCount >= 3) score++;
    if (varietyCount === 4) score++;

    // Common patterns check
    const commonPatterns = [
      /123456/,
      /qwerty/i,
      /password/i,
      /abc/i,
      /(.)\1{2,}/, // Repeated characters
    ];

    const hasCommonPattern = commonPatterns.some(pattern => pattern.test(password));
    if (hasCommonPattern) {
      score = Math.max(0, score - 1);
      feedback.push('Avoid common patterns and repeated characters');
    }

    // Generate feedback
    if (!hasLower) feedback.push('Add lowercase letters');
    if (!hasUpper) feedback.push('Add uppercase letters');
    if (!hasDigits) feedback.push('Add numbers');
    if (!hasSpecial) feedback.push('Add special characters');

    if (score >= 3 && feedback.length === 0) {
      feedback.push('Strong password');
    } else if (score >= 2) {
      feedback.push('Good password, but could be stronger');
    } else if (score >= 1) {
      feedback.push('Weak password, consider making it stronger');
    }

    return {
      isValid: score >= 2 && password.length >= 8,
      score,
      feedback,
    };
  }

  /**
   * Batch decrypts multiple records using a single key derivation
   * This is much more efficient than individual decrypts when processing many records
   */
  static async batchDecryptData(
    encryptedRecords: EncryptedData[],
    password: string,
    options?: EncryptionOptions
  ): Promise<DecryptionResult[]> {
    if (!encryptedRecords.length) {
      return [];
    }

    try {
      // Validate password
      if (!password || password.length < 8) {
        const errorResult = {
          data: '',
          success: false,
          error: 'Password must be at least 8 characters long',
        };
        return encryptedRecords.map(() => errorResult);
      }

      // Check if all records use the same salt (for efficiency optimization)
      const firstRecord = encryptedRecords[0];
      const validation = this.validateEncryptedData(firstRecord);
      if (!validation.isValid) {
        const errorResult = {
          data: '',
          success: false,
          error: `Invalid encrypted data: ${validation.errors.join(', ')}`,
        };
        return encryptedRecords.map(() => errorResult);
      }

      // Parse salt from first record
      const firstSalt = CryptoUtils.base64ToUint8Array(firstRecord.salt);
      
      // Check if all records share the same salt
      const saltsMatch = encryptedRecords.every(record => {
        try {
          const recordSalt = CryptoUtils.base64ToUint8Array(record.salt);
          return CryptoUtils.arraysEqual(firstSalt, recordSalt);
        } catch {
          return false;
        }
      });

      let sharedKey: CryptoKey | null = null;
      if (saltsMatch) {
        // Derive key once for all records (traditional case)
        console.time('[EncryptionService] Shared key derivation');
        sharedKey = await KeyDerivation.deriveKey({
          password,
          salt: firstSalt,
          ...options?.keyDerivationParams,
        });
        console.timeEnd('[EncryptionService] Shared key derivation');
      } else {
        console.log('[EncryptionService] Different salts detected, will derive keys individually');
      }

      // Decrypt all records in parallel using the same key
      console.time('[EncryptionService] Batch decryption');
      const results = await Promise.all(
        encryptedRecords.map(async (encryptedData, index) => {
          try {
            // Validate each record
            const validation = this.validateEncryptedData(encryptedData);
            if (!validation.isValid) {
              console.error(`[EncryptionService] Record ${index} validation failed:`, {
                recordPreview: encryptedData.encryptedData?.substring(0, 20) + '...',
                validationErrors: validation.errors,
                hasData: !!encryptedData.encryptedData,
                hasIv: !!encryptedData.iv,
                hasSalt: !!encryptedData.salt,
                algorithm: encryptedData.algorithm,
                keyDerivation: encryptedData.keyDerivation
              });
              return {
                data: '',
                success: false,
                error: `Record ${index}: ${validation.errors.join(', ')}`,
              };
            }

            // Parse encrypted data components
            const dataBuffer = CryptoUtils.base64ToArrayBuffer(encryptedData.encryptedData);
            const iv = CryptoUtils.base64ToUint8Array(encryptedData.iv);
            
            let keyToUse: CryptoKey;
            
            if (sharedKey) {
              // Use the shared key (all records have same salt)
              keyToUse = sharedKey;
            } else {
              // Derive individual key for this record (different salts)
              const recordSalt = CryptoUtils.base64ToUint8Array(encryptedData.salt);
              keyToUse = await KeyDerivation.deriveKey({
                password,
                salt: recordSalt,
                ...options?.keyDerivationParams,
              });
            }

            // Decrypt using the appropriate key
            const decryptedData = await CryptoUtils.decrypt(dataBuffer, keyToUse, iv);
            return { data: decryptedData, success: true };

          } catch (error) {
            console.error(`[EncryptionService] Record ${index} decryption failed:`, {
              recordPreview: encryptedData.encryptedData?.substring(0, 20) + '...',
              hasData: !!encryptedData.encryptedData,
              hasIv: !!encryptedData.iv,
              hasSalt: !!encryptedData.salt,
              algorithm: encryptedData.algorithm,
              keyDerivation: encryptedData.keyDerivation,
              dataLength: encryptedData.encryptedData?.length,
              ivLength: encryptedData.iv?.length,
              saltLength: encryptedData.salt?.length,
              errorMessage: error instanceof Error ? error.message : 'Unknown error'
            });
            return {
              data: '',
              success: false,
              error: `Record ${index}: ${error instanceof Error ? error.message : 'Decryption failed'}`,
            };
          }
        })
      );
      console.timeEnd('[EncryptionService] Batch decryption');

      console.log(`[EncryptionService] Batch decrypted ${encryptedRecords.length} records`);
      return results;

    } catch (error) {
      const errorResult = {
        data: '',
        success: false,
        error: error instanceof Error ? error.message : 'Batch decryption failed',
      };
      return encryptedRecords.map(() => errorResult);
    }
  }

  /**
   * Generates a secure random password
   */
  static generateSecurePassword(length: number = 16): string {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    const allChars = lowercase + uppercase + digits + special;
    const password = new Array(length);
    
    // Ensure at least one character from each category
    password[0] = lowercase[Math.floor(Math.random() * lowercase.length)];
    password[1] = uppercase[Math.floor(Math.random() * uppercase.length)];
    password[2] = digits[Math.floor(Math.random() * digits.length)];
    password[3] = special[Math.floor(Math.random() * special.length)];
    
    // Fill remaining positions with random characters
    for (let i = 4; i < length; i++) {
      password[i] = allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Shuffle the password array
    for (let i = password.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [password[i], password[j]] = [password[j], password[i]];
    }
    
    return password.join('');
  }
}

// Export a singleton instance
export const encryptionService = new EncryptionService();