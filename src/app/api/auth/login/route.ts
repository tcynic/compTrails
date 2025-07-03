import { NextRequest, NextResponse } from 'next/server';
import { workos, WORKOS_CLIENT_ID, WORKOS_REDIRECT_URI } from '@/lib/workos';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider') || 'google';
    
    // Generate authorization URL for Google SSO
    const authorizationUrl = workos.sso.getAuthorizationUrl({
      clientId: WORKOS_CLIENT_ID,
      redirectUri: WORKOS_REDIRECT_URI,
      provider: provider,
    });

    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    console.error('Error creating authorization URL:', error);
    return NextResponse.json(
      { error: 'Failed to create authorization URL' },
      { status: 500 }
    );
  }
}