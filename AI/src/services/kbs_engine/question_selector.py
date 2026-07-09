"""
Adaptive question selection engine.
Selects next question based on:
1. Maximum Fisher Information at current theta
2. Quiz configuration (question type distribution)
3. Topic coverage
"""
import random
from typing import Optional
from src.services.kbs_engine.irt import information_3pl


def select_quiz_questions(
    questions: list[dict],
    num_questions: int = 20,
    recognition_pct: float = 0.3,
    comprehension_pct: float = 0.5,
    application_pct: float = 0.2,
    topic_ids: Optional[list[int]] = None,
) -> list[dict]:
    """
    Select questions for a quiz based on type distribution.

    Args:
        questions: All available questions (dicts with type, topic_id, etc.)
        num_questions: Total questions to select
        recognition_pct: % Nhận biết
        comprehension_pct: % Thông hiểu
        application_pct: % Vận dụng
        topic_ids: Optional filter by topic

    Returns:
        Selected questions
    """
    # Filter by topics if specified
    if topic_ids:
        questions = [q for q in questions if q["topic_id"] in topic_ids]

    if not questions:
        return []

    # Group by type
    by_type = {"Nhận biết": [], "Thông hiểu": [], "Vận dụng": []}
    for q in questions:
        qtype = q.get("question_type", "Nhận biết")
        if qtype in by_type:
            by_type[qtype].append(q)

    # Calculate target counts
    n_recognition = round(num_questions * recognition_pct)
    n_comprehension = round(num_questions * comprehension_pct)
    n_application = num_questions - n_recognition - n_comprehension

    selected = []

    for qtype, target in [
        ("Nhận biết", n_recognition),
        ("Thông hiểu", n_comprehension),
        ("Vận dụng", n_application),
    ]:
        pool = by_type.get(qtype, [])
        if len(pool) <= target:
            selected.extend(pool)
        else:
            # Sort by difficulty (b) and sample evenly across difficulty range
            pool.sort(key=lambda q: float(q.get("difficulty_b", 0)))
            step = len(pool) / target
            indices = [int(i * step) for i in range(target)]
            selected.extend([pool[i] for i in indices])

    # If we don't have enough, fill from remaining
    if len(selected) < num_questions:
        selected_ids = {q["id"] for q in selected}
        remaining = [q for q in questions if q["id"] not in selected_ids]
        random.shuffle(remaining)
        selected.extend(remaining[: num_questions - len(selected)])

    random.shuffle(selected)
    return selected[:num_questions]


def select_next_adaptive(
    available_questions: list[dict],
    current_theta: float,
    answered_ids: set[int],
) -> Optional[dict]:
    """
    Select the next question adaptively using maximum information criterion.

    Args:
        available_questions: Pool of available questions
        current_theta: Current ability estimate
        answered_ids: Set of already-answered question IDs

    Returns:
        Best next question or None
    """
    candidates = [q for q in available_questions if q["id"] not in answered_ids]

    if not candidates:
        return None

    return select_best_by_fisher(candidates, current_theta=current_theta)


def select_best_by_fisher(
    candidates: list[dict],
    current_theta: float,
) -> Optional[dict]:
    """Pick the candidate with highest Fisher information at current theta.

    Ties are broken by smaller |b-theta|, then higher a.
    """
    if not candidates:
        return None

    best_q = None
    best_score = None

    for q in candidates:
        a = float(q.get("discrimination_a", 1.0))
        b = float(q.get("difficulty_b", 0.0))
        c = float(q.get("guessing_c", 0.25))

        info = float(information_3pl(current_theta, a, b, c))
        score = (info, -abs(b - current_theta), a)
        if best_score is None or score > best_score:
            best_score = score
            best_q = q

    return best_q


def select_batch_by_fisher(
    candidates: list[dict],
    current_theta: float,
    num_questions: int,
    recognition_pct: float = 0.3,
    comprehension_pct: float = 0.5,
    application_pct: float = 0.2,
) -> list[dict]:
    """Pick multiple candidates with highest Fisher information at current theta, 
    while respecting Bloom's taxonomy distribution.
    """
    if not candidates:
        return []
    
    # Group by type
    by_type = {"Nhận biết": [], "Thông hiểu": [], "Vận dụng": []}
    for q in candidates:
        qtype = q.get("question_type", "Nhận biết")
        if qtype in by_type:
            by_type[qtype].append(q)

    # Calculate target counts
    n_recognition = round(num_questions * recognition_pct)
    n_comprehension = round(num_questions * comprehension_pct)
    n_application = num_questions - n_recognition - n_comprehension

    selected = []

    for qtype, target in [
        ("Nhận biết", n_recognition),
        ("Thông hiểu", n_comprehension),
        ("Vận dụng", n_application),
    ]:
        pool = by_type.get(qtype, [])
        if not pool:
            continue
            
        # Score pool items by Fisher Information at current theta
        scored_pool = []
        for q in pool:
            a = float(q.get("discrimination_a", 1.0))
            b = float(q.get("difficulty_b", 0.0))
            c = float(q.get("guessing_c", 0.25))
            info = float(information_3pl(current_theta, a, b, c))
            score = (info, -abs(b - current_theta), a)
            scored_pool.append((score, q))
            
        # Sort descending by score and pick top N
        scored_pool.sort(key=lambda x: x[0], reverse=True)
        selected.extend([q for _, q in scored_pool[:target]])
        
    # If we don't have enough (due to empty pools), fill from remaining candidates
    if len(selected) < num_questions:
        selected_ids = {q["id"] for q in selected}
        remaining = [q for q in candidates if q["id"] not in selected_ids]
        
        # Score remaining
        scored_remaining = []
        for q in remaining:
            a = float(q.get("discrimination_a", 1.0))
            b = float(q.get("difficulty_b", 0.0))
            c = float(q.get("guessing_c", 0.25))
            info = float(information_3pl(current_theta, a, b, c))
            score = (info, -abs(b - current_theta), a)
            scored_remaining.append((score, q))
            
        scored_remaining.sort(key=lambda x: x[0], reverse=True)
        selected.extend([q for _, q in scored_remaining[: num_questions - len(selected)]])
    
    # Final shuffle is NOT recommended for batch exams if we want to keep them ordered by something
    # but for general use it's fine.
    return selected[:num_questions]


def prioritize_high_discrimination(
    candidates: list[dict],
    top_n: int = 10,
) -> list[dict]:
    """Shortlist high-a items for early CAT steps before Fisher selection."""
    if not candidates:
        return []

    limit = max(1, min(int(top_n), len(candidates)))
    return sorted(
        candidates,
        key=lambda q: (
            -float(q.get("discrimination_a", 0.0)),
            abs(float(q.get("difficulty_b", 0.0))),
        ),
    )[:limit]
