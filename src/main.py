import os
import sys

# Add the project root to sys.path to support 'from src...' imports when run directly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["TRANSFORMERS_NO_TENSORFLOW"] = "1"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["USE_TORCH"] = "1"
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from typing import List, Optional
from src.services.kbs_engine.irt import estimate_ability_3pl
from src.services.kbs_engine.question_selector import select_best_by_fisher, select_batch_by_fisher
from src.services.rag_service import rag_service

load_dotenv()

app = FastAPI(
    title="AI Exam Generator Service",
    description="FastAPI backend for RAG-based exam generation using Llama 3 + ChromaDB",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_TEMP = "temp_uploads"
os.makedirs(UPLOAD_TEMP, exist_ok=True)


class GenerateRequest(BaseModel):
    query: str
    num_questions: int = 10
    difficulty: Optional[str] = "mixed"
    is_specific_topic: bool = False
    filename: Optional[str] = None

class AnswerHistoryItem(BaseModel):
    questionId: str
    isCorrect: bool
    a: float
    b: float
    c: float
    topicId: str
    timeSpent: Optional[int] = 0

class QuestionCandidate(BaseModel):
    id: str
    topicId: str
    a: float
    b: float
    c: float
    questionType: str

class NextQuestionRequest(BaseModel):
    sessionId: str
    subjectId: str
    currentTheta: float = 0.0
    answerHistory: List[AnswerHistoryItem] = []
    candidates: List[QuestionCandidate] = []


# ─── Health ──────────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
async def root():
    return {"message": "AI Exam Generator Service is online", "status": "ok"}


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}


# ─── Ingest ──────────────────────────────────────────────────────────────────

@app.post("/ingest", tags=["RAG"])
async def ingest_document(file: UploadFile = File(...)):
    """Upload a PDF and index it into ChromaDB for future RAG queries."""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ file PDF")

    file_path = os.path.join(UPLOAD_TEMP, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        num_chunks = rag_service.ingest_pdf(file_path)
        return {
            "filename": file.filename,
            "status": "indexed",
            "chunks": num_chunks,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)


# ─── Generate ────────────────────────────────────────────────────────────────

@app.post("/api/exams/generate")
async def generate_exam(req: GenerateRequest):
    """Generate exam questions from indexed documents using RAG + LLM."""
    try:
        exam_data = rag_service.generate_exam(
            req.query, 
            req.num_questions, 
            req.difficulty, 
            req.is_specific_topic, 
            req.filename
        )
        return {"exam": exam_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── CAT ──────────────────────────────────────────────────────────────────────

@app.post("/api/cat/next-question", tags=["CAT"])
async def next_cat_question(req: NextQuestionRequest):
    """Tính toán IRT và chọn câu hỏi thích ứng tiếp theo."""
    # 1. Ước lượng lại năng lực nếu đã có lịch sử làm bài
    responses = [
        {"a": r.a, "b": r.b, "c": r.c, "is_correct": r.isCorrect} 
        for r in req.answerHistory
    ]
    
    new_theta = req.currentTheta
    new_sem = 999.0
    if responses:
        estimation = estimate_ability_3pl(responses)
        new_theta = estimation["theta_map"]
        new_sem = estimation["posterior_sd"]

    # 2. Kiểm tra điều kiện dừng bài thi (Đạt chuẩn SEM hoặc vượt quá số câu)
    is_finished = False
    if new_sem < 0.3 or len(req.answerHistory) >= 30:
        is_finished = True
        return {
            "newTheta": new_theta,
            "newSem": new_sem,
            "questionId": None,
            "isFinished": True,
            "rules": ["Stop condition met: SEM < 0.3 or Max Questions reached"]
        }

    # 3. Chọn câu tiếp theo dùng Fisher Information
    available_q = [
        {
            "id": c.id, 
            "discrimination_a": c.a, 
            "difficulty_b": c.b, 
            "guessing_c": c.c,
            "topic_id": c.topicId,
            "question_type": c.questionType
        }
        for c in req.candidates
    ]

    best_q = select_best_by_fisher(available_q, current_theta=new_theta)

    if not best_q:
        is_finished = True
        
    return {
        "newTheta": new_theta,
        "newSem": new_sem,
        "questionId": best_q["id"] if best_q else None,
        "isFinished": is_finished,
        "rules": ["Fisher Information Maximum"]
    }

class GenerateBatchRequest(BaseModel):
    subjectId: str
    currentTheta: float = 0.0
    numQuestions: int = 20
    recognition_pct: float = 0.3
    comprehension_pct: float = 0.5
    application_pct: float = 0.2
    candidates: List[QuestionCandidate] = []

@app.post("/api/cat/generate-batch", tags=["CAT"])
async def generate_cat_batch(req: GenerateBatchRequest):
    """Chọn ra N câu hỏi phù hợp nhất với năng lực hiện tại."""
    
    available_q = [
        {
            "id": c.id, 
            "discrimination_a": c.a, 
            "difficulty_b": c.b, 
            "guessing_c": c.c,
            "topic_id": c.topicId,
            "question_type": c.questionType
        }
        for c in req.candidates
    ]

    selected_q = select_batch_by_fisher(
        available_q, 
        req.currentTheta, 
        req.numQuestions,
        recognition_pct=req.recognition_pct,
        comprehension_pct=req.comprehension_pct,
        application_pct=req.application_pct
    )
    selected_ids = [q["id"] for q in selected_q]

    return {
        "questionIds": selected_ids,
        "targetTheta": req.currentTheta,
    }

class ScoreBatchRequest(BaseModel):
    initialTheta: float = 0.0
    answerHistory: List[AnswerHistoryItem] = []

@app.post("/api/cat/score-batch", tags=["CAT"])
async def score_cat_batch(req: ScoreBatchRequest):
    """Tính toán lại năng lực (Theta) sau khi nộp nguyên bộ đề."""
    responses = [
        {"a": r.a, "b": r.b, "c": r.c, "is_correct": r.isCorrect} 
        for r in req.answerHistory
    ]
    
    new_theta = req.initialTheta
    new_sem = 999.0
    if responses:
        estimation = estimate_ability_3pl(responses)
        # We blend the initial theta with the newly estimated theta to prevent wild jumps
        estimated_theta = estimation["theta_map"]
        new_theta = (req.initialTheta * 0.3) + (estimated_theta * 0.7)
        new_sem = estimation["posterior_sd"]

    return {
        "newTheta": new_theta,
        "newSem": new_sem,
    }


# ─── Info ─────────────────────────────────────────────────────────────────────

@app.get("/info", tags=["RAG"])
async def collection_info():
    """Return stats about the ChromaDB collection."""
    return rag_service.list_collection_info()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)
