import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DocuFlow AI — Enterprise Document Intelligence",
  description:
    "AI-powered document management system with semantic search, instant summaries, and an intelligent document agent. Built for teams that move fast.",
  keywords: [
    "document management",
    "AI",
    "RAG",
    "semantic search",
    "document intelligence",
    "enterprise",
  ],
  openGraph: {
    title: "DocuFlow AI — Enterprise Document Intelligence",
    description:
      "AI-powered document management with semantic search, instant summaries, and an intelligent document agent.",
    type: "website",
  },
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen mesh-bg">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
