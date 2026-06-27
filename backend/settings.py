import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings
from pydantic import SecretStr

load_dotenv()

CLOUDINARY_CONFIG = {
    'cloud_name' : os.getenv('CLOUDINARY_CLOUD_NAME'),
    'api_key': os.getenv('ClOUDINARY_API_KEY'),
    'api_secret': os.getenv('CLOUDINARY_API_SECRET')
}

class MailSettings(BaseSettings):
    MAIL_USERNAME: str = os.getenv("MAIL_USERNAME", "")
    MAIL_PASSWORD: str = os.getenv("MAIL_PASSWORD", "")
    MAIL_FROM: str = os.getenv("MAIL_FROM", "")
    MAIL_PORT: int = int(os.getenv("MAIL_PORT", 587))
    MAIL_SERVER: str = os.getenv("MAIL_SERVER", "smtp.gmail.com")
    MAIL_STARTTLS: bool = os.getenv("MAIL_STARTTLS", "True").lower() == "true"
    MAIL_SSL_TLS: bool = os.getenv("MAIL_SSL_TLS", "False").lower() == "true"
    USE_CREDENTIALS: bool = True
    VALIDATE_CERTS: bool = True

mail_settings = MailSettings()