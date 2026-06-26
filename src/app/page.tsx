"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    UploadCloud, File, Settings2, SlidersHorizontal, Layers,
    ChevronDown, Loader2, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { documentsApi, examsApi } from "@/lib/api";

interface Document {
    id: string;
    filename: string;
    size: number;
    createdAt: string;
    _count?: { exams: number };
}

export default function Home() {
    const router = useRouter();
    const [isDragging, setIsDragging] = useState(false);
    const [file, setFile] = useState<File | null>(null);

    // Config
    const [numQuestions, setNumQuestions] = useState(20);
    const [difficulty, setDifficulty] = useState("mixed");
    const [title, setTitle] = useState("");
    const [subjectName, setSubjectName] = useState("");
    const [query, setQuery] = useState("");

    // Document selection
    const [documents, setDocuments] = useState<Document[]>([]);
    const [selectedDocId, setSelectedDocId] = useState<string>("");
    const [loadingDocs, setLoadingDocs] = useState(true);

    // Upload + generate state
    const [uploading, setUploading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [uploadProgress, setUploadProgress] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        fetchDocuments();
    }, []);

    const fetchDocuments = async () => {
        try {
            const { data } = await documentsApi.list();
            setDocuments(data);
        } catch {
            // User might not be logged in yet
        } finally {
            setLoadingDocs(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]);
    };

    const handleUploadAndGenerate = async () => {
        setError("");
        let docId = selectedDocId;

        // Step 1: Upload new file if provided
        if (file) {
            setUploading(true);
            setUploadProgress("Đang upload và phân tích tài liệu...");
            try {
                const { data } = await documentsApi.upload(file);
                docId = data.document.id;
                setUploadProgress(`✓ Đã index ${data.indexed_chunks} đoạn văn bản`);
                await fetchDocuments();
            } catch (err: any) {
                setError(err.response?.data?.message || "Upload thất bại");
                setUploading(false);
                return;
            }
            setUploading(false);
        }

        if (!docId) {
            setError("Vui lòng upload file hoặc chọn tài liệu đã có");
            return;
        }

        // Step 2: Generate exam
        setGenerating(true);
        try {
            const { data } = await examsApi.generate({
                documentId: docId,
                title: title || undefined,
                subjectName: subjectName || undefined,
                query: query || undefined,
                num_questions: numQuestions,
                difficulty,
            });
            router.push(`/review/${data.exam.id}`);
        } catch (err: any) {
            setError(err.response?.data?.message || "Sinh đề thi thất bại. Kiểm tra Ollama đang chạy?");
        } finally {
            setGenerating(false);
        }
    };

    const isProcessing = uploading || generating;

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="space-y-1">
                <h1 className="text-3xl font-bold text-slate-800">Tạo Đề Thi Mới</h1>
                <p className="text-slate-500">Upload tài liệu PDF và cấu hình để AI tự động sinh câu hỏi.</p>
            </div>

            {error && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm">{error}</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* ── Upload Zone ── */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 font-semibold text-slate-700">
                        <Layers className="w-5 h-5 text-blue-500" />
                        <h2>1. Tài Liệu</h2>
                    </div>

                    {/* Drop zone */}
                    <div
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        className={cn(
                            "border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all bg-white shadow-sm h-52",
                            isDragging ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-slate-400"
                        )}
                    >
                        {file ? (
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                                    <File className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="font-semibold text-slate-700 text-sm">{file.name}</p>
                                    <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                </div>
                                <button onClick={() => setFile(null)} className="text-xs text-red-500 hover:text-red-600">
                                    Xóa / chọn file khác
                                </button>
                            </div>
                        ) : (
                            <>
                                <UploadCloud className="w-10 h-10 text-slate-300 mb-3" />
                                <p className="font-medium text-slate-600 text-sm mb-1">Kéo thả file PDF vào đây</p>
                                <label className="text-blue-600 text-sm cursor-pointer hover:text-blue-700 font-medium">
                                    Hoặc chọn file
                                    <input type="file" className="hidden" accept=".pdf" onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
                                </label>
                            </>
                        )}
                    </div>

                    {/* Existing document selector */}
                    {!file && (
                        <div className="space-y-2">
                            <label className="text-sm text-slate-500 font-medium">Hoặc chọn tài liệu đã upload:</label>
                            <div className="relative">
                                <select
                                    value={selectedDocId}
                                    onChange={(e) => setSelectedDocId(e.target.value)}
                                    disabled={loadingDocs}
                                    className="w-full bg-white border border-slate-200 text-slate-700 rounded-xl px-3 py-2.5 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                                >
                                    <option value="">{loadingDocs ? "Đang tải..." : documents.length === 0 ? "Chưa có tài liệu" : "-- Chọn tài liệu --"}</option>
                                    {documents.map((d) => (
                                        <option key={d.id} value={d.id}>{d.filename}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Config ── */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 font-semibold text-slate-700">
                        <Settings2 className="w-5 h-5 text-blue-500" />
                        <h2>2. Cấu Hình Đề Thi</h2>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 flex justify-between">
                                <span>Số câu hỏi</span>
                                <span className="text-blue-600 font-semibold">{numQuestions} câu</span>
                            </label>
                            <input
                                type="range" min={5} max={50} value={numQuestions}
                                onChange={(e) => setNumQuestions(Number(e.target.value))}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 block">Độ khó</label>
                            <select
                                value={difficulty}
                                onChange={(e) => setDifficulty(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            >
                                <option value="easy">Dễ</option>
                                <option value="mixed">Hỗn hợp (Mặc định)</option>
                                <option value="hard">Khó</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 block">Tên môn học (Gom nhóm ngân hàng)</label>
                            <input
                                type="text"
                                placeholder="VD: Toán Rời Rạc (Mặc định: Lấy theo tên file)"
                                value={subjectName}
                                onChange={(e) => setSubjectName(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 block">Chủ đề tập trung</label>
                            <input
                                type="text"
                                placeholder="VD: Sorting algorithms, Chapter 3..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 block">Tên đề thi (tùy chọn)</label>
                            <input
                                type="text"
                                placeholder="VD: Đề thi giữa kỳ - DSA"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Action ── */}
            <div className="pt-4 border-t border-slate-200 flex flex-col items-center gap-4">
                {isProcessing ? (
                    <div className="w-full max-w-lg bg-blue-50/70 border border-blue-100 rounded-2xl p-6 text-center space-y-3">
                        <div className="flex items-center justify-center gap-3 text-blue-700 font-medium">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>{uploading ? "Đang upload & phân tích tài liệu..." : "AI đang sinh câu hỏi... (1-3 phút)"}</span>
                        </div>
                        {uploadProgress && <p className="text-sm text-blue-600">{uploadProgress}</p>}
                        <p className="text-xs text-slate-400">Vui lòng không đóng trang</p>
                    </div>
                ) : (
                    <button
                        onClick={handleUploadAndGenerate}
                        disabled={!file && !selectedDocId}
                        className={cn(
                            "px-10 py-4 rounded-2xl font-semibold flex items-center gap-2 transition-all shadow-sm",
                            file || selectedDocId
                                ? "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
                                : "bg-slate-100 text-slate-400 cursor-not-allowed"
                        )}
                    >
                        <SlidersHorizontal className="w-5 h-5" />
                        Bắt đầu sinh đề thi AI
                    </button>
                )}
            </div>
        </div>
    );
}
