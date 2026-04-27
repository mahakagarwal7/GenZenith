import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/shared/navbar";
import { CommandMenu } from "@/components/shared/command-menu";
import { Analytics } from "@vercel/analytics/react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Volunteer Intelligence | Real-time Crisis Response",
  description: "A production-grade, AI-driven volunteer matching and coordination platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-slate-50 dark:bg-[#020617] transition-colors`}
        suppressHydrationWarning
      >
        <div className="fixed inset-0 -z-10 h-full w-full bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-50" />
        <Providers>
          <div className="relative flex min-h-screen flex-col">
            <Navbar />
            <CommandMenu />
            <main className="flex-1 overflow-y-auto">
              <div className="container max-w-7xl mx-auto py-6 px-4 md:px-8">
                {children}
              </div>
            </main>
            <footer className="py-6 md:px-8 md:py-0 border-t">
              <div className="container flex flex-col items-center justify-between gap-4 md:h-14 md:flex-row max-w-7xl mx-auto">
                <p className="text-balance text-center text-sm leading-loose text-muted-foreground md:text-left">
                  Built for the crisis-response community. All data is real-time.
                </p>
              </div>
            </footer>
          </div>
          <Analytics />
        </Providers>
      </body>
    </html>
  );
}
