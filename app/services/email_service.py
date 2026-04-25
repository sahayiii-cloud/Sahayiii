import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
import os

SMTP_USER = os.getenv("GMAIL_USER")
SMTP_PASS = os.getenv("GMAIL_PASS")

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587

EMAIL_TO = os.getenv("REPORT_EMAIL") or SMTP_USER


def send_email(subject: str, body: str, attachment_path: str = None):
    recipients = EMAIL_TO.split(",")

    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = SMTP_USER
    msg["To"] = ", ".join(recipients)

    msg.attach(MIMEText(body, "plain"))

    if attachment_path:
        with open(attachment_path, "rb") as f:
            part = MIMEApplication(f.read(), Name="report.pdf")
            part['Content-Disposition'] = 'attachment; filename="report.pdf"'
            msg.attach(part)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_USER, recipients, msg.as_string())