import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Shield, TrendingUp, Users } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <DollarSign className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">CompTrails</h1>
          </div>
          <div className="flex space-x-4">
            <Link href="/login">
              <Button variant="outline">Sign In</Button>
            </Link>
            <Link href="/dashboard">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto mb-16">
          <h2 className="text-5xl font-bold text-gray-900 mb-6">
            Take Control of Your
            <span className="text-blue-600"> Total Compensation</span>
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Privacy-first compensation tracking for salary, bonuses, and equity grants. 
            Your financial data encrypted and stored locally, never leaving your device in plaintext.
          </p>
          <div className="flex justify-center space-x-4">
            <Link href="/dashboard">
              <Button size="lg" className="px-8 py-3">
                Start Tracking Now
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="px-8 py-3">
                Sign In
              </Button>
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          <Card className="text-center">
            <CardHeader>
              <Shield className="h-12 w-12 text-blue-600 mx-auto mb-4" />
              <CardTitle>Zero-Knowledge Privacy</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Your data is encrypted on your device. We never see your compensation details.
              </p>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <DollarSign className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <CardTitle>Complete Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Track salary, bonuses, equity grants, and total compensation in one place.
              </p>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <TrendingUp className="h-12 w-12 text-purple-600 mx-auto mb-4" />
              <CardTitle>Real-time Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Visualize your compensation growth and equity vesting progress.
              </p>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Users className="h-12 w-12 text-orange-600 mx-auto mb-4" />
              <CardTitle>Enterprise Ready</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                SSO integration, audit logging, and compliance-ready architecture.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Key Features */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-16">
          <h3 className="text-3xl font-bold text-center text-gray-900 mb-8">
            Everything You Need to Track Compensation
          </h3>
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h4 className="text-xl font-semibold text-gray-900 mb-4">📊 Comprehensive Tracking</h4>
              <ul className="space-y-2 text-gray-600">
                <li>• Salary history with company and title tracking</li>
                <li>• Six bonus types: performance, signing, retention, spot, annual</li>
                <li>• Equity grants with vesting schedule calculations</li>
                <li>• Multi-currency support</li>
              </ul>
            </div>
            <div>
              <h4 className="text-xl font-semibold text-gray-900 mb-4">🔒 Privacy & Security</h4>
              <ul className="space-y-2 text-gray-600">
                <li>• Client-side AES-256-GCM encryption</li>
                <li>• Argon2id key derivation</li>
                <li>• Local-first data storage</li>
                <li>• Secure authentication with Clerk</li>
              </ul>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center bg-blue-600 text-white rounded-lg p-12">
          <h3 className="text-3xl font-bold mb-4">Ready to Get Started?</h3>
          <p className="text-xl mb-8 text-blue-100">
            Join professionals who trust CompTrails to track their total compensation securely.
          </p>
          <Link href="/dashboard">
            <Button size="lg" variant="secondary" className="px-8 py-3">
              Start Your Free Account
            </Button>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <DollarSign className="h-6 w-6" />
            <span className="text-xl font-bold">CompTrails</span>
          </div>
          <p className="text-gray-400 mb-4">
            Privacy-first compensation tracking for the modern professional.
          </p>
          <div className="flex justify-center space-x-6 text-sm text-gray-400">
            <Link href="/login" className="hover:text-white">Sign In</Link>
            <Link href="/dashboard" className="hover:text-white">Dashboard</Link>
            <span>Built with privacy by design</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
