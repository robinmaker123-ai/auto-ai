from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.search import SearchRun
from app.models.user import User
from app.schemas.search import SearchHistoryItem, SearchRequest, SearchResultBundle
from app.services.web_search import SearchAgent, web_search_service


router = APIRouter(prefix="/search", tags=["search"])


@router.post("", response_model=SearchResultBundle)
def run_search(
    payload: SearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SearchResultBundle:
    mode = SearchAgent.effective_mode(payload.mode)
    result = web_search_service.execute(
        db,
        user_id=current_user.id,
        query=payload.query,
        mode=mode,
    )
    db.commit()
    return result


@router.get("/history", response_model=list[SearchHistoryItem])
def search_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SearchRun]:
    return list(
        db.scalars(
            select(SearchRun)
            .where(SearchRun.user_id == current_user.id)
            .order_by(SearchRun.created_at.desc())
            .limit(100)
        )
    )


@router.get("/history/{run_id}", response_model=SearchHistoryItem)
def search_history_item(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SearchRun:
    run = db.scalar(select(SearchRun).where(SearchRun.id == run_id, SearchRun.user_id == current_user.id))
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Search run not found")
    return run
