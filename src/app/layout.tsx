import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ASPIRE: WEREWOLF | One Village. Many Lies. One Wolf.",
  description:
    "Game Werewolf online tanpa login. Pemilik room menentukan role & kuota, AI & Game Engine menjadi moderator otomatis.",
  keywords: ["werewolf", "aspire werewolf", "ai moderator", "game werewolf online", "one village many lies one wolf"],
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="dark">
      <body className="bg-gray-950 text-white min-h-screen antialiased selection:bg-purple-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}