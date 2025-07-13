import { EncryptionService } from './encryptionService';
import { CryptoUtils } from '@/lib/crypto/encryption';

export interface PasswordValidationResult {
  isValid: boolean;
  strength: 'weak' | 'fair' | 'good' | 'strong';
  score: number;
  feedback: string[];
}

export interface MasterPasswordState {
  isSet: boolean;
  hashedFingerprint: string | null;
  createdAt: number | null;
  lastUsed: number | null;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export class PasswordService {
  private static readonly STORAGE_KEY = 'master_password_state';
  private static readonly SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes
  private static readonly MIN_PASSWORD_LENGTH = 12;
  private static readonly AUTO_DERIVE_SALT = 'comptrails_auto_derive_2025';
  
  private static sessionPassword: string | null = null;
  private static sessionExpiry: number | null = null;
  private static isAutoderived: boolean = false;

  /**
   * Validates password strength and provides feedback
   */
  static validatePassword(password: string): PasswordValidationResult {
    const feedback: string[] = [];
    let score = 0;
    let strength: 'weak' | 'fair' | 'good' | 'strong' = 'weak';

    // Length validation
    if (password.length < this.MIN_PASSWORD_LENGTH) {
      feedback.push(`Password must be at least ${this.MIN_PASSWORD_LENGTH} characters long`);
      return { isValid: false, strength, score: 0, feedback };
    }

    // Length scoring
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 1;
    if (password.length >= 20) score += 1;

    // Character variety checks
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigits = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password);

    const varietyCount = [hasLower, hasUpper, hasDigits, hasSpecial].filter(Boolean).length;
    score += varietyCount;

    // Entropy check (character distribution)
    const uniqueChars = new Set(password).size;
    const entropyRatio = uniqueChars / password.length;
    if (entropyRatio > 0.7) score += 1;

    // Common patterns penalty
    const commonPatterns = [
      /123456/,
      /qwerty/i,
      /password/i,
      /admin/i,
      /(.)\1{2,}/, // Repeated characters
      /012345/,
      /abcdef/i,
    ];

    const hasCommonPattern = commonPatterns.some(pattern => pattern.test(password));
    if (hasCommonPattern) {
      score = Math.max(0, score - 2);
      feedback.push('Avoid common patterns, repeated characters, and dictionary words');
    }

    // Sequential patterns penalty
    const hasSequential = this.hasSequentialPattern(password);
    if (hasSequential) {
      score = Math.max(0, score - 1);
      feedback.push('Avoid sequential patterns like "123" or "abc"');
    }

    // Determine strength
    if (score >= 8) {
      strength = 'strong';
    } else if (score >= 6) {
      strength = 'good';
    } else if (score >= 4) {
      strength = 'fair';
    } else {
      strength = 'weak';
    }

    // Generate specific feedback
    if (!hasLower) feedback.push('Include lowercase letters');
    if (!hasUpper) feedback.push('Include uppercase letters');
    if (!hasDigits) feedback.push('Include numbers');
    if (!hasSpecial) feedback.push('Include special characters (!@#$%^&* etc.)');

    if (score >= 6 && feedback.length === 0) {
      feedback.push('Strong password! Your data is well protected.');
    } else if (score >= 4) {
      feedback.push('Good password, but consider making it even stronger');
    } else if (score >= 2) {
      feedback.push('Fair password, but it could be much stronger');
    } else {
      feedback.push('Weak password - please create a stronger one');
    }

    return {
      isValid: score >= 4 && password.length >= this.MIN_PASSWORD_LENGTH,
      strength,
      score,
      feedback,
    };
  }

