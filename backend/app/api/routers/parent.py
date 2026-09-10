from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_guardian
from app.schemas.parent import (
    ParentCareInfoUpdateRequest,
    ParentLoginRequest,
    ParentLoginResponse,
    ParentSignupRequest,
)
from app.services.parent_service import (
    analyze_parent_medication_images,
    create_parent,
    login_parent,
    update_parent_care_info,
    update_parent_care_info_with_images,
)
from app.services.guardian_auth_service import GuardianPrincipal

router = APIRouter(prefix="/parents", tags=["parents"])


@router.get("/test")
def parent_test():
    return {"message": "parents router ok"}


@router.post("/signup")
def parent_signup(payload: ParentSignupRequest, db: Session = Depends(get_db)):
    try:
        return create_parent(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=ParentLoginResponse)
def parent_login(payload: ParentLoginRequest, db: Session = Depends(get_db)):
    try:
        return login_parent(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{parent_user_id}/care-info")
def parent_care_info_update(
    parent_user_id: str,
    payload: ParentCareInfoUpdateRequest,
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    if parent_user_id != principal.elder_user_id:
        raise HTTPException(status_code=403, detail="다른 사용자의 건강정보는 수정할 수 없습니다.")
    try:
        return update_parent_care_info(db, parent_user_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{parent_user_id}/medication-image-analysis")
async def parent_medication_image_analysis(
    parent_user_id: str,
    document_type: str = Form("medication_bag"),
    images: Optional[List[UploadFile]] = File(None),
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    if parent_user_id != principal.elder_user_id:
        raise HTTPException(status_code=403, detail="다른 사용자의 건강정보는 분석할 수 없습니다.")
    try:
        return await analyze_parent_medication_images(
            db=db,
            parent_user_id=parent_user_id,
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
    principal: GuardianPrincipal = Depends(get_current_guardian),
    db: Session = Depends(get_db),
):
    if parent_user_id != principal.elder_user_id:
        raise HTTPException(status_code=403, detail="다른 사용자의 건강정보는 수정할 수 없습니다.")
    try:
        return await update_parent_care_info_with_images(
            db=db,
            parent_user_id=parent_user_id,
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
