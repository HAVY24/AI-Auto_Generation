"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    FileText, Plus, Trash2, Eye, Loader2, AlertCircle,
    FileQuestion, UploadCloud,
} from "lucide-react";
import { documentsApi } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Document {
    id: string;
    filename: string;
    mimetype: string;
    size: number;
    createdAt: string;
    _count: { exams: number };
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function DocumentsPage() {
    const router = useRouter();
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [error, setError] = useState("");

    const fetchDocuments = async () => {
        try {
            const { data } = await documentsApi.list();
            setDocuments(data);
        } catch {
            setError("Không tải được danh sách tài liệu");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDocuments(); }, []);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setError("");
        try {
            await documentsApi.upload(file);
            await fetchDocuments();
        } catch (err: any) {
            setError(err.response?.data?.message || "Upload thất bại");
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Xóa tài liệu này và tất cả đề thi liên quan?")) return;
        setDeleting(id);
        try {
            await documentsApi.remove(id);
            setDocuments((prev) => prev.filter((d) => d.id !== id));
        } catch {
            setError("Xóa thất bại");
        } finally {
            setDeleting(null);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Tài Liệu</h1>
                    <p className="text-sm text-slate-500 mt-1">{documents.length} tài liệu đã upload</p>
                </div>
                <label className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition cursor-pointer",
                    uploading ? "bg-slate-100 text-slate-400" : "bg-blue-600 text-white hover:bg-blue-700"
                )}>
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                    {uploading ? "Đang upload..." : "Upload PDF"}
                    <input type="file" className="hidden" accept=".pdf" disabled={uploading} onChange={handleUpload} />
                </label>
            </div>

            {error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4" /> {error}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center h-48 gap-2 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" /> Đang tải...
                </div>
            ) : documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                        <FileText className="w-8 h-8 text-slate-300" />
                    </div>
                    <div>
                        <p className="font-medium text-slate-600">Chưa có tài liệu nào</p>
                        <p className="text-sm text-slate-400 mt-1">Upload file PDF để bắt đầu tạo đề thi</p>
                    </div>
                    <label className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 cursor-pointer transition">
                        <Plus className="w-4 h-4" /> Upload ngay
                        <input type="file" className="hidden" accept=".pdf" onChange={handleUpload} />
                    </label>
                </div>
            ) : (
                <div className="space-y-3">
                    {documents.map((doc) => (
                        <div key={doc.id} className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm group hover:border-slate-300 transition">
                            <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                                <FileText className="w-6 h-6 text-red-500" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-800 truncate">{doc.filename}</p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {formatBytes(doc.size)} • {new Date(doc.createdAt).toLocaleDateString("vi-VN")}
                                    {" • "}
                                    <span className="text-blue-600">{doc._count.exams} đề thi</span>
                                </p>
                            </div>

                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                                <button
                                    onClick={() => router.push(`/?doc=${doc.id}`)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 transition"
                                >
                                    <FileQuestion className="w-3.5 h-3.5" /> Tạo đề
                                </button>
                                <button
                                    onClick={() => handleDelete(doc.id)}
                                    disabled={deleting === doc.id}
                                    className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition"
                                >
                                    {deleting === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
