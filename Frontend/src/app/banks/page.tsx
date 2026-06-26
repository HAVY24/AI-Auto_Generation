"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    Database, Eye, Trash2, Loader2, AlertCircle,
    Download, Clock, FileText, Plus,
} from "lucide-react";
import { examsApi } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Exam {
    id: string;
    title: string;
    content: unknown[];
    createdAt: string;
    document: { filename: string };
}

export default function BanksPage() {
    const router = useRouter();
    const [exams, setExams] = useState<Exam[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [error, setError] = useState("");

    const fetchExams = async () => {
        try {
            const { data } = await examsApi.list();
            setExams(data);
        } catch {
            setError("Không tải được danh sách đề thi");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchExams(); }, []);

    const handleDelete = async (id: string) => {
        if (!confirm("Xóa đề thi này?")) return;
        setDeleting(id);
        try {
            await examsApi.remove(id);
            setExams((prev) => prev.filter((e) => e.id !== id));
        } catch {
            setError("Xóa thất bại");
        } finally {
            setDeleting(null);
        }
    };

    const exportDocx = async (exam: Exam) => {
        const questions = Array.isArray(exam.content) ? exam.content as any[] : [];
        const { Document, Packer, Paragraph, HeadingLevel } = await import("docx");
        const children: any[] = [
            new Paragraph({ text: exam.title, heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: `Tài liệu: ${exam.document.filename}`, spacing: { after: 400 } }),
        ];
        questions.forEach((q: any, i: number) => {
            children.push(
                new Paragraph({ text: `Câu ${i + 1}: ${q.question}`, heading: HeadingLevel.HEADING_2 }),
                ...(q.options ?? []).map((opt: string) => new Paragraph({ text: `   ${opt}` })),
                new Paragraph({ text: `✓ ${q.answer}`, spacing: { after: 100 } }),
                new Paragraph({ text: `Giải thích: ${q.explanation ?? ""}`, spacing: { after: 300 } })
            );
        });
        const doc = new Document({ sections: [{ children }] });
        const blob = new Blob([await Packer.toBlob(doc)], {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `${exam.title}.docx`; a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Ngân Hàng Đề Thi</h1>
                    <p className="text-sm text-slate-500 mt-1">{exams.length} đề thi đã tạo</p>
                </div>
                <button
                    onClick={() => router.push("/")}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
                >
                    <Plus className="w-4 h-4" /> Tạo đề mới
                </button>
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
            ) : exams.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                        <Database className="w-8 h-8 text-slate-300" />
                    </div>
                    <div>
                        <p className="font-medium text-slate-600">Chưa có đề thi nào</p>
                        <p className="text-sm text-slate-400 mt-1">Tạo đề thi đầu tiên của bạn</p>
                    </div>
                    <button
                        onClick={() => router.push("/")}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
                    >
                        <Plus className="w-4 h-4" /> Tạo đề thi ngay
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {exams.map((exam) => {
                        const numQ = Array.isArray(exam.content) ? exam.content.length : 0;
                        return (
                            <div key={exam.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm group hover:border-slate-300 transition">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-slate-800 truncate">{exam.title}</h3>
                                        <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-400">
                                            <span className="flex items-center gap-1">
                                                <FileText className="w-3.5 h-3.5" /> {exam.document?.filename}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5" /> {new Date(exam.createdAt).toLocaleDateString("vi-VN")}
                                            </span>
                                            <span className="text-blue-600 font-medium">{numQ} câu hỏi</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <button
                                            onClick={() => exportDocx(exam)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition"
                                        >
                                            <Download className="w-3.5 h-3.5" /> DOCX
                                        </button>
                                        <button
                                            onClick={() => router.push(`/review/${exam.id}`)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 transition"
                                        >
                                            <Eye className="w-3.5 h-3.5" /> Xem
                                        </button>
                                        <button
                                            onClick={() => handleDelete(exam.id)}
                                            disabled={deleting === exam.id}
                                            className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition"
                                        >
                                            {deleting === exam.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
