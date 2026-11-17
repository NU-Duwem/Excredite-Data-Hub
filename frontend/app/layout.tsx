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
      <body className="h-full bg-background text-foreground flex flex-col md:flex-row md:gap-4 md:p-4" suppressHydrationWarning>
        <Sidebar />
        {/* Content tile: pages render inside one rounded surface on the canvas */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-gray-50 md:rounded-2xl md:shadow-[0_1px_2px_rgba(10,58,34,0.06)]">
          {children}
        </div>
      </body>
    </html>
  );
}

