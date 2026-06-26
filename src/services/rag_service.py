import os
import json
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_ollama import OllamaLLM
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_core.prompts import PromptTemplate

class RAGService:
    def __init__(self):
        self.model_name = os.getenv("MODEL_NAME", "llama3")
        self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.persist_directory = os.getenv("PERSIST_DIRECTORY", "./data/chroma")

        # Use sentence-transformers for fast, local embeddings (no Ollama needed for this)
        self.embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2",
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )

        # LLM via Ollama (the fine-tuned model or llama3)
        self.llm = OllamaLLM(
            model=self.model_name,
            base_url=self.ollama_url,
            temperature=0.7,
            num_predict=8192,
        )

        self._prompt_template = PromptTemplate(
            template="""Bạn là một chuyên gia giáo dục được giao nhiệm vụ soạn đề thi trắc nghiệm (Multiple Choice Questions - MCQ) dựa trên tài liệu được cung cấp.
Nhiệm vụ của bạn là đọc kỹ NỘI DUNG TÀI LIỆU và tạo ra BẮT BUỘC {num_questions} câu hỏi trắc nghiệm.

YÊU CẦU QUAN TRỌNG NHẤT (NẾU VI PHẠM SẼ BỊ PHẠT NẶNG):
1. BẤT KỂ TÀI LIỆU GỐC LÀ TIẾNG ANH HAY TIẾNG GÌ, TOÀN BỘ CÂU HỎI, ĐÁP ÁN, VÀ GIẢI THÍCH BẮT BUỘC PHẢI DỊCH SANG TIẾNG VIỆT 100%.
2. Trường "question" KHÔNG ĐƯỢC chứa tiếng Anh. (Ví dụ: Đừng viết "What is HTML?", phải viết "HTML là gì?").
3. Trường "options" KHÔNG ĐƯỢC chứa tiếng Anh (Trừ khi đó là thuật ngữ chuyên ngành không thể dịch như tên thẻ HTML, tên biến).
4. KHÔNG lấy thông tin ngoài tài liệu. Chỉ dựa vào NỘI DUNG TÀI LIỆU được cung cấp bên dưới.
5. TUYỆT ĐỐI KHÔNG ghi thêm phần giải thích, ví dụ "[Giải thích: ...]", vào bên trong trường "question". Lời giải thích chỉ được viết duy nhất vào trường "explanation".

{difficulty_instruction}
{topic_instruction}

---
NỘI DUNG TÀI LIỆU CẦN RA ĐỀ:
{context}

---
HƯỚNG DẪN ĐỊNH DẠNG (BẮT BUỘC LÀM THEO):
Bạn phải trả về một mảng JSON duy nhất. Cấu trúc mỗi phần tử trong mảng phải chính xác như ví dụ sau:
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
    "difficultyLevel": 2
  }}
]

JSON OUTPUT:
""",
            input_variables=["context", "num_questions", "difficulty_instruction", "topic_instruction"],
        )

    def ingest_pdf(self, file_path: str) -> int:
        """Load PDF, split into chunks, store in ChromaDB. Returns number of chunks."""
        loader = PyPDFLoader(file_path)
        documents = loader.load()

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=800,
            chunk_overlap=100,
            separators=["\n\n", "\n", ".", " ", ""],
        )
        chunks = splitter.split_documents(documents)

        # Chroma 0.4+ auto-persists when persist_directory is set
        Chroma.from_documents(
            documents=chunks,
            embedding=self.embeddings,
            persist_directory=self.persist_directory,
        )
        return len(chunks)

    def generate_exam(self, query: str, num_questions: int = 10, difficulty: str = "mixed", is_specific_topic: bool = False, filename: str = None) -> list | dict:
        """Retrieve relevant chunks and generate exam questions as JSON."""
        vector_db = Chroma(
            persist_directory=self.persist_directory,
            embedding_function=self.embeddings,
        )

        # Calculate dynamic k to ensure enough context for large question numbers
        search_k = max(15, int(num_questions * 1.5))
        fetch_k = search_k * 3

        search_kwargs = {"k": search_k}
        if filename:
            search_kwargs["filter"] = {"source": f"temp_uploads\\{filename}"}

        if is_specific_topic:
            # Use similarity search to focus strictly on the topic
            docs = vector_db.similarity_search(query, **search_kwargs)
            topic_instruction = f"BẮT BUỘC TẬP TRUNG TOÀN BỘ câu hỏi vào CHỦ ĐỀ YÊU CẦU: '{query}'. Đừng chia đều cho các chủ đề khác."
        else:
            # Use MMR to get a diverse set of chunks covering the whole document
            search_kwargs["fetch_k"] = fetch_k
            docs = vector_db.max_marginal_relevance_search(query, **search_kwargs)
            topic_instruction = "Xác định tất cả các 'Dạng kiến thức' hoặc 'Chủ đề chính' có trong NỘI DUNG. BẮT BUỘC phải chia đều số lượng câu hỏi cho từng dạng kiến thức/chủ đề vừa tìm được."

        if not docs:
            return {"error": "Không tìm thấy nội dung liên quan. Hãy upload tài liệu trước."}
        
        # Determine difficulty instruction
        difficulty_instruction = "Mức độ Hỗn hợp: Rải đều từ dễ đến khó. Kết hợp cả câu hỏi lý thuyết và bài tập áp dụng."
        if difficulty == "easy":
            difficulty_instruction = "Mức độ Dễ: Tập trung vào nhận biết, ghi nhớ khái niệm cơ bản. Hỏi thẳng vào định nghĩa lý thuyết."
        elif difficulty == "hard":
            difficulty_instruction = "Mức độ Khó: BẮT BUỘC PHẢI TẠO CÁC BÀI TẬP ÁP DỤNG, TÍNH TOÁN, HOẶC PHÂN TÍCH TÌNH HUỐNG. TUYỆT ĐỐI KHÔNG HỎI LÝ THUYẾT SUÔNG. Học sinh phải dùng giấy nháp suy luận, áp dụng công thức hoặc quy tắc logic trong văn bản để tìm ra đáp án. Đáp án có độ nhiễu rất cao."

        all_questions = []
        remaining_questions = num_questions
        attempts = 0
        max_attempts = max(10, (num_questions // 5) + 5) # Allow enough attempts

        # CHUNK THE DOCS to avoid context window overflow
        # If we pass all docs at once, the LLM truncates the prompt and forgets to output Vietnamese.
        doc_chunks = []
        for i in range(0, len(docs), 5):
            doc_chunks.append(docs[i:i+5])
        if not doc_chunks:
            doc_chunks.append(docs)

        while remaining_questions > 0 and attempts < max_attempts:
            # CHIA NHỎ SỐ LƯỢNG: Yêu cầu 5 câu mỗi lần để mô hình 8B không bị quá tải và giữ đúng cấu trúc JSON
            batch_size = min(remaining_questions, 5)
            
            # Pick a different subset of docs for each attempt
            current_batch_docs = doc_chunks[attempts % len(doc_chunks)]
            context = "\n\n".join(doc.page_content for doc in current_batch_docs)
            
            retry_note = f"\nLƯU Ý QUAN TRỌNG: TẠO {batch_size} CÂU HỎI. TOÀN BỘ CÂU HỎI VÀ ĐÁP ÁN BẮT BUỘC PHẢI DỊCH SANG TIẾNG VIỆT."
            
            formatted_prompt = self._prompt_template.format(
                context=context, num_questions=batch_size, difficulty_instruction=difficulty_instruction, topic_instruction=topic_instruction
            )
            formatted_prompt = formatted_prompt.replace("JSON OUTPUT:", retry_note + "\n\nJSON OUTPUT:")
            
            print(f"[RAGService] Sending prompt for attempt {attempts+1}...")
            response = self.llm.invoke(formatted_prompt)

            prev_len = len(all_questions)

            try:
                import json_repair
                # Let json_repair handle the raw response string directly
                parsed_data = json_repair.loads(response)
                
                # Normalize parsed_data to a list
                parsed_list = []
                if isinstance(parsed_data, dict):
                    # It might be {"questions": [...]} or just a single question {...}
                    if "questions" in parsed_data and isinstance(parsed_data["questions"], list):
                        parsed_list = parsed_data["questions"]
                    else:
                        parsed_list = [parsed_data]
                elif isinstance(parsed_data, tuple):
                    parsed_list = list(parsed_data)
                elif isinstance(parsed_data, list):
                    parsed_list = parsed_data

                    if isinstance(parsed_list, list):
                        # Validate that the parsed items actually have the right fields
                        valid_items = [
                            item for item in parsed_list 
                            if isinstance(item, dict) and 'question' in item and 'options' in item and isinstance(item['options'], list) and len(item['options']) >= 4
                        ]
                        all_questions.extend(valid_items)
                        
                        # Loại bỏ các câu hỏi trùng lặp (nếu AI bị lặp lại)
                        unique_questions = []
                        seen_stems = set()
                        for q in all_questions:
                            if q['question'] not in seen_stems:
                                seen_stems.add(q['question'])
                                unique_questions.append(q)
                        all_questions = unique_questions
                        
                        remaining_questions = num_questions - len(all_questions)
            except Exception as e:
                print(f"[RAGService] JSON parse error on attempt {attempts+1}: {e}")
            
            if attempts > 0 and len(all_questions) == prev_len:
                print(f"[RAGService] No new questions generated on attempt {attempts+1}. Breaking early to prevent infinite loop.")
                break

            attempts += 1

        if not all_questions:
            return {"error": "Lỗi format – Model không trả về mảng JSON hợp lệ sau nhiều lần thử."}
            
        # Guarantee exact number of questions by slicing if it overgenerated
        return all_questions[:num_questions]

    def list_collection_info(self) -> dict:
        """Return basic info about the indexed ChromaDB collection."""
        try:
            vector_db = Chroma(
                persist_directory=self.persist_directory,
                embedding_function=self.embeddings,
            )
            count = vector_db._collection.count()
            return {"total_chunks": count, "persist_directory": self.persist_directory}
        except Exception as e:
            return {"error": str(e)}


# Singleton instance
rag_service = RAGService()
