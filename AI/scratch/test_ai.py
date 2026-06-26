import requests
import json

url = "http://localhost:8000/api/cat/generate-batch"
payload = {
    "subjectId": "83ce7b88-5c65-475c-b7e4-6ca5c9dbd4fe",
    "currentTheta": 0.0,
    "numQuestions": 10,
    "recognition_pct": 0.3,
    "comprehension_pct": 0.5,
    "application_pct": 0.2,
    "candidates": [
        {"id": "q1", "topicId": "t1", "a": 1.0, "b": 0.0, "c": 0.25, "questionType": "Nhận biết"},
        {"id": "q2", "topicId": "t1", "a": 1.0, "b": 0.0, "c": 0.25, "questionType": "Thông hiểu"},
        {"id": "q3", "topicId": "t1", "a": 1.0, "b": 0.0, "c": 0.25, "questionType": "Vận dụng"},
        {"id": "q4", "topicId": "t1", "a": 1.2, "b": 0.1, "c": 0.2, "questionType": "Nhận biết"},
        {"id": "q5", "topicId": "t1", "a": 1.5, "b": -0.2, "c": 0.1, "questionType": "Thông hiểu"},
    ]
}

try:
    response = requests.post(url, json=payload)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
except Exception as e:
    print(f"Error: {e}")
