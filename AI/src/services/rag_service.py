import os
import json
from typing import TypedDict, List
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_ollama import OllamaLLM
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_core.prompts import PromptTemplate
from langgraph.graph import StateGraph, START, END

class ExamState(TypedDict):
    context: str
    num_questions: int
    difficulty_instruction: str
    topic_instruction: str
    retry_note: str
    raw_response: str
    parsed_questions: list
    errors: str
    attempts: int

class RAGService:
    def __init__(self):
        self.model_name = os.getenv("MODEL_NAME", "llama3")
        self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.persist_directory = os.getenv("PERSIST_DIRECTORY", "./data/chroma")

        # Use sentence-transformers for fast, local embeddings
        self.embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2",
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )

        # LLM via Ollama
        self.llm = OllamaLLM(
            model=self.model_name,
            base_url=self.ollama_url,
            temperature=0.7,
            num_predict=8192,
        )

        self._prompt_template = PromptTemplate(
            template="""Bạn là một chuyên gia giáo dục và tâm trắc học được giao nhiệm vụ soạn đề thi trắc nghiệm (Multiple Choice Questions - MCQ) dựa trên tài liệu được cung cấp.
Nhiệm vụ của bạn là đọc kỹ NỘI DUNG TÀI LIỆU và tạo ra BẮT BUỘC {num_questions} câu hỏi trắc nghiệm.

YÊU CẦU QUAN TRỌNG NHẤT (NẾU VI PHẠM SẼ BỊ PHẠT NẶNG):
1. BẤT KỂ TÀI LIỆU GỐC LÀ TIẾNG ANH HAY TIẾNG GÌ, TOÀN BỘ CÂU HỎI, ĐÁP ÁN, VÀ GIẢI THÍCH BẮT BUỘC PHẢI DỊCH SANG TIẾNG VIỆT 100%.
2. Trường "question" KHÔNG ĐƯỢC chứa tiếng Anh. (Ví dụ: Đừng viết "What is HTML?", phải viết "HTML là gì?").
3. Trường "options" KHÔNG ĐƯỢC chứa tiếng Anh (Trừ khi đó là thuật ngữ chuyên ngành).
4. KHÔNG lấy thông tin ngoài tài liệu. Chỉ dựa vào NỘI DUNG TÀI LIỆU.
5. KHÔNG ghi thêm phần giải thích vào bên trong trường "question". Lời giải thích chỉ viết vào "explanation".

{difficulty_instruction}
{topic_instruction}

---
NỘI DUNG TÀI LIỆU CẦN RA ĐỀ:
{context}

---
{errors}
HƯỚNG DẪN ĐỊNH DẠNG (BẮT BUỘC LÀM THEO):
Bạn phải trả về một mảng JSON duy nhất. KHÔNG sinh thêm bất kỳ văn bản nào ngoài mảng JSON. 
Với mỗi câu hỏi, BẮT BUỘC phải thực hiện Zero-shot Parameterization để sinh 3 thông số Tâm trắc học (IRT):
- "a" (Độ phân biệt): Float từ 0.5 đến 2.5 (Ví dụ: 1.2)
- "b" (Độ khó): Float từ -3.0 đến 3.0 (Ví dụ: -0.5)
- "c" (Độ đoán mò): Float cố định khoảng 0.2 hoặc 0.25

Cấu trúc mỗi phần tử trong mảng phải chính xác như ví dụ sau:
[
  {{
    "topic": "Tên chủ đề trích từ tài liệu",
    "question": "Nội dung câu hỏi bằng tiếng Việt?",
    "options": [
      "Đáp án sai 1",
      "Đáp án đúng",
      "Đáp án sai 2",
      "Đáp án sai 3"
    ],
    "answer": "Đáp án đúng",
    "explanation": "Giải thích chi tiết tại sao đáp án này đúng dựa trên tài liệu.",
    "a": 1.5,
    "b": 0.8,
    "c": 0.25
  }}
]

JSON OUTPUT:
""",
            input_variables=["context", "num_questions", "difficulty_instruction", "topic_instruction", "errors"],
        )
        
        self.graph = self._build_graph()

    def _build_graph(self):
        workflow = StateGraph(ExamState)

        def generator_node(state: ExamState):
            batch_size = state["num_questions"]
            retry_note = state["retry_note"]
            error_msg = ""
            if state["errors"]:
                error_msg = f"LƯU Ý - LẦN CHẠY TRƯỚC BỊ LỖI Validator Agent phát hiện:\n{state['errors']}\n-> HÃY SỬA NHỮNG LỖI NÀY VÀ SINH LẠI TOÀN BỘ MẢNG JSON CHO CHUẨN.\n\n"
            
            formatted_prompt = self._prompt_template.format(
                context=state["context"], 
                num_questions=batch_size, 
                difficulty_instruction=state["difficulty_instruction"], 
                topic_instruction=state["topic_instruction"],
                errors=error_msg
            )
            formatted_prompt = formatted_prompt.replace("JSON OUTPUT:", retry_note + "\n\nJSON OUTPUT:")
            
            print(f"[Generator Agent] Attempt {state['attempts']+1} - Generating {batch_size} questions...")
            response = self.llm.invoke(formatted_prompt)
            return {"raw_response": response, "attempts": state["attempts"] + 1}

        def validator_node(state: ExamState):
            raw = state["raw_response"]
            import json_repair
            print(f"[Validator Agent] Tier 1: Validating JSON Structure...")
            try:
                parsed_data = json_repair.loads(raw)
                parsed_list = []
                if isinstance(parsed_data, dict):
                    if "questions" in parsed_data and isinstance(parsed_data["questions"], list):
                        parsed_list = parsed_data["questions"]
                    else:
                        parsed_list = [parsed_data]
                elif isinstance(parsed_data, tuple):
                    parsed_list = list(parsed_data)
                elif isinstance(parsed_data, list):
                    parsed_list = parsed_data

                valid_items = []
                errors = []
                print(f"[Validator Agent] Tier 2: Validating IRT Schema...")
                
                if not isinstance(parsed_list, list) or len(parsed_list) == 0:
                     return {"errors": "Mảng JSON trống hoặc không đúng định dạng danh sách.", "parsed_questions": []}

                for idx, item in enumerate(parsed_list):
                    if not isinstance(item, dict):
                        continue
                    
                    missing_keys = []
                    for key in ['question', 'options', 'answer', 'explanation', 'a', 'b', 'c']:
                        if key not in item:
                            missing_keys.append(key)
                    
                    if missing_keys:
                        errors.append(f"Câu hỏi thứ {idx+1} thiếu các trường: {', '.join(missing_keys)}")
                        continue
                    
                    if not isinstance(item['options'], list) or len(item['options']) < 4:
                        errors.append(f"Câu hỏi thứ {idx+1} phải có ít nhất 4 phương án (options).")
                        continue
                        
                    # Validate IRT params
                    try:
                        item['a'] = float(item['a'])
                        item['b'] = float(item['b'])
                        item['c'] = float(item['c'])
                        if not (-3.5 <= item['b'] <= 3.5):
                            errors.append(f"Câu hỏi thứ {idx+1} có độ khó (b) nằm ngoài khoảng cho phép [-3.5, 3.5].")
                            continue
                    except ValueError:
                        errors.append(f"Câu hỏi thứ {idx+1} có tham số IRT (a,b,c) không phải là số (Float).")
                        continue

                    # Tier 3: Language Validation (Force Vietnamese)
                    q_lower = item.get('question', '').lower()
                    english_stopwords = [' what ', ' how ', ' why ', ' is ', ' the ', ' are ', ' in ', ' of ', ' to ', ' and ']
                    has_english = False
                    for word in english_stopwords:
                        if word in f" {q_lower} ":
                            has_english = True
                            break
                    
                    if has_english:
                        errors.append(f"Câu hỏi thứ {idx+1} vi phạm quy tắc ngôn ngữ (Phát hiện chứa tiếng Anh). BẮT BUỘC PHẢI DỊCH SANG TIẾNG VIỆT 100% HIỂU CHƯA?")
                        continue

                    valid_items.append(item)

                if errors:
                    error_str = "Danh sách lỗi (Feedback Loop):\n- " + "\n- ".join(errors)
                    print(f"[Validator Agent] Found {len(errors)} validation errors. Triggering Feedback Loop.")
                    return {"errors": error_str, "parsed_questions": valid_items}
                
                print("[Validator Agent] All Checks Passed. Clean data ready.")
                return {"errors": "", "parsed_questions": valid_items}
                
            except Exception as e:
                print(f"[Validator Agent] Tier 1 Parsing failed: {e}")
                return {"errors": f"Lỗi cú pháp JSON nghiêm trọng: {e}. Vui lòng chỉ sinh mảng JSON hợp lệ theo đúng ví dụ.", "parsed_questions": []}

        def route(state: ExamState):
            # Finish if no errors or max attempts reached
            if not state.get("errors") or state["attempts"] >= 3:
                return END
            # Otherwise, feedback loop to generator
            print("[Orchestrator] Routing back to Generator Agent (Self-Correction)...")
            return "generator"

        workflow.add_node("generator", generator_node)
        workflow.add_node("validator", validator_node)
        
        workflow.add_edge(START, "generator")
        workflow.add_edge("generator", "validator")
        workflow.add_conditional_edges("validator", route, {END: END, "generator": "generator"})
        
        return workflow.compile()

    def ingest_pdf(self, file_path: str) -> int:
        loader = PyPDFLoader(file_path)
        documents = loader.load()

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=800,
            chunk_overlap=100,
            separators=["\n\n", "\n", ".", " ", ""],
        )
        chunks = splitter.split_documents(documents)

        Chroma.from_documents(
            documents=chunks,
            embedding=self.embeddings,
            persist_directory=self.persist_directory,
        )
        return len(chunks)

    def generate_exam(self, query: str, num_questions: int = 10, difficulty: str = "mixed", is_specific_topic: bool = False, filename: str = None) -> list | dict:
        vector_db = Chroma(
            persist_directory=self.persist_directory,
            embedding_function=self.embeddings,
        )

        search_k = max(15, int(num_questions * 1.5))
        fetch_k = search_k * 3

        search_kwargs = {"k": search_k}
        if filename:
            search_kwargs["filter"] = {"source": f"temp_uploads\\{filename}"}

        if is_specific_topic:
            docs = vector_db.similarity_search(query, **search_kwargs)
            topic_instruction = f"BẮT BUỘC TẬP TRUNG TOÀN BỘ câu hỏi vào CHỦ ĐỀ YÊU CẦU: '{query}'. Đừng chia đều cho các chủ đề khác."
        else:
            search_kwargs["fetch_k"] = fetch_k
            docs = vector_db.max_marginal_relevance_search(query, **search_kwargs)
            topic_instruction = "Xác định tất cả các 'Dạng kiến thức' hoặc 'Chủ đề chính' có trong NỘI DUNG. BẮT BUỘC phải chia đều số lượng câu hỏi cho từng dạng kiến thức/chủ đề vừa tìm được."

        if not docs:
            return {"error": "Không tìm thấy nội dung liên quan. Hãy upload tài liệu trước."}
        
        difficulty_instruction = "Mức độ Hỗn hợp: Rải đều từ dễ đến khó. Kết hợp cả câu hỏi lý thuyết và bài tập áp dụng."
        if difficulty == "easy":
            difficulty_instruction = "Mức độ Dễ: Tập trung vào nhận biết, ghi nhớ khái niệm cơ bản. Hỏi thẳng vào định nghĩa lý thuyết."
        elif difficulty == "hard":
            difficulty_instruction = "Mức độ Khó: BẮT BUỘC PHẢI TẠO CÁC BÀI TẬP ÁP DỤNG, TÍNH TOÁN, HOẶC PHÂN TÍCH TÌNH HUỐNG. Học sinh phải suy luận. Đáp án có độ nhiễu cao."

        all_questions = []
        remaining_questions = num_questions
        
        doc_chunks = []
        for i in range(0, len(docs), 5):
            doc_chunks.append(docs[i:i+5])
        if not doc_chunks:
            doc_chunks.append(docs)

        chunk_idx = 0
        while remaining_questions > 0:
            batch_size = min(remaining_questions, 5)
            current_batch_docs = doc_chunks[chunk_idx % len(doc_chunks)]
            context = "\n\n".join(doc.page_content for doc in current_batch_docs)
            
            retry_note = f"\nLƯU Ý QUAN TRỌNG: TẠO {batch_size} CÂU HỎI. TOÀN BỘ CÂU HỎI VÀ ĐÁP ÁN BẮT BUỘC PHẢI DỊCH SANG TIẾNG VIỆT."
            
            initial_state: ExamState = {
                "context": context,
                "num_questions": batch_size,
                "difficulty_instruction": difficulty_instruction,
                "topic_instruction": topic_instruction,
                "retry_note": retry_note,
                "raw_response": "",
                "parsed_questions": [],
                "errors": "",
                "attempts": 0
            }
            
            print(f"\n[System] Starting LangGraph Multi-Agent Pipeline for {batch_size} questions...")
            final_state = self.graph.invoke(initial_state)
            
            valid_qs = final_state.get("parsed_questions", [])
            if valid_qs:
                # Deduplicate
                seen_stems = set(q['question'] for q in all_questions)
                for q in valid_qs:
                    if q['question'] not in seen_stems:
                        seen_stems.add(q['question'])
                        all_questions.append(q)
            
            remaining_questions = num_questions - len(all_questions)
            chunk_idx += 1
            
            # Prevent infinite fallback if model fails consistently
            if chunk_idx > max(10, num_questions):
                break

        if not all_questions:
            return {"error": "Lỗi định dạng cấu trúc nghiêm trọng: Hệ thống Multi-Agent không thể tự phục hồi chuỗi JSON sau 3 lần phản hồi."}
            
        return all_questions[:num_questions]

    def list_collection_info(self) -> dict:
        try:
            vector_db = Chroma(
                persist_directory=self.persist_directory,
                embedding_function=self.embeddings,
            )
            count = vector_db._collection.count()
            return {"total_chunks": count, "persist_directory": self.persist_directory}
        except Exception as e:
            return {"error": str(e)}

rag_service = RAGService()
