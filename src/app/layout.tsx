import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Solutive - Inventory Management Dashboard",
  description: "Modern inventory management system for tracking stock, orders, and production.",
  keywords: ["Solutive", "Inventory", "Management", "Dashboard", "Stock"],
  authors: [{ name: "Solutive Team" }],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  // "Add to Home Screen" on iOS for the Scan Material kiosk device
  // (ims-feature-warehouse-management-scan-material.md) — opens fullscreen,
  // no Safari chrome, once launched from the home-screen icon.
  appleWebApp: {
    capable: true,
    title: "Solutive",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#4a6741",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-surface text-text-heading`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          {children}
          <Toaster />
          <SonnerToaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
