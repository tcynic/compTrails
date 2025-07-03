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

      // Verify algorithm compatibility
      if (encryptedData.algorithm !== 'AES-GCM') {
        return {
          data: '',
          success: false,
          error: 'Unsupported encryption algorithm',
        };
      }

      if (encryptedData.keyDerivation !== 'Argon2id') {
        return {
          data: '',
          success: false,
          error: 'Unsupported key derivation method',
        };
      }

      // Parse encrypted data components
      const dataBuffer = CryptoUtils.base64ToArrayBuffer(encryptedData.encryptedData);
      const iv = CryptoUtils.base64ToUint8Array(encryptedData.iv);
      const salt = CryptoUtils.base64ToUint8Array(encryptedData.salt);

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