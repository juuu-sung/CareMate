from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_guardian
from app.schemas.health_analysis import DailyHealthAnalysisResponse, UtteranceHealthAnalysisResponse
from app.services.guardian_auth_service import GuardianPrincipal

router = APIRouter(prefix="/guardians", tags=["health-analysis"])


@router.get(
    "/elders/{elder_user_id}/health-analysis/daily",
    response_model=DailyHealthAnalysisResponse,
)
def get_elder_daily_health(
    elder_user_id: str,
    start_date: date = Query(default=None),
    end_date: date = Query(default=None),
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
) -> DailyHealthAnalysisResponse:
    if elder_user_id != principal.elder_user_id:
        raise HTTPException(status_code=403, detail="다른 사용자의 건강정보에는 접근할 수 없습니다.")
    today = date.today()
    if end_date is None:
        end_date = today
    if start_date is None:
        start_date = end_date - timedelta(days=13)

    try:
        from app.services.guardian_health_service import get_daily_health_analysis
        data = get_daily_health_analysis(
            db,
            elder_user_id=elder_user_id,
            link_code=principal.link_code,
            start_date=start_date,
            end_date=end_date,
        )
        return DailyHealthAnalysisResponse(**data)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.get(
    "/elders/{elder_user_id}/health-analysis/utterances",
    response_model=UtteranceHealthAnalysisResponse,
)
def get_elder_utterance_health(
    elder_user_id: str,
    limit: int = Query(default=40, le=100),
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
) -> UtteranceHealthAnalysisResponse:
    if elder_user_id != principal.elder_user_id:
        raise HTTPException(status_code=403, detail="다른 사용자의 건강정보에는 접근할 수 없습니다.")
    try:
        from app.services.guardian_health_service import get_utterance_health_analysis
        data = get_utterance_health_analysis(
            db,
            elder_user_id=elder_user_id,
            link_code=principal.link_code,
            limit=limit,
        )
        return UtteranceHealthAnalysisResponse(**data)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
