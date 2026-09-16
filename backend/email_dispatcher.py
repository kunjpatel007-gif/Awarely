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

def send_jitai_reminder_email(patient_id: str, medications: list) -> tuple[bool, str]:
    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
    target_email = os.getenv("TARGET_EMAIL", "").strip()
    
    meds_str = "\n".join([f"- {med['name']} — {med['time']}" for med in medications])
    
    email_body = f"""
Dear Patient {patient_id},

We noticed elevated stress indicators from your continuous monitoring device. Please take a moment to relax and breathe.

Your currently scheduled medications:
{meds_str}

If symptoms persist, please call the hospital emergency line at 1-800-DUMMY or visit the nearest emergency department immediately.

Best regards,
Automated Clinical Dispatch System
Dummy Hospitals
    """.strip()

    ui_display_string = f"""
From: {smtp_user or 'auto-dispatch@dummy-hospital.org'}
To: {target_email or f'patient-{patient_id}@patient-portal.org'}
Subject: Health Alert: Stress Indicators Detected

{email_body}
    """.strip()

    if not smtp_user or not smtp_password or not target_email:
        logger.warning("SMTP credentials missing. Falling back to simulated dispatch.")
        return False, ui_display_string

    smtp_password = smtp_password.replace(" ", "")

    msg = EmailMessage()
    msg.set_content(email_body)
    msg['Subject'] = "Health Alert: Stress Indicators Detected"
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

def send_refill_reminder_email(patient_id: str, medications: list) -> tuple[bool, str]:
    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
    target_email = os.getenv("TARGET_EMAIL", "").strip()
    
    meds_str = "\n".join([f"- {med['name']} — {med['time']}" for med in medications])
    
    email_body = f"""
Dear Patient {patient_id},

Our records indicate you may be due for a medication refill. Please ensure the following prescriptions are up to date:
{meds_str}

Contact your pharmacy or call us at 1-800-DUMMY to arrange a refill.

Best regards,
Automated Clinical Dispatch System
Dummy Hospitals
    """.strip()

    ui_display_string = f"""
From: {smtp_user or 'auto-dispatch@dummy-hospital.org'}
To: {target_email or f'patient-{patient_id}@patient-portal.org'}
Subject: Reminder: Medication Refill Due

{email_body}
    """.strip()

    if not smtp_user or not smtp_password or not target_email:
        logger.warning("SMTP credentials missing. Falling back to simulated dispatch.")
        return False, ui_display_string

    smtp_password = smtp_password.replace(" ", "")

    msg = EmailMessage()
    msg.set_content(email_body)
    msg['Subject'] = "Reminder: Medication Refill Due"
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

def send_missed_appointment_email(patient_id: str, medications: list) -> tuple[bool, str]:
    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
    target_email = os.getenv("TARGET_EMAIL", "").strip()
    
    meds_str = "\n".join([f"- {med['name']} — {med['time']}" for med in medications])
    
    email_body = f"""
Dear Patient {patient_id},

We noticed you missed a recently scheduled appointment. Staying on track with your care plan is important for managing your health effectively.

As a reminder, your current medications are:
{meds_str}

Please call us at 1-800-DUMMY to reschedule your appointment at the earliest convenience.

Best regards,
Automated Clinical Dispatch System
Dummy Hospitals
    """.strip()

    ui_display_string = f"""
From: {smtp_user or 'auto-dispatch@dummy-hospital.org'}
To: {target_email or f'patient-{patient_id}@patient-portal.org'}
Subject: Action Required: Missed Appointment

{email_body}
    """.strip()

    if not smtp_user or not smtp_password or not target_email:
        logger.warning("SMTP credentials missing. Falling back to simulated dispatch.")
        return False, ui_display_string

    smtp_password = smtp_password.replace(" ", "")

    msg = EmailMessage()
    msg.set_content(email_body)
    msg['Subject'] = "Action Required: Missed Appointment"
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

