import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const sourceSans = Source_Sans_3({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-sans" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["600"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "KluMail",
  description: "Shared inbox and ticketing for customer support teams.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sourceSans.variable} ${fraunces.variable}`}>
      <body>
        <a className="skip" href="#content">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
