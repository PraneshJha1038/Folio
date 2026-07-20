import logging
import httpx
from pydantic import EmailStr
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

    try:
        if not mail_settings.RESEND_API_KEY:
            raise ValueError("Resend API key is missing")

        headers = {
            "Authorization": f"Bearer {mail_settings.RESEND_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "from": "Folio <onboarding@resend.dev>",
            "to": [email],
            "subject": subject,
            "html": body
        }

        async with httpx.AsyncClient() as client:
            response = await client.post("https://api.resend.com/emails", json=payload, headers=headers)
            
            # Log the full error from Resend if it fails (often due to unverified domain/email)
            if response.status_code >= 400:
                raise ValueError(f"Resend API error: {response.text}")
                
            response.raise_for_status()
            
        logger.info(f"OTP email sent successfully to {email} via Resend")
    except Exception as e:
        logger.warning(f"Failed to send email to {email}: {e}. Falling back to mock email.")
        print(f"\n========================================\n[FALLBACK MOCK EMAIL] TO: {email}\nOTP CODE: {otp}\n========================================\n")
        raise e