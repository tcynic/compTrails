import { WorkOS } from '@workos-inc/node';

if (!process.env.WORKOS_API_KEY) {
  throw new Error('WORKOS_API_KEY is required');
}

if (!process.env.WORKOS_CLIENT_ID) {
  throw new Error('WORKOS_CLIENT_ID is required');
}

// Initialize WorkOS client
const workos = new WorkOS(process.env.WORKOS_API_KEY);

export { workos };
export const WORKOS_CLIENT_ID = process.env.WORKOS_CLIENT_ID;
export const WORKOS_REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`;