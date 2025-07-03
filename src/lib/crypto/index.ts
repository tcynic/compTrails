// Main encryption service
export { EncryptionService } from '@/services/encryptionService';

// Core encryption utilities
export { CryptoUtils } from './encryption';
export { KeyDerivation } from './keyDerivation';

// Types and interfaces
export type {
  EncryptedData,
  KeyDerivationParams,
  EncryptionOptions,
  DecryptionResult,
} from './types';

export { EncryptionError } from './types';

// Re-export for convenience
export * from './types';