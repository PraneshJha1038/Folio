import os
from dotenv import load_dotenv

load_dotenv()
CLOUDINARY_CONFIG = {
    'cloud_name' : os.getenv('CLOUDINARY_CLOUD_NAME'),
    'api_key': os.getenv('ClOUDINARY_API_KEY'),
    'api_secret': os.getenv('CLOUDINARY_API_SECRET')
}
