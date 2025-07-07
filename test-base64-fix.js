// Test script to verify base64 validation fixes
// Run this in the browser console to test the fixes

console.log('Testing base64 validation fixes...');

// Test CryptoUtils validation
const testValidBase64 = 'SGVsbG8gV29ybGQ='; // "Hello World"
const testInvalidBase64 = 'Invalid@Base64!String#';
const testMalformedBase64 = 'SGVsbG8'; // Missing padding

console.log('✅ Testing valid base64:', testValidBase64);
console.log('Valid?', CryptoUtils.validateBase64(testValidBase64));

console.log('❌ Testing invalid base64:', testInvalidBase64);
console.log('Valid?', CryptoUtils.validateBase64(testInvalidBase64));

console.log('⚠️ Testing malformed base64:', testMalformedBase64);
console.log('Valid?', CryptoUtils.validateBase64(testMalformedBase64));

// Test sanitization
console.log('🧹 Testing sanitization of malformed base64:', testMalformedBase64);
try {
  const sanitized = CryptoUtils.sanitizeBase64(testMalformedBase64);
  console.log('Sanitized:', sanitized);
  console.log('Now valid?', CryptoUtils.validateBase64(sanitized));
} catch (error) {
  console.error('Sanitization failed:', error.message);
}

// Test decoding with validation
console.log('🔓 Testing base64ToArrayBuffer with validation...');
try {
  const buffer = CryptoUtils.base64ToArrayBuffer(testValidBase64);
  console.log('✅ Valid base64 decoded successfully:', buffer);
} catch (error) {
  console.error('❌ Valid base64 failed:', error.message);
}

try {
  const buffer = CryptoUtils.base64ToArrayBuffer(testInvalidBase64);
  console.log('This should not appear');
} catch (error) {
  console.log('✅ Invalid base64 properly rejected:', error.message);
}

// Test with malformed but fixable base64
try {
  const buffer = CryptoUtils.base64ToArrayBuffer(testMalformedBase64);
  console.log('✅ Malformed base64 fixed and decoded:', buffer);
} catch (error) {
  console.error('❌ Malformed base64 failed even after sanitization:', error.message);
}

console.log('Base64 validation test completed!');