"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    CheckCircle2, XCircle, Edit3, Save, Trash2,
    ChevronLeft, Download, Loader2, AlertCircle, Plus,
} from "lucide-react";
import { examsApi } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Question {
    topic?: string;
    question: string;
    options: string[];
    answer: string;
    explanation: string;
}

interface Exam {
    id: string;
    title: string;
    content: Question[];
    createdAt: string;
    document: { filename: string };
}

export default function ReviewPage() {
    const params = useParams() as { id: string };
    const router = useRouter();
    const examId = params.id;

    const [exam, setExam] = useState<Exam | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [editBuf, setEditBuf] = useState<Question | null>(null);
    const [error, setError] = useState("");
    const [saveMsg, setSaveMsg] = useState("");

    const fetchExam = useCallback(async () => {
        try {
            const { data } = await examsApi.getById(examId);
            setExam(data);
            const content = Array.isArray(data.content) ? data.content : [];
            setQuestions(content);
        } catch {
            setError("Không tải được đề thi");
        } finally {
            setLoading(false);
        }
    }, [examId]);

    useEffect(() => { fetchExam(); }, [fetchExam]);

    const startEdit = (idx: number) => {
        setEditingIdx(idx);
        setEditBuf({ ...questions[idx], options: [...(questions[idx].options || [])] });
    };

    const cancelEdit = () => { setEditingIdx(null); setEditBuf(null); };

    const saveEdit = () => {
        if (editBuf && editingIdx !== null) {
            const updated = [...questions];
            updated[editingIdx] = editBuf;
            setQuestions(updated);
        }
        cancelEdit();
    };

    const deleteQuestion = (idx: number) => {
        setQuestions(questions.filter((_, i) => i !== idx));
    };

    const addQuestion = () => {
        const blank: Question = {
            question: "Câu hỏi mới",
            options: ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
            answer: "Đáp án A",
            explanation: "",
        };
        setQuestions([...questions, blank]);
        setTimeout(() => startEdit(questions.length), 50);
    };

    const saveExam = async () => {
        if (!exam) return;
        setSaving(true);
        try {
            await examsApi.update(exam.id, { content: questions });
            setSaveMsg("Đã lưu thành công!");
            setTimeout(() => setSaveMsg(""), 3000);
        } catch {
            setError("Lưu thất bại");
        } finally {
            setSaving(false);
        }
    };

    const exportDocx = async () => {
        if (!exam || questions.length === 0) return;
        const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

        const children: any[] = [
            new Paragraph({ text: exam.title, heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: `Tài liệu: ${exam.document.filename}`, spacing: { after: 400 } }),
        ];

        questions.forEach((q, i) => {
            children.push(
                new Paragraph({ text: `Câu ${i + 1}: ${q.question}`, heading: HeadingLevel.HEADING_2 }),
                ...q.options.map((opt) => new Paragraph({ text: `   ${opt}` })),
                new Paragraph({ text: `✓ Đáp án: ${q.answer}`, spacing: { after: 100 } }),
                new Paragraph({ text: `Giải thích: ${q.explanation}`, spacing: { after: 300 } })
            );
        });

        const doc = new Document({ sections: [{ children }] });
        const blob = new Blob([await Packer.toBlob(doc)], {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${exam.title}.docx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64 gap-3 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin" /> Đang tải đề thi...
        </div>
    );

    if (error && !exam) return (
        <div className="flex items-center gap-3 text-red-600 p-8">
            <AlertCircle className="w-6 h-6" /> {error}
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-2 transition">
                        <ChevronLeft className="w-4 h-4" /> Quay lại
                    </button>
                    <h1 className="text-2xl font-bold text-slate-800">{exam?.title}</h1>
                    <p className="text-sm text-slate-400 mt-1">
                        {questions.length} câu hỏi • Từ: {exam?.document?.filename}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={exportDocx}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition"
                    >
                        <Download className="w-4 h-4" /> Xuất DOCX
                    </button>
                    <button
                        onClick={saveExam}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition disabled:opacity-70"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Lưu thay đổi
                    </button>
                </div>
            </div>

            {saveMsg && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
                    <CheckCircle2 className="w-4 h-4" /> {saveMsg}
                </div>
            )}
            {error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4" /> {error}
                </div>
            )}

            {/* Questions */}
            <div className="space-y-4">
                {questions.map((q, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm group">
                        {editingIdx === idx && editBuf ? (
                            /* Edit mode */
                            <div className="space-y-4">
                                <input
                                    className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-purple-600 placeholder:text-slate-400"
                                    placeholder="Nhập chủ đề / Dạng kiến thức..."
                                    value={editBuf.topic || ''}
                                    onChange={(e) => setEditBuf({ ...editBuf, topic: e.target.value })}
                                />
                                <textarea
                                    className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                                    rows={3}
                                    value={editBuf.question}
                                    onChange={(e) => setEditBuf({ ...editBuf, question: e.target.value })}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    {(editBuf.options || []).map((opt, oi) => (
                                        <input
                                            key={oi}
                                            className={cn(
                                                "border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                                                editBuf.answer === opt ? "border-emerald-400 bg-emerald-50" : "border-slate-200"
                                            )}
                                            value={opt}
                                            onChange={(e) => {
                                                const newOpts = [...(editBuf.options || [])];
                                                const wasAnswer = editBuf.answer === opt;
                                                newOpts[oi] = e.target.value;
                                                setEditBuf({ ...editBuf, options: newOpts, answer: wasAnswer ? e.target.value : editBuf.answer });
                                            }}
                                        />
                                    ))}
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">Đáp án đúng</label>
                                    <select
                                        className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
                                        value={editBuf.answer}
                                        onChange={(e) => setEditBuf({ ...editBuf, answer: e.target.value })}
                                    >
                                        {(editBuf.options || []).map((opt, oi) => <option key={oi}>{opt}</option>)}
                                    </select>
                                </div>
                                <textarea
                                    placeholder="Giải thích..."
                                    rows={2}
                                    className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                                    value={editBuf.explanation}
                                    onChange={(e) => setEditBuf({ ...editBuf, explanation: e.target.value })}
                                />
                                <div className="flex gap-2">
                                    <button onClick={saveEdit} className="flex items-center gap-1 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 transition">
                                        <Save className="w-3.5 h-3.5" /> Xong
                                    </button>
                                    <button onClick={cancelEdit} className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition">
                                        Hủy
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* View mode */
                            <div className="space-y-3">
                                {q.topic && (
                                    <div className="mb-2">
                                        <span className="inline-block px-2.5 py-1 bg-purple-50 text-purple-600 text-[11px] uppercase tracking-wider font-bold rounded-lg border border-purple-100">
                                            {q.topic}
                                        </span>
                                    </div>
                                )}
                                <div className="flex items-start justify-between gap-4">
                                    <p className="font-medium text-slate-800">
                                        <span className="text-blue-500 font-bold mr-2">Câu {idx + 1}.</span>
                                        {q.question}
                                    </p>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                                        <button onClick={() => startEdit(idx)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition">
                                            <Edit3 className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => deleteQuestion(idx)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    {(q.options || []).map((opt, oi) => (
                                        <div
                                            key={oi}
                                            className={cn(
                                                "flex items-center gap-2 px-3 py-2 rounded-xl text-sm",
                                                q.answer === opt
                                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium"
                                                    : "bg-slate-50 text-slate-600 border border-slate-100"
                                            )}
                                        >
                                            {q.answer === opt
                                                ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                                                : <XCircle className="w-4 h-4 flex-shrink-0 text-slate-300" />}
                                            {opt}
                                        </div>
                                    ))}
                                </div>

                                {q.explanation && (
                                    <p className="text-xs text-slate-400 italic bg-slate-50 rounded-lg px-3 py-2">
                                        💡 {q.explanation}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Add question */}
            <button
                onClick={addQuestion}
                className="w-full border-2 border-dashed border-slate-200 rounded-2xl py-4 flex items-center justify-center gap-2 text-slate-400 hover:border-blue-300 hover:text-blue-500 transition"
            >
                <Plus className="w-4 h-4" /> Thêm câu hỏi
            </button>
        </div>
    );
}