  /**
   * Checks for sequential patterns in password
   */
  private static hasSequentialPattern(password: string): boolean {
    const sequences = [
      'abcdefghijklmnopqrstuvwxyz',
      '0123456789',
      'qwertyuiop',
      'asdfghjkl',
      'zxcvbnm',
    ];

    for (const sequence of sequences) {
      for (let i = 0; i <= sequence.length - 3; i++) {
        const pattern = sequence.slice(i, i + 3);
        if (password.toLowerCase().includes(pattern)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Creates a cryptographic fingerprint of the password for verification
   */
  static async createPasswordFingerprint(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'fingerprint_salt');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return CryptoUtils.arrayBufferToBase64(hashBuffer);
  }

  /**
   * Verifies if the provided password matches the stored fingerprint
   */
  static async verifyPassword(password: string, fingerprint: string): Promise<boolean> {
    try {
      const currentFingerprint = await this.createPasswordFingerprint(password);
      return currentFingerprint === fingerprint;
    } catch (error) {
      console.error('Password verification failed:', error);
      return false;
    }
  }

  /**
   * Sets up the master password for the first time
   */
  static async setupMasterPassword(password: string): Promise<{
    success: boolean;
    error?: string;
    validation?: PasswordValidationResult;
  }> {
    try {
      // Validate password strength
      const validation = this.validatePassword(password);
      if (!validation.isValid) {
        return {
          success: false,
          error: 'Password does not meet security requirements',
          validation,
        };
      }

      // Check if password is already set
      const existingState = this.getMasterPasswordState();
      if (existingState.isSet) {
        return {
          success: false,
          error: 'Master password is already set. Use change password instead.',
        };
      }

      // Create password fingerprint
      const fingerprint = await this.createPasswordFingerprint(password);

      // Store master password state
      const passwordState: MasterPasswordState = {
        isSet: true,
        hashedFingerprint: fingerprint,
        createdAt: Date.now(),
        lastUsed: Date.now(),
      };

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(passwordState));

      // Set session password
      this.setSessionPassword(password);

      return {
        success: true,
        validation,
      };
    } catch (error) {
      console.error('Master password setup failed:', error);
      return {
        success: false,
        error: 'Failed to set up master password',
      };
    }
  }

  /**
   * Authenticates with the master password
   */
  static async authenticateWithMasterPassword(password: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const state = this.getMasterPasswordState();
      
      if (!state.isSet || !state.hashedFingerprint) {
        return {
          success: false,
          error: 'Master password not set',
        };
      }

      // Verify password
      const isValid = await this.verifyPassword(password, state.hashedFingerprint);
      if (!isValid) {
        return {
          success: false,
          error: 'Invalid password',
        };
      }

      // Update last used timestamp
      const updatedState: MasterPasswordState = {
        ...state,
        lastUsed: Date.now(),
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedState));

      // Set session password
      this.setSessionPassword(password);

      return { success: true };
    } catch (error) {
      console.error('Password authentication failed:', error);
      return {
        success: false,
        error: 'Authentication failed',
      };
    }
  }

