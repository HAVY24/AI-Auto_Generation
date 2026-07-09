import sys
from src.services.kbs_engine.question_selector import select_batch_by_fisher

candidates = [
    {"id": 1, "discrimination_a": 1.0, "difficulty_b": -3.0, "guessing_c": 0.25, "question_type": None},
    {"id": 2, "discrimination_a": 1.0, "difficulty_b": -2.0, "guessing_c": 0.25, "question_type": None},
    {"id": 3, "discrimination_a": 1.0, "difficulty_b": -1.0, "guessing_c": 0.25, "question_type": None},
]

print(select_batch_by_fisher(candidates, -3.0, 3))
