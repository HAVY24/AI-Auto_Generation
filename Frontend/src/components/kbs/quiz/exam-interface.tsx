"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MathContent } from "@/components/kbs/common/math-content";
import type { QuestionInfo } from "@/lib/api";
import { Clock, Send, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExamInterfaceProps {
  questions: QuestionInfo[];
  onSubmit: (answers: { questionId: string; userAnswer: string; timeSpentSeconds: number }[]) => Promise<void>;
}

export function ExamInterface({ questions, onSubmit }: ExamInterfaceProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [timer, setTimer] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleSelect = (questionId: string, option: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: option }));
  };

  const handleSubmit = async () => {
    if (Object.keys(answers).length < questions.length) {
      const confirmSubmit = window.confirm("Bạn chưa hoàn thành tất cả câu hỏi. Vẫn muốn nộp bài?");
      if (!confirmSubmit) return;
    }

    setIsSubmitting(true);
    setError(null);

    const timeSpentPerQuestion = Math.floor(timer / questions.length);

    const payload = questions.map(q => {
      const optLetter = answers[q.id];
      const fullTextAnswer = optLetter ? (q[`option${optLetter}` as keyof QuestionInfo] as string) : "NONE";
      return {
        questionId: q.id,
        userAnswer: fullTextAnswer,
        timeSpentSeconds: timeSpentPerQuestion
      };
    });

    try {
      await onSubmit(payload);
    } catch (err: any) {
      setError(err.message || "Lỗi khi nộp bài. Vui lòng thử lại.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-20 space-y-6">
      <div className="sticky top-16 z-40 flex items-center justify-between bg-white/90 backdrop-blur p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <p className="font-semibold text-slate-800">Bài Thi Đánh Giá Năng Lực</p>
          <p className="text-sm text-slate-500">
            Hoàn thành: {Object.keys(answers).length} / {questions.length} câu
          </p>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-full font-mono text-slate-700">
          <Clock className="h-4 w-4" />
          {formatTime(timer)}
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-sm text-red-600 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </CardContent>
        </Card>
      )}

      <div className="space-y-8">
        {questions.map((q, index) => {
          const selectedOption = answers[q.id];
          return (
            <Card key={q.id} className="border-slate-200 shadow-sm overflow-hidden" id={`question-${q.id}`}>
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-3">
                <CardTitle className="text-base font-medium flex gap-2">
                  <span className="bg-sky-100 text-sky-800 px-2 py-0.5 rounded text-sm shrink-0">
                    Câu {index + 1}
                  </span>
                  <div className="text-slate-800 font-normal leading-relaxed">
                    <MathContent content={q.stem} inline />
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                {["A", "B", "C", "D"].map((opt) => {
                  const text = q[`option${opt}` as keyof QuestionInfo] as string;
                  if (!text) return null;
                  
                  const isSelected = selectedOption === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => handleSelect(q.id, opt)}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-all duration-200",
                        isSelected
                          ? "border-sky-500 bg-sky-50 ring-1 ring-sky-200 shadow-sm"
                          : "border-slate-200 hover:border-sky-300 hover:bg-slate-50"
                      )}
                    >
                      <span className={cn(
                        "inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-semibold mr-3",
                        isSelected ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-500"
                      )}>
                        {opt}
                      </span>
                      <MathContent content={text} inline />
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-center mt-10">
        <Button 
          size="lg" 
          onClick={handleSubmit} 
          disabled={isSubmitting}
          className="bg-sky-600 hover:bg-sky-700 text-white px-10 py-6 text-lg rounded-full shadow-lg hover:shadow-xl transition-all"
        >
          {isSubmitting ? (
            "Đang chấm bài..."
          ) : (
            <>
              <Send className="h-5 w-5 mr-2" />
              Nộp Bài & Xem Kết Quả
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
