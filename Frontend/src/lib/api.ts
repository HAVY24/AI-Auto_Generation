import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const api = axios.create({
    baseURL: API_BASE,
    headers: { 'Content-Type': 'application/json' },
});

// ─── Request interceptor: attach JWT ─────────────────────────────────────────
api.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token');
        if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config; 
});

// ─── Response interceptor: redirect on 401 ───────────────────────────────────
api.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401 && typeof window !== 'undefined') {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        return Promise.reject(err);
    }
);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
    register: (data: { email: string; password: string; name?: string }) =>
        api.post('/api/auth/register', data),
    login: (data: { email: string; password: string }) =>
        api.post('/api/auth/login', data),
    me: () => api.get('/api/auth/me'),
};

// ─── Documents ───────────────────────────────────────────────────────────────
export const documentsApi = {
    upload: (file: File) => {
        const form = new FormData();
        form.append('file', file);
        return api.post('/api/documents/upload', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    list: () => api.get('/api/documents'),
    getById: (id: string) => api.get(`/api/documents/${id}`),
    remove: (id: string) => api.delete(`/api/documents/${id}`),
};

// ─── Exams ────────────────────────────────────────────────────────────────────
export const examsApi = {
    generate: (data: {
        documentId: string;
        title?: string;
        subjectName?: string;
        query?: string;
        num_questions?: number;
        difficulty?: string;
    }) => api.post('/api/exams/generate', data),
    list: () => api.get('/api/exams'),
    getById: (id: string) => api.get(`/api/exams/${id}`),
    update: (id: string, data: { title?: string; content?: unknown }) =>
        api.patch(`/api/exams/${id}`, data),
    remove: (id: string) => api.delete(`/api/exams/${id}`),
};

export default api;

// ─── KBS Types ──────────────────────────────────────────────────────────────
export interface SubjectSummary {
  id: string; // changed from number since Prisma uses UUID strings
  name: string;
  description?: string;
  total_questions: number;
  total_topics: number;
}

export interface TopicInfo {
  id: string;
  major_topic_id: string;
  code?: string;
  name: string;
  order_index: number;
  question_count: number;
}

export interface QuizConfig {
  subject_id: string;
  num_questions: number;
  recognition_pct: number;
  comprehension_pct: number;
  application_pct: number;
  topic_ids?: string[];
}

export interface QuestionInfo {
  id: string;
  externalId: string;
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  difficultyB: number;
  discriminationA: number;
  guessingC: number;
  questionType: string;
  major_topic_name?: string;
  timeLimitSeconds?: number;
  timeDisplay?: string;
  topicName?: string;
}

export interface CATAnswerSubmit {
  question_id: string;
  user_answer: string;
  time_spent_seconds: number;
}

export interface LearningRecommendation {
  topic_id: string;
  topic_name: string;
  prerequisite_topic_id?: string;
  prerequisite_topic_name?: string;
  reason: string;
}

export interface CATStepInfo {
  session_id: string;
  question?: QuestionInfo;
  theta: number;
  sem: number;
  answered_count: number;
  max_questions: number;
  is_completed: boolean;
  stop_reason?: string;
  bloom_classification?: string;
  applied_rules: string[];
  theta_history: number[];
  recommendations: LearningRecommendation[];
  isCorrect?: boolean;
  correctAnswer?: string;
}

export interface BatchExamStartResult {
  session: {
    id: string;
    userId: string;
    subjectId: string;
    thetaEstimate: number;
    sem: number;
    totalQuestions: number;
  };
  questions: QuestionInfo[];
}

export interface QuizResultInfo {
  session: {
    id: string;
    subject_id?: string;
    subject_name: string;
    correct_answers: number;
    total_questions: number;
    theta_estimate: number;
  };
  results: {
    is_correct: boolean;
    user_answer: string;
    time_spent_seconds: number;
    question: any;
  }[];
  topic_scores: Record<string, {
    total: number;
    correct: number;
    mastery: string;
  }>;
  accuracy: number;
  sem: number;
  answered_count: number;
  bloom_classification?: string;
}

export interface InferenceRuleLogInfo {
  id: string;
  rule_code: string;
  step_index: number;
  question_id?: string;
  question_external_id?: string;
  question_stem?: string;
  reason: string;
  answered_at?: string;
}

export interface BatchExamSubmitResult {
  session: {
    id: string;
    completedAt: string;
    thetaEstimate: number;
    sem: number;
    totalScore: number;
    correctAnswers: number;
  };
  correctAnswers: number;
  totalQuestions: number;
  newTheta: number;
  newSem: number;
}

// ─── KBS Knowledge ──────────────────────────────────────────────────────────
export const knowledgeAPI = {
  getSubjects: () => api.get<SubjectSummary[]>('/api/knowledge/subjects').then(r => r.data),
};

// ─── KBS Quiz ───────────────────────────────────────────────────────────────
export const quizAPI = {
  startCAT: (config: QuizConfig) =>
    api.post<CATStepInfo>('/api/cat/start', { subjectId: config.subject_id }).then(r => r.data),
    
  answerCAT: (sessionId: string, payload: CATAnswerSubmit) =>
    api.post<CATStepInfo>('/api/cat/answer', {
      sessionId,
      questionId: payload.question_id,
      userAnswer: payload.user_answer,
      timeSpentSeconds: payload.time_spent_seconds
    }).then(r => r.data),

  startBatchExam: (config: QuizConfig) =>
    api.post<BatchExamStartResult>('/api/cat/start-batch', { 
      subjectId: config.subject_id, 
      numQuestions: config.num_questions,
      recognition_pct: config.recognition_pct,
      comprehension_pct: config.comprehension_pct,
      application_pct: config.application_pct
    }).then(r => r.data),

  submitBatchExam: (sessionId: string, answers: { questionId: string; userAnswer: string; timeSpentSeconds: number }[]) =>
    api.post<BatchExamSubmitResult>('/api/cat/submit-batch', { sessionId, answers }).then(r => r.data),
  
  getSessionResults: (sessionId: string) =>
    api.get(`/api/cat/session/${sessionId}`).then(r => r.data),

  getResults: (sessionId: number | string) =>
    api.get<QuizResultInfo>(`/api/cat/results/${sessionId}`).then(r => r.data),

  getRuleLogs: (sessionId: number | string) =>
    api.get<InferenceRuleLogInfo[]>(`/api/cat/rule-logs/${sessionId}`).then(r => r.data),
};

export const authAPI = authApi; // For backward compatibility
