from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from pydantic import EmailStr
import os
from dotenv import load_dotenv

load_dotenv()

conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME", "dummy@example.com"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD", "dummy_password"),
    MAIL_FROM=os.getenv("MAIL_FROM", "noreply@readlater.com"),
    MAIL_PORT=int(os.getenv("MAIL_PORT", 587)),
    MAIL_SERVER=os.getenv("MAIL_SERVER", "smtp.gmail.com"),
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True
)

async def send_otp_email(email_to: EmailStr, otp: str):
    html = f"""
    <p>Welcome to ReadLater!</p>
    <p>Your OTP for signup is: <strong>{otp}</strong></p>
    <p>This OTP will expire in 5 minutes.</p>
    """

    message = MessageSchema(
        subject="Your ReadLater OTP",
        recipients=[email_to],
        body=html,
        subtype=MessageType.html
    )

    fm = FastMail(conf)
    try:
        await fm.send_message(message)
    except Exception as e:
        print(f"Failed to send OTP email to {email_to}: {e}")
