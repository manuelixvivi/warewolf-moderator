import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Werewolf Moderator",
  description: "Alat bantu moderator permainan Werewolf — AI-powered narrative & game engine",
  keywords: ["werewolf", "moderator", "game", "AI", "narasi"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="dark">
      <body className="bg-gray-950 text-white min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}