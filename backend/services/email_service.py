import os
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from pydantic import EmailStr
import logging

logger = logging.getLogger("email_service")

# Configurations for FastAPI Mail
# Using defaults/fallbacks to allow run without SMTP config
MAIL_USERNAME = os.getenv("MAIL_USERNAME", "mock_user")
MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "mock_pass")
MAIL_FROM = os.getenv("MAIL_FROM", "no-reply@folio.app")
MAIL_PORT = int(os.getenv("MAIL_PORT", 587))
MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.gmail.com")
MAIL_STARTTLS = os.getenv("MAIL_STARTTLS", "True").lower() == "true"
MAIL_SSL_TLS = os.getenv("MAIL_SSL_TLS", "False").lower() == "true"
USE_MOCK_EMAIL = os.getenv("USE_MOCK_EMAIL", "True").lower() == "true"

conf = ConnectionConfig(
    MAIL_USERNAME=MAIL_USERNAME,
    MAIL_PASSWORD=MAIL_PASSWORD,
    MAIL_FROM=MAIL_FROM,
    MAIL_PORT=MAIL_PORT,
    MAIL_SERVER=MAIL_SERVER,
    MAIL_FROM_NAME="Folio App",
    MAIL_STARTTLS=MAIL_STARTTLS,
    MAIL_SSL_TLS=MAIL_SSL_TLS,
    USE_CREDENTIALS=not USE_MOCK_EMAIL,
    VALIDATE_CERTS=True
)

async def send_otp_email(email: EmailStr, otp: str):
    """
    Sends a 6-digit OTP verification email to the user.
    If USE_MOCK_EMAIL is True, it will just log/print the OTP.
    """
    subject = "Your Folio Verification Code"
    body = f"""
    <html>
        <body>
            <p>Hello,</p>
            <p>Thank you for signing up for <strong>folio</strong>!</p>
            <p>Your 6-digit verification code is:</p>
            <h2 style="font-size: 24px; letter-spacing: 2px; color: #4A90E2;">{otp}</h2>
            <p>This code will expire in 5 minutes.</p>
            <p>If you did not request this code, please ignore this email.</p>
        </body>
    </html>
    """

    if USE_MOCK_EMAIL or MAIL_USERNAME == "mock_user":
        logger.info(f"[MOCK EMAIL] To: {email} | OTP: {otp}")
        print(f"\n========================================\n[MOCK EMAIL] TO: {email}\nOTP CODE: {otp}\n========================================\n")
        return

    message = MessageSchema(
        subject=subject,
        recipients=[email],
        body=body,
        subtype=MessageType.html
    )

    fm = FastMail(conf)
    await fm.send_message(message)
