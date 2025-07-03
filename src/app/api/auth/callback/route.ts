import { NextRequest, NextResponse } from 'next/server';
import { workos, WORKOS_CLIENT_ID } from '@/lib/workos';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json(
        { error: 'Authorization code is required' },
        { status: 400 }
      );
    }

    // Exchange authorization code for user profile
    const profile = await workos.sso.getProfileAndToken({
      code,
      clientId: WORKOS_CLIENT_ID,
    });

    if (!profile) {
      return NextResponse.json(
        { error: 'Failed to get user profile' },
        { status: 400 }
      );
    }

    // Store user session - using a simple approach with cookies
    // In production, you'd want to use a proper session management system
    const cookieStore = await cookies();
    cookieStore.set('workos-user', JSON.stringify({
      id: profile.profile.id,
      email: profile.profile.email,
      firstName: profile.profile.firstName,
      lastName: profile.profile.lastName,
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });

    // Redirect to dashboard after successful authentication
    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (error) {
    console.error('Error in auth callback:', error);
    
    // Redirect to login with error
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'authentication_failed');
    return NextResponse.redirect(loginUrl);
  }
}