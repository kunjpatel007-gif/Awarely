import os
import smtplib
from email.message import EmailMessage
import logging
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load environment variables from .env if it exists in the root
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

def send_followup_email(patient_id: str) -> tuple[bool, str]:
    """
    Attempts to send a real SMTP email.
    Returns (True, email_body) if successful, (False, email_body) if credentials missing/failed.
    """
    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
    target_email = os.getenv("TARGET_EMAIL", "").strip()
    
    # Format the email body
    email_body = f"""
Dear Patient {patient_id},

Based on recent telemetry and pharmacy refill patterns from your continuous monitoring device, your care team at Dummy Hospitals would like to schedule a brief follow-up consultation to optimize your medication plan.

Please log into your patient portal or call the clinic at 1-800-DUMMY to confirm a time.

Best regards,
Automated Clinical Dispatch System
Dummy Hospitals
    """.strip()

    # The formatted string for the UI alert
    ui_display_string = f"""
From: {smtp_user or 'auto-dispatch@dummy-hospital.org'}
To: {target_email or f'patient-{patient_id}@patient-portal.org'}
Subject: Important: Follow-up Consultation Required

{email_body}
    """.strip()

    if not smtp_user or not smtp_password or not target_email:
        logger.warning("SMTP credentials missing. Falling back to simulated dispatch.")
        return False, ui_display_string

    # Strip spaces from app password (often copied as "abcd efgh ijkl mnop")
    smtp_password = smtp_password.replace(" ", "")

    msg = EmailMessage()
    msg.set_content(email_body)
    msg['Subject'] = "Important: Follow-up Consultation Required"
    msg['From'] = smtp_user
    msg['To'] = target_email

    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.ehlo()
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.send_message(msg)
        server.quit()
        logger.info(f"Successfully dispatched real email to {target_email} for patient {patient_id}")
        return True, ui_display_string
    except Exception as e:
        logger.error(f"Failed to send email via SMTP: {e}")
        return False, ui_display_string
