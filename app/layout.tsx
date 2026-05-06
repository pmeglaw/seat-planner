import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Office Seat Planner",
  description: "Internal interactive office seating map"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
