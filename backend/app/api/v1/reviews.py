
from app.database import get_db
from app.schemas.review import ReviewCreate, ReviewResponse
from app.services.review_service import list_reviews, process_review_sampling_for_submitted_tasks, submit_review
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

router = APIRouter(tags=["QA & Reviews"])


@router.post("/reviews", response_model=ReviewResponse, status_code=201)
def api_submit_review(data: ReviewCreate, db: Session = Depends(get_db)):
    rev = submit_review(db, data)
    return ReviewResponse(
        id=rev.id,
        task_id=rev.task_id,
        campaign_id=rev.campaign_id,
        reviewer_id=rev.reviewer_id,
        verdict=rev.verdict,
        reason_code=rev.reason_code,
        comment=rev.comment,
        created_at=rev.created_at,
        updated_at=rev.updated_at,
    )


@router.get("/reviews", response_model=list[ReviewResponse])
def api_list_reviews(
    campaign_id: str | None = Query(None),
    task_id: str | None = Query(None),
    reviewer_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    reviews = list_reviews(db, campaign_id=campaign_id, task_id=task_id, reviewer_id=reviewer_id)
    return [
        ReviewResponse(
            id=r.id,
            task_id=r.task_id,
            campaign_id=r.campaign_id,
            reviewer_id=r.reviewer_id,
            verdict=r.verdict,
            reason_code=r.reason_code,
            comment=r.comment,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in reviews
    ]


@router.post("/campaigns/{campaign_id}/reviews/sample")
def api_sample_submitted_tasks(campaign_id: str, db: Session = Depends(get_db)):
    return process_review_sampling_for_submitted_tasks(db, campaign_id)
