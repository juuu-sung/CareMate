from pydantic import BaseModel


class ParentSignupRequest(BaseModel):
    name: str
    birth: str
    gender: str
    address: str
    phone: str


class ParentCareInfoUpdateRequest(BaseModel):
    address: str = ""
    medications: str = ""
    diseases: str = ""
    allergies: str = ""
    hospital: str = ""
    doctor_contact: str = ""
    memo: str = ""