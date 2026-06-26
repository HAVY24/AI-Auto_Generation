"use client";

import { Bell, User, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function Topbar() {
    const router = useRouter();
    const [user, setUser] = useState<{ name?: string; email?: string } | null>(null);

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
        <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-end px-6 sticky top-0 z-10">
            <div className="flex items-center gap-5">
                <button className="relative text-slate-400 hover:text-slate-600 transition-colors" aria-label="Thông báo">
                    <Bell className="w-5 h-5" />
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full" />
                </button>

                <div className="flex items-center gap-3 pl-5 border-l border-slate-200">
                    <div className="text-right hidden sm:block">
                        <p className="text-sm font-semibold text-slate-700 leading-tight">{user?.name || "Giảng viên"}</p>
                        <p className="text-xs text-slate-400 leading-tight">{user?.email || ""}</p>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-400 flex items-center justify-center text-white text-sm font-bold shadow-sm">
                        {(user?.name || user?.email || "U")[0].toUpperCase()}
                    </div>
                    <button onClick={handleLogout} className="text-slate-400 hover:text-red-400 transition" title="Đăng xuất">
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </header>
    );
}
