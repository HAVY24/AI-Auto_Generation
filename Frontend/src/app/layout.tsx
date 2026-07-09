import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["vietnamese"] });

export const metadata: Metadata = {
  title: "EduAI - AI-Powered Exam generator",
  description: "Hệ thống sinh đề thi tự động hỗ trợ giảng viên dựa trên công nghệ AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={cn(inter.className, "bg-slate-50 text-slate-900 overflow-hidden font-sans")}>
        <div className="flex h-screen w-full">
          <Sidebar />
          <div className="flex-1 flex flex-col h-screen overflow-hidden">
            <Topbar />
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
