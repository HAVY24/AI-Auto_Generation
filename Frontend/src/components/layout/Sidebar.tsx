"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Database, LogOut, Sparkles, Map } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

const navItems = [
    { name: "Tạo Đề Thi (RAG)", icon: LayoutDashboard, href: "/" },
    { name: "Tài Liệu", icon: FileText, href: "/documents" },
    { name: "Ngân Hàng Đề", icon: Database, href: "/banks" },
    { name: "Thi Tổng Hợp (Toàn Đề)", icon: FileText, href: "/exam-adaptive" },
    { name: "Thi Thích Ứng (Từng Câu)", icon: Map, href: "/cat-quiz" },
];

export function Sidebar({ className }: { className?: string }) {
    const pathname = usePathname();
    const router = useRouter();
    const [user, setUser] = useState<{ name?: string; email?: string } | null>(null);

    // Must be in useEffect — localStorage is NOT available on the server (SSR)
    useEffect(() => {
        try {
            const stored = localStorage.getItem("user");
            if (stored) setUser(JSON.parse(stored));
        } catch { /* ignore */ }
    }, []);

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        router.push("/login");
    };

    return (
        <div className={cn("flex flex-col h-full w-64 bg-slate-900 text-slate-100 flex-shrink-0", className)}>
            {/* Logo */}
            <div className="p-6 border-b border-slate-800">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
                        <Sparkles className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 leading-tight">
                            EduAI
                        </h1>
                        <p className="text-xs text-slate-500 leading-tight">Exam Generation</p>
                    </div>
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-4 space-y-1">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                                isActive
                                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                            )}
                        >
                            <item.icon className="w-4.5 h-4.5" />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>

            {/* User footer */}
            <div className="p-4 border-t border-slate-800">
                <div className="flex items-center gap-3 px-2">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {(user?.name || user?.email || "U")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{user?.name || "Giảng viên"}</p>
                        <p className="text-xs text-slate-400 truncate">{user?.email || ""}</p>
                    </div>
                    <button onClick={handleLogout} className="p-1.5 text-slate-500 hover:text-red-400 transition rounded-lg hover:bg-slate-800">
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
