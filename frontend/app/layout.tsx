import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Sidebar from "./components/Sidebar";
import "./globals.css";

// Self-hosted at build time by next/font: no runtime requests to Google, no layout shift.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Excredite Electricity Data Hub",
  description: "Centralised analytics and intelligence platform for Nigeria's electricity sector",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="h-full bg-[var(--background)] text-[var(--foreground)] flex" suppressHydrationWarning>
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}

