# Clerk Authentication Setup

This project uses Clerk for authentication. Follow these steps to set up Clerk for local development.

## 1. Create a Clerk Account

1. Go to [https://dashboard.clerk.com/sign-up](https://dashboard.clerk.com/sign-up)
2. Create a free account
3. Create a new application

## 2. Get Your API Keys

1. Navigate to **API Keys** in your Clerk dashboard
2. Copy your **Publishable Key** (starts with `pk_test_...`)
3. Copy your **Secret Key** (starts with `sk_test_...`)

## 3. Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
# Copy from .env.example
cp .env.example .env.local
```

Update the Clerk variables in `.env.local`:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_actual_key_here
CLERK_SECRET_KEY=sk_test_your_actual_key_here
```

## 4. Configure OAuth Providers (Optional)

To enable Google sign-in:

1. Go to **Configure** > **Social Connections** in Clerk dashboard
2. Enable **Google**
3. Follow the setup wizard to configure OAuth credentials

## 5. Configure Allowed Redirect URLs

In Clerk dashboard under **Configure** > **Paths**:

- **Sign-in URL**: `/login`
- **Sign-up URL**: `/sign-up`
- **Home URL**: `/dashboard`

## 6. Development

Start the development server:

```bash
npm run dev
```

Visit `http://localhost:3000/login` to test authentication.

## Production Deployment

For production on Vercel:

1. Add Clerk environment variables in Vercel project settings
2. Use production keys (starting with `pk_live_...` and `sk_live_...`)
3. Update allowed domains in Clerk dashboard

## Troubleshooting

### Build Errors

If you see `Missing publishableKey` errors during build:

- Ensure `.env.local` exists with valid Clerk keys
- For CI/CD, set placeholder values in the build environment

### Authentication Not Working

- Verify environment variables are loaded
- Check Clerk dashboard for allowed domains
- Ensure OAuth providers are properly configured
