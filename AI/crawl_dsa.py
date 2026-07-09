import requests
from bs4 import BeautifulSoup
import json
import time

def crawl_gfg_quiz(url, topic_name):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
    }
    
    print(f"--- Đang kết nối: {url} ---")
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code != 200:
            print(f"Lỗi: Không thể truy cập (Status code: {response.status_code})")
            return []
    except Exception as e:
        print(f"Lỗi kết nối: {e}")
        return []

    soup = BeautifulSoup(response.content, 'html.parser')
    dataset = []

    # GFG thường để câu hỏi trong danh sách <ol> hoặc các <div> có class chứa chữ 'question'
    # Cách 1: Tìm trong các thẻ <li> nằm trong danh sách câu hỏi
    questions = soup.find_all('li', class_=lambda x: x and 'question' in x.lower())
    
    # Cách 2: Nếu cách 1 hụt, tìm tất cả các thẻ <li>
    if not questions:
        questions = soup.find_all('li')

    for q in questions:
        try:
            # Tìm nội dung câu hỏi (thường ở trong div hoặc p đầu tiên)
            # Chúng ta tìm text của câu hỏi, thường bắt đầu bằng các thẻ div
            q_text_div = q.find('div', class_=lambda x: x and 'text' in x.lower())
            if not q_text_div:
                # Nếu không thấy div text, lấy trực tiếp nội dung của thẻ li nhưng bỏ các thẻ li con (options)
                question_text = q.contents[0].get_text(strip=True) if hasattr(q.contents[0], 'get_text') else str(q.contents[0]).strip()
            else:
                question_text = q_text_div.get_text(strip=True)

            # Lấy các lựa chọn (Options) - Thường nằm trong các thẻ <li> con hoặc radio buttons
            options = []
            option_items = q.find_all('li')
            for opt in option_items:
                opt_text = opt.get_text(strip=True)
                if opt_text and opt_text != question_text:
                    options.append(opt_text)
            
            # Nếu vẫn không thấy câu hỏi hoặc option, bỏ qua thẻ li này
            if len(question_text) < 10 or len(options) < 2:
                continue

            # Đáp án và Giải thích
            ans_div = q.find('div', class_=lambda x: x and 'answer' in x.lower())
            expl_div = q.find('div', class_=lambda x: x and 'explanation' in x.lower())
            
            answer_text = ans_div.get_text(strip=True) if ans_div else "N/A"
            explanation_text = expl_div.get_text(strip=True) if expl_div else "No explanation available."

            entry = {
                "instruction": f"Hãy soạn thảo một câu hỏi trắc nghiệm về {topic_name} trong DSA.",
                "input": f"Chủ đề: {topic_name}",
                "output": f"Câu hỏi: {question_text}\n" + 
                          "\n".join(options) + 
                          f"\n\nĐáp án đúng: {answer_text}\n" +
                          f"Giải thích: {explanation_text}"
            }
            dataset.append(entry)
            print(f"Đã lấy: {question_text[:50]}...")
            
        except:
            continue

    return dataset

# Thử nghiệm với các link Quiz thực tế (GFG hay đổi cấu trúc ở các trang này)
urls = [
    {"topic": "Linked List", "url": "https://www.sanfoundry.com/1000-data-structures-questions-answers/"},
    {"topic": "Stack", "url": "https://www.sanfoundry.com/1000-algorithms-questions-answers/"},
    {"topic": "Queue", "url": "https://www.indiabix.com/computer-science/data-structures/"},
    {"topic": "Tree", "url": "https://www.indiabix.com/computer-science/algorithms/"}
]

final_data = []
for item in urls:
    data = crawl_gfg_quiz(item['url'], item['topic'])
    final_data.extend(data)
    time.sleep(3)

if final_data:
    with open('dsa_dataset.jsonl', 'w', encoding='utf-8') as f:
        for entry in final_data:
            json.dump(entry, f, ensure_ascii=False)
            f.write('\n')
    print(f"\n--- THÀNH CÔNG: Đã lấy được {len(final_data)} mẫu dữ liệu! ---")
else:
    print("\n--- THẤT BẠI: Vẫn chưa lấy được dữ liệu. Có thể trang web yêu cầu đăng nhập hoặc dùng JavaScript. ---")