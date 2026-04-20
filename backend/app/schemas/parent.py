from pydantic import BaseModel


class ParentSignupRequest(BaseModel):
    name: str
    birth: str
    gender: str
    address: str
    phone: str


class ParentLoginRequest(BaseModel):
    phone: str
    birth: str


class ParentLoginResponse(BaseModel):
    parent_id: str
    parent_name: str
    link_code: str
    guardian_phone: str = ""
    message: str = "부모님 로그인이 완료되었습니다."


class ParentCareInfoUpdateRequest(BaseModel):
    address: str = ""
    medications: str = ""
    diseases: str = ""
    allergies: str = ""
    hospital: str = ""
    doctor_contact: str = ""
    memo: str = ""
