export interface EncryptedData {
  encryptedData: string; // Base64 encoded encrypted data
  iv: string; // Base64 encoded initialization vector
  salt: string; // Base64 encoded salt used for key derivation
  algorithm: 'AES-GCM';
  keyDerivation: 'Argon2id';
}

export interface KeyDerivationParams {
  password: string;
  salt: Uint8Array;
  memory?: number; // Memory usage in KB (default: 64MB)
  iterations?: number; // Number of iterations (default: 3)
  parallelism?: number; // Parallelism factor (default: 1)
  hashLength?: number; // Hash length in bytes (default: 32 for AES-256)
}

export interface EncryptionOptions {
  keyDerivationParams?: Partial<Omit<KeyDerivationParams, 'password' | 'salt'>>;
}

export interface DecryptionResult {
  data: string;
  success: boolean;
  error?: string;
}

export class EncryptionError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'EncryptionError';
  }
}