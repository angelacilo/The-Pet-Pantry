import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { CartProvider } from "@/lib/cart";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "The Pet Pantry - Local Pet Shop",
  description:
    "Order quality pet food, treats, toys, and essentials online from The Pet Pantry with fast delivery and easy store pickup.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F9D1D9] text-[#4A5330] flex flex-col antialiased">
        <CartProvider>
          <Navbar />
          <div className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
            {children}
          </div>
          <footer className="mt-auto py-6 border-t border-[#838F58]/20 text-center text-xs text-[#4A5330]/70">
            <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
              <span>© 2026 The Pet Pantry. Fresh pet food & accessories.</span>
              <Link
                href="/staff/login"
                className="text-[11px] text-[#4A5330]/50 hover:text-[#4A5330] transition underline"
              >
                Staff login
              </Link>
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
