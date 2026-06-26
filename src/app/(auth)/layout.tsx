"use client";

import type { ReactNode } from "react";

/**
 * Auth layout – no sidebar/topbar, full-screen centered.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4">
            {children}
        </div>
    );
}
