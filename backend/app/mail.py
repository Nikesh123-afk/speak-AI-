import asyncio
import logging
import smtplib
from collections.abc import Awaitable, Callable
from email.message import EmailMessage

from .config import Settings

log = logging.getLogger("app.mail")

Mailer = Callable[[str, str, str, dict[str, str] | None], Awaitable[None]]


def smtp_mailer(settings: Settings) -> Mailer:
    def deliver(message: EmailMessage) -> None:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            if settings.smtp_starttls:
                smtp.starttls()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)

    async def send(to: str, subject: str, body: str, headers: dict[str, str] | None = None) -> None:
        if not settings.smtp_host:
            # Development only (production refuses to start without SMTP): show the email so links can be followed.
            log.info("Email not sent (no SMTP_HOST configured)\nTo: %s\nSubject: %s\n\n%s", to, subject, body)
            return
        message = EmailMessage()
        message["From"] = settings.mail_from
        message["To"] = to
        message["Subject"] = subject
        for name, value in (headers or {}).items():
            message[name] = value
        message.set_content(body)
        await asyncio.to_thread(deliver, message)

    return send


async def send_quietly(mailer: Mailer, to: str, subject: str, body: str, headers: dict[str, str] | None = None) -> None:
    """For background tasks: a failed email is logged, never surfaced, so responses can't reveal account existence."""
    try:
        await mailer(to, subject, body, headers)
    except Exception as error:
        log.error("Email delivery failed", extra={"error_type": type(error).__name__})
