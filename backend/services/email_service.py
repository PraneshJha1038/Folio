import logging
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from pydantic import EmailStr,SecretStr
from settings import mail_settings

logger = logging.getLogger("email_service")

async def send_otp_email(email: EmailStr, otp: str):
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

    message = MessageSchema(
        subject=subject,
        recipients=[email],
        body=body,
        subtype=MessageType.html
    )

    try:
        if not mail_settings.MAIL_USERNAME or not mail_settings.MAIL_PASSWORD:
            raise ValueError("Mail configuration is incomplete")

        conf = ConnectionConfig(
            MAIL_USERNAME=mail_settings.MAIL_USERNAME,
            MAIL_PASSWORD=mail_settings.MAIL_PASSWORD,
            MAIL_FROM=mail_settings.MAIL_FROM,
            MAIL_PORT=mail_settings.MAIL_PORT,
            MAIL_SERVER=mail_settings.MAIL_SERVER,
            MAIL_FROM_NAME="Folio App",
            MAIL_STARTTLS=mail_settings.MAIL_STARTTLS,
            MAIL_SSL_TLS=mail_settings.MAIL_SSL_TLS,
            USE_CREDENTIALS=mail_settings.USE_CREDENTIALS,
            VALIDATE_CERTS=mail_settings.VALIDATE_CERTS
        )
        
        fm = FastMail(conf)
        await fm.send_message(message)
        logger.info(f"OTP email sent successfully to {email}")
    except Exception as e:
        logger.warning(f"Failed to send email to {email}: {e}. Falling back to mock email.")
        print(f"\n========================================\n[FALLBACK MOCK EMAIL] TO: {email}\nOTP CODE: {otp}\n========================================\n")
        raise e