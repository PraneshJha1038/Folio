import cloudinary
import cloudinary.uploader
from fastapi import UploadFile, HTTPException, status
from settings import CLOUDINARY_CONFIG

cloudinary.config(
    cloud_name=CLOUDINARY_CONFIG['cloud_name'],
    api_key=CLOUDINARY_CONFIG['api_key'],
    api_secret=CLOUDINARY_CONFIG['api_secret'],
    secure=True
)

def upload_file_to_cloudinary(file: UploadFile) -> str:
    """
    Synchronously uploads an uploaded file to Cloudinary.
    Since we support PDF and EPUB (non-image files), we set resource_type to 'raw'.
    Returns the secure URL of the uploaded file.
    """
    try:
        # Read file content
        file_content = file.file.read()
        
        # Upload
        response = cloudinary.uploader.upload(
            file_content,
            public_id=file.filename,
            resource_type="raw"
        )
        
        secure_url = response.get("secure_url")
        if not secure_url:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Cloudinary did not return a secure URL"
            )
        return secure_url
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload file to Cloudinary: {str(e)}"
        )
