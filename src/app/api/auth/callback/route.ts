import { NextRequest, NextResponse } from 'next/server';
import { workos, WORKOS_CLIENT_ID } from '@/lib/workos';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  // Log all callback parameters for debugging
  console.log('=== WorkOS Callback Debug Info ===');
  console.log('Full URL:', request.url);
  console.log('Search params:', Object.fromEntries(searchParams.entries()));
  console.log('Client ID:', WORKOS_CLIENT_ID);
  console.log('=====================================');

  try {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Check for OAuth errors first
    if (error) {
      console.error('OAuth Error:', {
        error,
        errorDescription,
        searchParams: Object.fromEntries(searchParams.entries())
      });
      
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', error);
      loginUrl.searchParams.set('error_description', errorDescription || 'OAuth authentication failed');
      return NextResponse.redirect(loginUrl);
    }

    if (!code) {
      console.error('Missing authorization code in callback');
      return NextResponse.json(
        { error: 'Authorization code is required' },
        { status: 400 }
      );
    }

    // Validate state parameter for CSRF protection
    const cookieStore = await cookies();
    const storedState = cookieStore.get('workos-state')?.value;
    
    console.log('State validation:', {
      receivedState: state,
      storedState: storedState,
      stateMatch: state === storedState
    });

    if (!state || !storedState || state !== storedState) {
      console.error('State validation failed - possible CSRF attack');
      
      // Clear the state cookie
      cookieStore.delete('workos-state');
      
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', 'invalid_state');
      loginUrl.searchParams.set('error_description', 'Invalid state parameter - possible CSRF attack');
      return NextResponse.redirect(loginUrl);
    }

    // Clear the state cookie after successful validation
    cookieStore.delete('workos-state');

    console.log('Exchanging code for profile...');
    
    // Exchange authorization code for user profile
    const profile = await workos.sso.getProfileAndToken({
      code,
      clientId: WORKOS_CLIENT_ID,
    });

    console.log('Profile response:', {
      hasProfile: !!profile,
      profileId: profile?.profile?.id,
      email: profile?.profile?.email
    });

    if (!profile || !profile.profile) {
      console.error('Failed to get user profile from WorkOS');
      return NextResponse.json(
        { error: 'Failed to get user profile' },
        { status: 400 }
      );
    }

    // Store user session - using a simple approach with cookies
    // In production, you'd want to use a proper session management system
    const userData = {
      id: profile.profile.id,
      email: profile.profile.email,
      firstName: profile.profile.firstName,
      lastName: profile.profile.lastName,
    };
    
    console.log('Setting user cookie:', { userId: userData.id, email: userData.email });
    
    cookieStore.set('workos-user', JSON.stringify(userData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });

    console.log('Redirecting to dashboard...');
    
    // Redirect to dashboard after successful authentication
    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (error) {
    console.error('Error in auth callback:', error);
    
    // Log detailed error information
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    // If it's a WorkOS API error, log more details
    if (error && typeof error === 'object' && 'response' in error) {
      console.error('WorkOS API Error Response:', error.response);
    }
    
    // Redirect to login with error
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'authentication_failed');
    loginUrl.searchParams.set('error_description', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.redirect(loginUrl);
  }
}