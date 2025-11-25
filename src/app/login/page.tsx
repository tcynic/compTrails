import { SignIn } from '@clerk/nextjs';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xl">CT</span>
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
          Sign in to CompTrails
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Track your total compensation with privacy-first security
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <SignIn 
            appearance={{
              elements: {
                rootBox: 'mx-auto',
                card: 'shadow-lg',
              }
            }}
            routing="path"
            path="/login"
            signUpUrl="/sign-up"
            afterSignInUrl="/dashboard"
          />
        </div>
        
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            By signing in, you agree to our privacy-first approach to handling your compensation data.
            All sensitive information is encrypted locally before being stored.
          </p>
        </div>
      </div>
    </div>
  );
}
