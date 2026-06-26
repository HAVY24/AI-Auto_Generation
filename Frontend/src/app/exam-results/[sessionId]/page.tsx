"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { authApi, quizAPI } from "@/lib/api";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Target, TrendingUp, Award, RotateCcw, Home, CheckCircle2, XCircle, Info } from "lucide-react";
import { MathContent } from "@/components/kbs/common/math-content";
import { cn } from "@/lib/utils";

interface ExamResultsProps {
  params: Promise<{
    sessionId: string;
  }>;
}

export default function ExamResultsPage({ params }: ExamResultsProps) {
  const router = useRouter();
  const unwrappedParams = use(params);
  const sessionId = unwrappedParams.sessionId;

  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const response = await authApi.me();
      setUser(response.data.user || response.data);
    } catch {
      router.push("/");
    }
  }, [router]);

  const fetchResults = useCallback(async () => {
    try {
      const data = await quizAPI.getSessionResults(sessionId);
      setSession(data);
    } catch (err) {
      console.error("Failed to fetch session results:", err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    checkAuth();
    fetchResults();
  }, [checkAuth, fetchResults]);

  if (!user || loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
    </div>
  );

  const scorePercentage = (session?.correctAnswers / session?.totalQuestions) * 100;

  return (
    <div className="min-h-screen bg-slate-50">

      <main className="container py-10 max-w-4xl">
        <div className="text-center mb-10 space-y-3">
          <div className={cn(
            "inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 shadow-sm",
            scorePercentage >= 50 ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"
          )}>
            <Award className="h-10 w-10" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-800">Kết Quả Bài Thi</h1>
          <p className="text-lg text-slate-500">Môn học: {session?.subject?.name}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Card className="border-t-4 border-t-green-500 shadow-sm">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-slate-500 uppercase">Đúng / Tổng</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-800">
                {session?.correctAnswers} / {session?.totalQuestions}
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-sky-500 shadow-sm">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-slate-500 uppercase">Điểm số</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-800">
                {session?.totalScore?.toFixed(1)} / 10
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-indigo-500 shadow-sm">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-slate-500 uppercase">Năng lực (Theta)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-2xl font-bold text-slate-800">
                {session?.thetaEstimate?.toFixed(3)}
                <TrendingUp className="h-4 w-4 text-sky-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 mb-10">
          <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <Info className="h-5 w-5 text-slate-400" />
            Chi tiết bài làm
          </h2>
          {session?.responses?.map((res: any, index: number) => (
            <Card key={res.id} className={cn(
              "border-l-4",
              res.isCorrect ? "border-l-green-500" : "border-l-red-500"
            )}>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-sm font-medium text-slate-400 uppercase tracking-wider">Câu {index + 1}</span>
                    <div className="text-slate-800">
                      <MathContent content={res.question.stem} />
                    </div>
                  </div>
                  {res.isCorrect ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-500 shrink-0" />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className={cn(
                    "p-2 rounded border",
                    res.isCorrect ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"
                  )}>
                    <span className="font-semibold block mb-1">Đáp án của bạn:</span>
                    {res.userAnswer}
                  </div>
                  <div className="p-2 rounded border bg-slate-50 border-slate-100">
                    <span className="font-semibold block mb-1">Đáp án đúng:</span>
                    {res.question.correctAnswer}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button onClick={() => router.push(`/exam-adaptive?subject=${session?.subject?.id}&numQuestions=${session?.totalQuestions}&autoStart=true`)} size="lg" className="bg-sky-600 hover:bg-sky-700 shadow-md">
            <RotateCcw className="h-4 w-4 mr-2" />
            Làm bài thi mới
          </Button>
          <Button variant="outline" onClick={() => router.push("/")} size="lg" className="border-slate-300 shadow-sm">
            <Home className="h-4 w-4 mr-2" />
            Về trang chủ
          </Button>
        </div>
      </main>
    </div>
  );
}
