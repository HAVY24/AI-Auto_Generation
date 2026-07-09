"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MathContent } from "@/components/kbs/common/math-content";
import type { QuestionInfo, CATStepInfo } from "@/lib/api";
import { Clock, ChevronRight, Send, AlertCircle, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuizInterfaceProps {
  currentStep: CATStepInfo;
  onAnswer: (payload: { question_id: string; user_answer: string; time_spent_seconds: number }) => Promise<CATStepInfo | undefined>;
  onProceed: (step: CATStepInfo) => void;
  onFinish: (step: CATStepInfo) => void;
}

export function QuizInterface({ currentStep, onAnswer, onProceed, onFinish }: QuizInterfaceProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [questionTimer, setQuestionTimer] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedbackState, setFeedbackState] = useState<{ isCorrect?: boolean; correctAnswer?: string; nextStep?: CATStepInfo } | null>(null);
  const [ruleTimeline, setRuleTimeline] = useState<Array<{
    step: number;
    rules: string[];
    theta: number;
    sem: number;
    createdAt: string;
  }>>([]);
  const [showRuleDetails, setShowRuleDetails] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionStartRef = useRef(Date.now());
  const timelineDedupRef = useRef<Set<string>>(new Set());

  const current = currentStep.question as QuestionInfo | undefined;

  useEffect(() => {
    questionStartRef.current = Date.now();
    setQuestionTimer(0);
    setSelectedAnswer("");
    setSubmitError(null);

    timerRef.current = setInterval(() => {
      setQuestionTimer(Math.floor((Date.now() - questionStartRef.current) / 1000));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentStep.question?.id]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const timeLimit = current?.timeLimitSeconds || 60;
  const isOverTime = questionTimer > timeLimit;
  const progressPct = (currentStep.answered_count / Math.max(currentStep.max_questions, 1)) * 100;

  const handleNext = useCallback(async () => {
    if (!current || !selectedAnswer || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    const spent = Math.floor((Date.now() - questionStartRef.current) / 1000);
    const fullTextAnswer = current[`option${selectedAnswer}` as keyof QuestionInfo] as string;
    
    try {
      const nextStep = await onAnswer({
        question_id: current.id,
        user_answer: fullTextAnswer,
        time_spent_seconds: spent,
      });
      if (nextStep) {
        setFeedbackState({
          isCorrect: nextStep.isCorrect,
          correctAnswer: nextStep.correctAnswer,
          nextStep: nextStep
        });
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Không thể gửi câu trả lời. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  }, [current, selectedAnswer, isSubmitting, onAnswer]);

  useEffect(() => {
    if (currentStep.is_completed) {
      onFinish(currentStep);
    }
  }, [currentStep, onFinish]);

  useEffect(() => {
    const rules = currentStep.applied_rules || [];
    if (rules.length === 0) return;

    const dedupKey = `${currentStep.answered_count}|${rules.join(",")}|${currentStep.theta}|${currentStep.sem}`;
    if (timelineDedupRef.current.has(dedupKey)) return;

    timelineDedupRef.current.add(dedupKey);
    setRuleTimeline((prev) => [
      ...prev,
      {
        step: currentStep.answered_count,
        rules,
        theta: currentStep.theta,
        sem: currentStep.sem,
        createdAt: new Date().toISOString(),
      },
    ]);
  }, [currentStep.applied_rules, currentStep.answered_count, currentStep.theta, currentStep.sem]);

  const ruleStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of ruleTimeline) {
      for (const rule of entry.rules) {
        counts[rule] = (counts[rule] || 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [ruleTimeline]);

  const latestRuleEvents = useMemo(() => {
    return [...ruleTimeline].reverse().slice(0, 3);
  }, [ruleTimeline]);

  if (!current) {
    return (
      <Card>
        <CardContent className="py-10 flex flex-col items-center justify-center space-y-4 text-muted-foreground">
          <p>Không còn câu hỏi phù hợp hoặc phiên làm bài bị lỗi do dữ liệu cũ.</p>
          <Button variant="outline" onClick={() => onFinish(currentStep)}>
            Bắt đầu lại (Xoá phiên cũ)
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            CAT · Câu {currentStep.answered_count + 1} / {currentStep.max_questions} · {current.questionType} · {current.topicName || current.major_topic_name}
          </p>
          <Progress value={progressPct} className="mt-1 w-64" />
        </div>
        <div className={cn(
          "flex items-center gap-2 px-3 py-1 rounded-full text-sm font-mono",
          isOverTime ? "bg-destructive/10 text-destructive" : "bg-muted"
        )}>
          <Clock className="h-4 w-4" />
          {formatTime(questionTimer)}
          <span className="text-muted-foreground">/ {current.timeDisplay || formatTime(timeLimit)}</span>
        </div>
      </div>


      {submitError && (
        <Card className="border-destructive/60 bg-destructive/5">
          <CardContent className="pt-6 text-sm text-destructive">
            {submitError}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium leading-relaxed">
            <span className="text-primary font-bold mr-2">{current.externalId}</span>
            <MathContent content={current.stem} inline />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {["A", "B", "C", "D"].map((opt) => {
            const text = current[`option${opt}` as keyof QuestionInfo] as string;
            if (!text) return null;
            const isSelected = selectedAnswer === opt;
            
            // Lógica phản hồi:
            let buttonClass = "w-full text-left p-4 rounded-lg border-2 transition-all hover:border-primary/50";
            let spanClass = "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold mr-3";
            
            if (feedbackState) {
              const isThisCorrect = text.trim().toLowerCase() === feedbackState.correctAnswer?.trim().toLowerCase();
              if (isThisCorrect) {
                buttonClass += " border-green-500 bg-green-500/10";
                spanClass += " bg-green-500 text-white";
              } else if (isSelected) {
                buttonClass += " border-red-500 bg-red-500/10";
                spanClass += " bg-red-500 text-white";
              } else {
                buttonClass += " border-border opacity-50";
                spanClass += " bg-muted";
              }
            } else {
              if (isSelected) {
                buttonClass += " border-primary bg-primary/5 ring-1 ring-primary";
                spanClass += " bg-primary text-primary-foreground";
              } else {
                buttonClass += " border-border hover:bg-accent/50";
                spanClass += " bg-muted";
              }
            }

            return (
              <button
                key={opt}
                disabled={isSubmitting || feedbackState !== null}
                onClick={() => setSelectedAnswer(opt)}
                className={buttonClass}
              >
                <span className={spanClass}>
                  {opt}
                </span>
                <MathContent content={text} inline />
              </button>
            );
          })}
        </CardContent>
      </Card>

      {feedbackState && (
        <Card className={cn(
          "border-2", 
          feedbackState.isCorrect ? "border-green-500 bg-green-500/5" : "border-red-500 bg-red-500/5"
        )}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {feedbackState.isCorrect ? (
                <div className="flex items-center text-green-600 font-bold">
                  <span className="text-xl mr-2">✓</span> Chính xác!
                </div>
              ) : (
                <div className="flex items-center text-red-600 font-bold">
                  <span className="text-xl mr-2">✕</span> Sai rồi! Đáp án đúng được tô màu xanh.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Đã trả lời: {currentStep.answered_count}/{currentStep.max_questions}
        </div>

        {feedbackState ? (
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => onFinish(feedbackState.nextStep || currentStep)}>
              Dừng lại & Nộp bài
            </Button>
            <Button onClick={() => {
              if (feedbackState.nextStep) onProceed(feedbackState.nextStep);
              setFeedbackState(null);
              setSelectedAnswer("");
            }}>
              Tiếp tục <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => onFinish(currentStep)}>
              Dừng sớm
            </Button>
            <Button onClick={handleNext} disabled={!selectedAnswer || isSubmitting}>
              {isSubmitting ? (
                "Đang cập nhật..."
              ) : (
                <>
                  Trả lời <Send className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {(currentStep.recommendations?.length ?? 0) > 0 && (
        <Card className="border-primary">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Gợi ý học lại kiến thức tiên quyết</p>
                <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                  {currentStep.recommendations.map((rec, idx) => (
                    <p key={`${rec.topic_id}-${idx}`}>
                      Topic {rec.topic_name}: ôn lại {rec.prerequisite_topic_name || "kiến thức nền"} ({rec.reason}).
                    </p>
                  ))}
                </div>
                <Button className="mt-3" variant="outline" onClick={() => onFinish(currentStep)}>
                  <Send className="h-4 w-4 mr-1" /> Xem kết quả
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
