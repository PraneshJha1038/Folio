import cloudinary
import cloudinary.uploader
import os
import asyncio

cloudinary.config( 
  cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"), 
  api_key = os.getenv("CLOUDINARY_API_KEY"), 
  api_secret = os.getenv("CLOUDINARY_API_SECRET") 
)

async def upload_file(file_bytes: bytes, filename: str) -> str:
    """
    Uploads a file to Cloudinary and returns the secure URL.
    """
    loop = asyncio.get_running_loop()
    def _upload():
        response = cloudinary.uploader.upload(
            file_bytes, 
            resource_type="auto", 
            public_id=filename
        )
        return response.get("secure_url")
    
    return await loop.run_in_executor(None, _upload)
