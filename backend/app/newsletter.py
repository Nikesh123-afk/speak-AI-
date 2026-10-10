"""Send a plain-text newsletter to confirmed subscribers.

    python -m app.newsletter "Subject line" body.txt           # dry run: shows the recipient count
    python -m app.newsletter "Subject line" body.txt --send    # sends

Every email carries a one-click unsubscribe link and List-Unsubscribe headers.
"""
import argparse
import asyncio
from pathlib import Path
from urllib.parse import quote

from sqlalchemy import select

from .config import get_settings
from .db import create_engine, resolve_database_url
from .mail import smtp_mailer
from .models import Subscriber
from .routers.meta import newsletter_link
from .security import sign


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("subject")
    parser.add_argument("body", type=Path)
    parser.add_argument("--send", action="store_true", help="actually send (default is a dry run)")
    args = parser.parse_args()

    settings = get_settings()
    body = args.body.read_text(encoding="utf-8").strip()
    engine = create_engine(resolve_database_url(settings))
    async with engine.connect() as connection:
        emails = (await connection.execute(
            select(Subscriber.email).where(Subscriber.confirmed_at.is_not(None)).order_by(Subscriber.email))).scalars().all()
    await engine.dispose()
    print(f"{len(emails)} confirmed subscribers.")
    if not args.send:
        print("Dry run. Add --send to deliver.")
        return

    mailer = smtp_mailer(settings)
    sent = 0
    for email in emails:
        link = newsletter_link(settings, "unsubscribe", email)
        one_click = f"{settings.app_origin}/api/subscribe/one-click?email={quote(email)}&token={sign(settings, 'newsletter-unsubscribe', email)}"
        try:
            await mailer(email, args.subject, f"{body}\n\n—\nUnsubscribe: {link}",
                         {"List-Unsubscribe": f"<{one_click}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"})
            sent += 1
        except Exception as error:  # keep going; report at the end
            print(f"Failed: {email} ({type(error).__name__})")
    print(f"Sent {sent} of {len(emails)}.")


if __name__ == "__main__":
    asyncio.run(main())