  /**
   * Changes the master password
   */
  static async changeMasterPassword(
    oldPassword: string,
    newPassword: string
  ): Promise<{
    success: boolean;
    error?: string;
    validation?: PasswordValidationResult;
  }> {
    try {
      // Validate new password
      const validation = this.validatePassword(newPassword);
      if (!validation.isValid) {
        return {
          success: false,
          error: 'New password does not meet security requirements',
          validation,
        };
      }

      // Verify old password
      const authResult = await this.authenticateWithMasterPassword(oldPassword);
      if (!authResult.success) {
        return {
          success: false,
          error: 'Current password is incorrect',
        };
      }

      // Create new fingerprint
      const newFingerprint = await this.createPasswordFingerprint(newPassword);

      // Update state
      const state = this.getMasterPasswordState();
      const updatedState: MasterPasswordState = {
        ...state,
        hashedFingerprint: newFingerprint,
        lastUsed: Date.now(),
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedState));

      // Update session password
      this.setSessionPassword(newPassword);

      return {
        success: true,
        validation,
      };
    } catch (error) {
      console.error('Password change failed:', error);
      return {
        success: false,
        error: 'Failed to change password',
      };
    }
  }

  /**
   * Derives an encryption key automatically from user authentication data
   */
  static async deriveKeyFromAuth(user: User): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Create deterministic password from user credentials
      const userData = `${user.id}:${user.email}:${this.AUTO_DERIVE_SALT}`;
      const encoder = new TextEncoder();
      const keyMaterial = encoder.encode(userData);
      
      // Use WebCrypto to derive a consistent key
      const hashBuffer = await crypto.subtle.digest('SHA-256', keyMaterial);
      
      // Convert to base64 for use as password
      const derivedPassword = CryptoUtils.arrayBufferToBase64(hashBuffer);
      
      // Set as session password
      this.setSessionPassword(derivedPassword);
      this.isAutoderived = true;
      
      console.log('Successfully derived encryption key from user authentication');
      return { success: true };
    } catch (error) {
      console.error('Automatic key derivation failed:', error);
      return {
        success: false,
        error: 'Failed to derive encryption key from authentication'
      };
    }
  }

  /**
   * Gets the current master password state
   */
  static getMasterPasswordState(): MasterPasswordState {
    try {
      // If using auto-derived keys, return virtual state
      if (this.isAutoderived && this.sessionPassword) {
        return {
          isSet: true,
          hashedFingerprint: 'auto-derived',
          createdAt: Date.now(),
          lastUsed: Date.now(),
        };
      }
      
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        return {
          isSet: false,
          hashedFingerprint: null,
          createdAt: null,
          lastUsed: null,
        };
      }
      return JSON.parse(stored) as MasterPasswordState;
    } catch (error) {
      console.error('Failed to get master password state:', error);
      return {
        isSet: false,
        hashedFingerprint: null,
        createdAt: null,
        lastUsed: null,
      };
    }
  }

  /**
   * Sets the session password (in-memory only)
   */
  private static setSessionPassword(password: string): void {
    this.sessionPassword = password;
    this.sessionExpiry = Date.now() + this.SESSION_TIMEOUT;
  }

  /**
   * Gets the session password if still valid
   */
  static getSessionPassword(): string | null {
    if (!this.sessionPassword || !this.sessionExpiry) {
      return null;
    }

    if (Date.now() > this.sessionExpiry) {
      this.clearSessionPassword();
      return null;
    }

    return this.sessionPassword;
  }

  /**
   * Clears the session password
   */
  static clearSessionPassword(): void {
    this.sessionPassword = null;
    this.sessionExpiry = null;
    this.isAutoderived = false;
    
    // Clear key cache when session password is cleared
    EncryptionService.clearKeyCache();
    console.log('[PasswordService] Cleared session password and key cache');
  }

  /**
   * Extends the session timeout
   */
  static extendSession(): void {
    if (this.sessionPassword) {
      this.sessionExpiry = Date.now() + this.SESSION_TIMEOUT;
    }
  }

  /**
   * Checks if the session is still valid
   */
  static isSessionValid(): boolean {
    return this.getSessionPassword() !== null;
  }

  /**
   * Clears all password data (for logout)
   */
  static clearAllPasswordData(): void {
    this.clearSessionPassword();
    // Note: We don't clear the password state from localStorage
    // as it contains the user's setup, only the session data
  }

  /**
   * Generates a secure random password
   */
  static generateSecurePassword(length: number = 16): string {
    return EncryptionService.generateSecurePassword(length);
  }

  /**
   * Estimates password cracking time
   */
  static estimatePasswordCrackingTime(password: string): {
    seconds: number;
    humanReadable: string;
  } {
    const charset = this.getCharsetSize(password);
    const entropy = password.length * Math.log2(charset);
    
    // Assume 1 billion guesses per second (modern GPU)
    const guessesPerSecond = 1_000_000_000;
    const totalCombinations = Math.pow(2, entropy);
    const secondsToGuess = totalCombinations / (2 * guessesPerSecond);

    return {
      seconds: secondsToGuess,
      humanReadable: this.formatTime(secondsToGuess),
    };
  }

  /**
   * Gets the character set size for entropy calculation
   */
  private static getCharsetSize(password: string): number {
    let charset = 0;
    
    if (/[a-z]/.test(password)) charset += 26;
    if (/[A-Z]/.test(password)) charset += 26;
    if (/[0-9]/.test(password)) charset += 10;
    if (/[^a-zA-Z0-9]/.test(password)) charset += 32;
    
    return charset;
  }

  /**
   * Formats time duration into human-readable format
   */
  private static formatTime(seconds: number): string {
    const minute = 60;
    const hour = minute * 60;
    const day = hour * 24;
    const year = day * 365;
    const century = year * 100;

    if (seconds < minute) {
      return 'Less than a minute';
    } else if (seconds < hour) {
      return `${Math.round(seconds / minute)} minutes`;
    } else if (seconds < day) {
      return `${Math.round(seconds / hour)} hours`;
    } else if (seconds < year) {
      return `${Math.round(seconds / day)} days`;
    } else if (seconds < century) {
      return `${Math.round(seconds / year)} years`;
    } else {
      return 'Centuries';
    }
  }

  /**
   * Checks if the current session is using auto-derived keys
   */
  static isUsingAutoDerivedKey(): boolean {
    return this.isAutoderived;
  }
}