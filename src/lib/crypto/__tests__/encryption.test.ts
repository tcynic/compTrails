/**
 * Basic encryption tests - these would normally be run with a proper test framework
 * For now, this serves as documentation and basic validation
 */

import { EncryptionService } from '@/services/encryptionService';
import { CryptoUtils } from '../encryption';
import { KeyDerivation } from '../keyDerivation';

// These tests would be run with Jest/Vitest in a proper test environment
export const encryptionTests = {
  async testBasicEncryption() {
    const testData = 'Hello, World! This is sensitive data.';
    const password = 'SecurePassword123!';

    try {
      // Test encryption
      const encrypted = await EncryptionService.encryptData(testData, password);
      
      console.log('Encryption successful:', {
        algorithm: encrypted.algorithm,
        keyDerivation: encrypted.keyDerivation,
        hasEncryptedData: !!encrypted.encryptedData,
        hasIV: !!encrypted.iv,
        hasSalt: !!encrypted.salt,
      });

      // Test decryption
      const decrypted = await EncryptionService.decryptData(encrypted, password);
      
      if (decrypted.success && decrypted.data === testData) {
        console.log('✅ Basic encryption/decryption test passed');
        return true;
      } else {
        console.error('❌ Decryption failed or data mismatch');
        return false;
      }
    } catch (error) {
      console.error('❌ Encryption test failed:', error);
      return false;
    }
  },

  async testWrongPassword() {
    const testData = 'Secret information';
    const correctPassword = 'CorrectPassword123!';
    const wrongPassword = 'WrongPassword456!';

    try {
      const encrypted = await EncryptionService.encryptData(testData, correctPassword);
      const decrypted = await EncryptionService.decryptData(encrypted, wrongPassword);

      if (!decrypted.success && decrypted.error) {
        console.log('✅ Wrong password correctly rejected');
        return true;
      } else {
        console.error('❌ Wrong password test failed - should have been rejected');
        return false;
      }
    } catch (error) {
      console.error('❌ Wrong password test error:', error);
      return false;
    }
  },

  async testPasswordValidation() {
    const weakPasswords = ['123', 'password', 'abc123'];
    const strongPasswords = ['MySecure123!', 'P@ssw0rd2024', 'Tr0ub4dor&3'];

    let weakRejected = 0;
    let strongAccepted = 0;

    weakPasswords.forEach(password => {
      const validation = EncryptionService.validatePassword(password);
      if (!validation.isValid) weakRejected++;
    });

    strongPasswords.forEach(password => {
      const validation = EncryptionService.validatePassword(password);
      if (validation.isValid) strongAccepted++;
    });

    if (weakRejected === weakPasswords.length && strongAccepted === strongPasswords.length) {
      console.log('✅ Password validation test passed');
      return true;
    } else {
      console.error('❌ Password validation test failed');
      return false;
    }
  },

  async testKeyDerivation() {
    const password = 'TestPassword123!';
    const salt = CryptoUtils.generateSalt(32);

    try {
      const key1 = await KeyDerivation.deriveKey({ password, salt });
      const key2 = await KeyDerivation.deriveKey({ password, salt });

      // Keys should be the same for same password/salt
      // We can't directly compare CryptoKey objects, but they should encrypt/decrypt consistently
      const testData = 'Consistency test';
      
      const encrypted1 = await CryptoUtils.encrypt(testData, key1);
      const decrypted1 = await CryptoUtils.decrypt(encrypted1.encryptedData, key2, encrypted1.iv);

      if (decrypted1 === testData) {
        console.log('✅ Key derivation consistency test passed');
        return true;
      } else {
        console.error('❌ Key derivation consistency test failed');
        return false;
      }
    } catch (error) {
      console.error('❌ Key derivation test error:', error);
      return false;
    }
  },

  async runAllTests() {
    console.log('🧪 Running encryption tests...');
    
    const results = await Promise.all([
      this.testBasicEncryption(),
      this.testWrongPassword(),
      this.testPasswordValidation(),
      this.testKeyDerivation(),
    ]);

    const passed = results.filter(Boolean).length;
    const total = results.length;

    console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);
    
    if (passed === total) {
      console.log('🎉 All encryption tests passed!');
    } else {
      console.log('⚠️ Some tests failed. Check implementation.');
    }

    return passed === total;
  }
};

// Export for potential use in browser console
if (typeof window !== 'undefined') {
  (window as any).encryptionTests = encryptionTests;
}