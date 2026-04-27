import os
import uuid
from fastapi import UploadFile


UPLOAD_ROOT_DIR = "uploads"


def get_file_extension(filename: str) -> str:
    if not filename or "." not in filename:
        return "jpg"

    return filename.rsplit(".", 1)[-1].lower()


async def save_upload_file(file: UploadFile, sub_dir: str) -> str:
    folder_path = os.path.join(UPLOAD_ROOT_DIR, sub_dir)
    os.makedirs(folder_path, exist_ok=True)

    extension = get_file_extension(file.filename)
    file_name = f"{uuid.uuid4()}.{extension}"
    file_path = os.path.join(folder_path, file_name)

    content = await file.read()

    with open(file_path, "wb") as buffer:
        buffer.write(content)

    return file_path