import { NextRequest, NextResponse } from 'next/server';
import { workos, WORKOS_CLIENT_ID, WORKOS_REDIRECT_URI } from '@/lib/workos';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider') || 'GoogleOAuth';
    
    // Generate a random state parameter for CSRF protection
    const state = randomBytes(32).toString('hex');
    
    // Store state in a cookie for validation in callback
    const cookieStore = await cookies();
    cookieStore.set('workos-state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 minutes
    });
    
    console.log('=== WorkOS Login Debug Info ===');
    console.log('Provider:', provider);
    console.log('Client ID:', WORKOS_CLIENT_ID);
    console.log('Redirect URI:', WORKOS_REDIRECT_URI);
    console.log('Generated state:', state);
    console.log('===============================');
    
    // Generate authorization URL for Google SSO
    const authorizationUrl = workos.sso.getAuthorizationUrl({
      clientId: WORKOS_CLIENT_ID,
      redirectUri: WORKOS_REDIRECT_URI,
      provider: provider,
      state: state,
    });

    console.log('Authorization URL:', authorizationUrl);

    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    console.error('Error creating authorization URL:', error);
    return NextResponse.json(
      { error: 'Failed to create authorization URL' },
      { status: 500 }
    );
  }
}