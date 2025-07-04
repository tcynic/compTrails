import { WorkOS } from '@workos-inc/node';

// Validate required environment variables
if (!process.env.WORKOS_API_KEY) {
  throw new Error('WORKOS_API_KEY is required');
}

if (!process.env.WORKOS_CLIENT_ID) {
  throw new Error('WORKOS_CLIENT_ID is required');
}

if (!process.env.NEXT_PUBLIC_APP_URL) {
  throw new Error('NEXT_PUBLIC_APP_URL is required');
}

// Validate API key format
if (!process.env.WORKOS_API_KEY.startsWith('sk_')) {
  throw new Error('WORKOS_API_KEY must start with "sk_"');
}

// Validate Client ID format
if (!process.env.WORKOS_CLIENT_ID.startsWith('client_')) {
  throw new Error('WORKOS_CLIENT_ID must start with "client_"');
}

// Initialize WorkOS client
const workos = new WorkOS(process.env.WORKOS_API_KEY);

export { workos };
export const WORKOS_CLIENT_ID = process.env.WORKOS_CLIENT_ID;
export const WORKOS_REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`;

// Log configuration for debugging (without sensitive data)
console.log('=== WorkOS Configuration ===');
console.log('Client ID:', WORKOS_CLIENT_ID);
console.log('Redirect URI:', WORKOS_REDIRECT_URI);
console.log('API Key prefix:', process.env.WORKOS_API_KEY.substring(0, 7) + '...');
console.log('============================');