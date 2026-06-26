"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authApi, knowledgeAPI, quizAPI, type SubjectSummary, type CATStepInfo } from "@/lib/api";

import { QuizSetup } from "@/components/kbs/quiz/quiz-setup";
import { QuizInterface } from "@/components/kbs/quiz/quiz-interface";

const CAT_SESSION_STORAGE_KEY = "kbs_active_cat_session_v1";

type PersistedCatSession = {
  user_id: string; // User ID is string in Prisma
  session_id: string;
  phase: "quiz" | "submitting";
  step: CATStepInfo;
  updated_at: number;
};

function QuizContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [step, setStep] = useState<CATStepInfo | null>(null);
  const [phase, setPhase] = useState<"setup" | "quiz" | "submitting">("setup");

  const clearPersistedSession = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(CAT_SESSION_STORAGE_KEY);
  }, []);

  const persistSession = useCallback((payload: PersistedCatSession) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(CAT_SESSION_STORAGE_KEY, JSON.stringify(payload));
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const response = await authApi.me();
      // Express backend returns user in response.data or response.data.user
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

  useEffect(() => {
    if (!user || typeof window === "undefined") return;

    const raw = localStorage.getItem(CAT_SESSION_STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as PersistedCatSession;
      if (parsed.user_id !== user.id) return;
      if (!parsed.session_id || !parsed.step) return;

      if (parsed.phase === "submitting") {
        // Prevent legacy stale submitting state from causing unexpected redirect loops.
        clearPersistedSession();
        return;
      }

      if (parsed.step.is_completed) {
        clearPersistedSession();
        return;
      }

      setSessionId(parsed.session_id);
      setStep(parsed.step);
      setPhase("quiz");
    } catch {
      clearPersistedSession();
    }
  }, [user, router, clearPersistedSession]);

  useEffect(() => {
    if (!user || !sessionId || !step) return;
    if (phase !== "quiz") return;

    persistSession({
      user_id: user.id,
      session_id: sessionId,
      phase,
      step,
      updated_at: Date.now(),
    });
  }, [user, sessionId, step, phase, persistSession]);

  useEffect(() => {
    if (user && subjects.length > 0 && phase === "setup") {
      const autoStart = searchParams.get("autoStart");
      const subject = searchParams.get("subject") || searchParams.get("subjectId");
      const numQuestionsStr = searchParams.get("numQuestions");
      if (autoStart === "true" && subject) {
        // Clear params to avoid loop on refresh
        router.replace("/cat-quiz");
        const numQuestions = numQuestionsStr ? parseInt(numQuestionsStr) : 10;
        handleStartQuiz({
          subject_id: subject,
          num_questions: numQuestions,
          recognition_pct: 30,
          comprehension_pct: 40,
          application_pct: 30
        }).catch(console.error);
      }
    }
  }, [user, subjects, phase, searchParams, router]);

  const handleStartQuiz = async (config: {
    subject_id: string;
    num_questions: number;
    recognition_pct: number;
    comprehension_pct: number;
    application_pct: number;
  }) => {
    if (!config.subject_id) {
      throw new Error("Bạn phải chọn môn học trước khi bắt đầu");
    }

    const catStart = await quizAPI.startCAT(config);
    setSessionId(catStart.session_id);
    setStep(catStart);
    setPhase("quiz");
    if (user) {
      persistSession({
        user_id: user.id,
        session_id: catStart.session_id,
        phase: "quiz",
        step: catStart,
        updated_at: Date.now(),
      });
    }
  };

  const handleAnswer = async (payload: { question_id: string; user_answer: string; time_spent_seconds: number }) => {
    if (!sessionId) return undefined;
    const nextStep = await quizAPI.answerCAT(sessionId, payload);
    return nextStep;
  };

  const handleProceed = (nextStep: CATStepInfo) => {
    setStep(nextStep);
  };

  const handleFinish = (finalStep: CATStepInfo) => {
    setStep(finalStep);
    if (sessionId) {
      clearPersistedSession();
      setPhase("submitting");
      router.push(`/cat-results/${sessionId}`);
    }
  };

  if (!user) return null;

  const defaultSubject = searchParams.get("subject") || undefined;

  return (
    <div className="min-h-screen">

      <main className="container py-6">
        {phase === "setup" && (
          <QuizSetup
            subjects={subjects}
            defaultSubjectId={defaultSubject}
            onStart={handleStartQuiz}
          />
        )}
        {phase === "quiz" && (
          sessionId && step ? (
            <QuizInterface
              currentStep={step}
              onAnswer={handleAnswer}
              onProceed={handleProceed}
              onFinish={handleFinish}
            />
          ) : null
        )}
        {phase === "submitting" && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
            <p className="text-muted-foreground">Đang chấm bài...</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function QuizPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
    </div>}>
      <QuizContent />
    </Suspense>
  );
}
