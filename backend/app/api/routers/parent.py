from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import (
    CarePrincipal,
    get_current_care_principal,
    get_current_elder,
    require_elder_access,
)
from app.schemas.parent import (
    ParentCareInfoUpdateRequest,
    ParentLoginRequest,
    ParentLoginResponse,
    ParentSignupResponse,
    ParentSignupRequest,
)
from app.services.parent_service import (
    analyze_parent_medication_images,
    create_parent,
    login_parent,
    update_parent_care_info,
    update_parent_care_info_with_images,
)
from app.services.elder_auth_service import ElderPrincipal, revoke_elder_session_by_id
from app.core.rate_limit import enforce_rate_limit

router = APIRouter(prefix="/parents", tags=["parents"])


@router.get("/test")
def parent_test():
    return {"message": "parents router ok"}


@router.post("/signup", response_model=ParentSignupResponse)
def parent_signup(
    request: Request,
    payload: ParentSignupRequest,
    db: Session = Depends(get_db),
):
    enforce_rate_limit(request, scope="parent-signup", max_requests=5, window_seconds=300)
    try:
        return create_parent(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=ParentLoginResponse)
def parent_login(
    request: Request,
    payload: ParentLoginRequest,
    db: Session = Depends(get_db),
):
    enforce_rate_limit(request, scope="parent-login", max_requests=10, window_seconds=300)
    try:
        return login_parent(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def parent_logout(
    principal: ElderPrincipal = Depends(get_current_elder),
    db: Session = Depends(get_db),
) -> Response:
    revoke_elder_session_by_id(db, principal.session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{parent_user_id}/care-info")
def parent_care_info_update(
    parent_user_id: str,
    payload: ParentCareInfoUpdateRequest,
    principal: CarePrincipal = Depends(get_current_care_principal),
    db: Session = Depends(get_db),
):
    target_elder_user_id = require_elder_access(principal, parent_user_id)
    try:
        return update_parent_care_info(db, target_elder_user_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{parent_user_id}/medication-image-analysis")
async def parent_medication_image_analysis(
    request: Request,
    parent_user_id: str,
    document_type: str = Form("medication_bag"),
    images: Optional[List[UploadFile]] = File(None),
    principal: CarePrincipal = Depends(get_current_care_principal),
    db: Session = Depends(get_db),
):
    enforce_rate_limit(
        request,
        scope="medical-image-analysis",
        max_requests=10,
        window_seconds=300,
        actor_id=principal.actor_user_id,
    )
    target_elder_user_id = require_elder_access(principal, parent_user_id)
    try:
        return await analyze_parent_medication_images(
            db=db,
            parent_user_id=target_elder_user_id,
            document_type=document_type,
            images=images or [],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="약 사진 분석 중 서버 오류가 발생했습니다.",
        )


@router.put("/{parent_user_id}/care-info-with-images")
async def parent_care_info_update_with_images(
    request: Request,
    parent_user_id: str,
    medications: str = Form(""),
    diseases: str = Form(""),
    allergies: str = Form(""),
    hospital: str = Form(""),
    doctor_contact: str = Form(""),
    memo: str = Form(""),
    medication_entries_json: str = Form(""),
    prescription_images: Optional[List[UploadFile]] = File(None),
    medication_bag_images: Optional[List[UploadFile]] = File(None),
    disease_document_images: Optional[List[UploadFile]] = File(None),
    allergy_document_images: Optional[List[UploadFile]] = File(None),
    principal: CarePrincipal = Depends(get_current_care_principal),
    db: Session = Depends(get_db),
):
    enforce_rate_limit(
        request,
        scope="care-info-image-upload",
        max_requests=10,
        window_seconds=300,
        actor_id=principal.actor_user_id,
    )
    target_elder_user_id = require_elder_access(principal, parent_user_id)
    try:
        return await update_parent_care_info_with_images(
            db=db,
            parent_user_id=target_elder_user_id,
            medications=medications,
            diseases=diseases,
            allergies=allergies,
            hospital=hospital,
            doctor_contact=doctor_contact,
            memo=memo,
            medication_entries_json=medication_entries_json,
            prescription_images=prescription_images or [],
            medication_bag_images=medication_bag_images or [],
            disease_document_images=disease_document_images or [],
            allergy_document_images=allergy_document_images or [],
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="건강정보 저장 중 서버 오류가 발생했습니다.",
        )
