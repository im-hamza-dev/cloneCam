import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SnapCam",
  description: "Phone camera to laptop webcam via WebRTC"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#080c14] text-slate-100">{children}</body>
    </html>
  );
}

