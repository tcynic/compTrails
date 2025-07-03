'use client';

import { useState } from 'react';
import { EncryptionService } from '@/services/encryptionService';
import type { EncryptedData } from '@/lib/crypto/types';

export function EncryptionDemo() {
  const [data, setData] = useState('');
  const [password, setPassword] = useState('');
  const [encryptedData, setEncryptedData] = useState<EncryptedData | null>(null);
  const [decryptedData, setDecryptedData] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEncrypt = async () => {
    if (!data || !password) {
      setError('Please enter both data and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const encrypted = await EncryptionService.encryptData(data, password);
      setEncryptedData(encrypted);
      setDecryptedData('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Encryption failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDecrypt = async () => {
    if (!encryptedData || !password) {
      setError('Please encrypt data first and enter password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await EncryptionService.decryptData(encryptedData, password);
      if (result.success) {
        setDecryptedData(result.data);
      } else {
        setError(result.error || 'Decryption failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decryption failed');
    } finally {
      setLoading(false);
    }
  };

  const passwordValidation = password ? EncryptionService.validatePassword(password) : null;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Encryption Demo
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Data to Encrypt
            </label>
            <textarea
              value={data}
              onChange={(e) => setData(e.target.value)}
              placeholder="Enter sensitive data here..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            
            {passwordValidation && (
              <div className="mt-2">
                <div className={`text-sm ${passwordValidation.isValid ? 'text-green-600' : 'text-red-600'}`}>
                  Strength: {passwordValidation.score}/4
                </div>
                <ul className="text-xs text-gray-600 mt-1">
                  {passwordValidation.feedback.map((feedback, index) => (
                    <li key={index}>• {feedback}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex space-x-4">
            <button
              onClick={handleEncrypt}
              disabled={loading || !data || !password}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Encrypting...' : 'Encrypt'}
            </button>
            
            <button
              onClick={handleDecrypt}
              disabled={loading || !encryptedData}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Decrypting...' : 'Decrypt'}
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {encryptedData && (
            <div className="space-y-2">
              <h3 className="font-medium text-gray-900">Encrypted Data:</h3>
              <div className="bg-gray-50 p-3 rounded-md text-xs font-mono break-all">
                <div><strong>Algorithm:</strong> {encryptedData.algorithm}</div>
                <div><strong>Key Derivation:</strong> {encryptedData.keyDerivation}</div>
                <div><strong>Salt:</strong> {encryptedData.salt.slice(0, 32)}...</div>
                <div><strong>IV:</strong> {encryptedData.iv}</div>
                <div><strong>Encrypted:</strong> {encryptedData.encryptedData.slice(0, 64)}...</div>
              </div>
            </div>
          )}

          {decryptedData && (
            <div className="space-y-2">
              <h3 className="font-medium text-gray-900">Decrypted Data:</h3>
              <div className="bg-green-50 p-3 rounded-md border border-green-200">
                <p className="text-green-800">{decryptedData}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}