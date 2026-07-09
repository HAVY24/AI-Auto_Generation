"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authApi, knowledgeAPI, quizAPI, type SubjectSummary, type QuestionInfo, type BatchExamSubmitResult } from "@/lib/api";

import { QuizSetup } from "@/components/kbs/quiz/quiz-setup";
import { ExamInterface } from "@/components/kbs/quiz/exam-interface";

function ExamContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionInfo[]>([]);
  const [phase, setPhase] = useState<"setup" | "take" | "submitting">("setup");

  const checkAuth = useCallback(async () => {
    try {
      const response = await authApi.me();
      setUser(response.data.user || response.data);
      const subs = await knowledgeAPI.getSubjects();
      setSubjects(subs);
    } catch {
      router.push("/");
    }
  }, [router]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleStartExam = async (config: {
    subject_id: string;
    num_questions: number;
    recognition_pct: number;
    comprehension_pct: number;
    application_pct: number;
  }) => {
    if (!config.subject_id) {
      throw new Error("Bạn phải chọn môn học trước khi bắt đầu");
    }

    const result = await quizAPI.startBatchExam(config);
    setSessionId(result.session.id);
    setQuestions(result.questions);
    setPhase("take");
  };

  useEffect(() => {
    if (user && subjects.length > 0 && phase === "setup") {
      const autoStart = searchParams.get("autoStart");
      const subject = searchParams.get("subject") || searchParams.get("subjectId");
      const numQuestionsStr = searchParams.get("numQuestions");
      if (autoStart === "true" && subject) {
        router.replace("/exam-adaptive");
        const numQuestions = numQuestionsStr ? parseInt(numQuestionsStr) : 20;
        handleStartExam({
          subject_id: subject,
          num_questions: numQuestions,
          recognition_pct: 30,
          comprehension_pct: 50,
          application_pct: 20
        }).catch(console.error);
      }
    }
  }, [user, subjects, phase, searchParams, router]);

  const handleSubmit = async (answers: { questionId: string; userAnswer: string; timeSpentSeconds: number }[]) => {
    if (!sessionId) return;
    setPhase("submitting");
    try {
      const result = await quizAPI.submitBatchExam(sessionId, answers);
      router.push(`/exam-results/${sessionId}`);
    } catch (err) {
      alert("Có lỗi xảy ra khi nộp bài. Xin vui lòng thử lại.");
      setPhase("take");
    }
  };

  if (!user) return null;

  const defaultSubject = searchParams.get("subject") || undefined;

  return (
    <div className="min-h-screen bg-slate-50/50">

      <main className="container py-6">
        {phase === "setup" && (
          <QuizSetup
            subjects={subjects}
            defaultSubjectId={defaultSubject}
            onStart={handleStartExam}
          />
        )}
        {phase === "take" && questions.length > 0 && (
          <ExamInterface
            questions={questions}
            onSubmit={handleSubmit}
          />
        )}
        {phase === "submitting" && (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <div className="animate-spin rounded-full h-14 w-14 border-4 border-slate-200 border-t-sky-600" />
            <p className="text-xl font-medium text-slate-700">Đang chấm điểm và phân tích năng lực...</p>
            <p className="text-sm text-slate-500">Thuật toán IRT đang cập nhật chỉ số Theta của bạn</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ExamAdaptivePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
    </div>}>
      <ExamContent />
    </Suspense>
  );
}
