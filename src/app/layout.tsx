import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PostHogProvider } from "./providers";
import { ConvexClientProvider } from "@/providers/ConvexClientProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { PasswordAuthBridge } from "@/components/providers/PasswordAuthBridge";
import { OfflineProvider } from "@/components/providers/OfflineProvider";
import { PWARegistration } from "@/components/providers/PWARegistration";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CompTrails - Total Compensation Calculator",
  description: "Privacy-first compensation tracking with zero-knowledge encryption",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PostHogProvider>
          <ConvexClientProvider>
            <AuthProvider>
              <PasswordAuthBridge>
                <OfflineProvider>
                  {children}
                </OfflineProvider>
              </PasswordAuthBridge>
            </AuthProvider>
          </ConvexClientProvider>
        </PostHogProvider>
        <PWARegistration />
      </body>
    </html>
  );
}
