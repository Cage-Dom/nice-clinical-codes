import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";
import { Nav } from "./Nav";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Clinical Code List Generator | NICE",
  description:
    "Generate and validate clinical code lists (SNOMED CT, ICD-10) from public NHS data sources.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${lora.variable} antialiased`}
    >
      <body className="min-h-screen flex flex-col bg-[#FBFAF8] text-[#0E0E0E] font-[family-name:var(--font-inter)]">
        <header className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-black tracking-tight">NICE</span>
              <span className="text-xs text-gray-600 leading-tight hidden sm:block">
                National Institute for
                <br />
                Health and Care Excellence
              </span>
              <span className="text-[10px] font-semibold bg-[#00436C] text-white px-1.5 py-0.5 rounded">
                Beta
              </span>
            </div>
          </div>
        </header>

        <Nav />

        <main className="flex-1">{children}</main>

        <footer className="mt-auto bg-[#00436C] text-white px-6 py-6">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-white/80">© NICE 2026. All rights reserved.</span>
            <div className="flex gap-4">
              <a href="/accessibility" className="hover:underline">Accessibility</a>
              <a href="/privacy" className="hover:underline">Privacy</a>
              <a href="/cookies" className="hover:underline">Cookies</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
