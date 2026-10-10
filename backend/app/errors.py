import logging

import sentry_sdk

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("app")


class AppError(Exception):
    """An error whose message is safe to show to the user."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def error_response(request: Request, status: int, message: str, **extra) -> JSONResponse:
    headers = {"Retry-After": "60"} if status == 429 else None
    body = {"error": message, "requestId": getattr(request.state, "request_id", None), **extra}
    return JSONResponse(body, status_code=status, headers=headers)


def install(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error(request: Request, error: AppError):
        return error_response(request, error.status, error.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError):
        fields = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in error.errors()]
        return error_response(request, 400, "Please check the submitted fields.", fields=fields)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, error: StarletteHTTPException):
        return error_response(request, error.status_code, "Not found." if error.status_code == 404 else "Invalid request.")

    @app.exception_handler(Exception)
    async def unexpected(request: Request, error: Exception):
        # Production logs carry the type only: messages from drivers and providers can contain user data.
        # Sentry (when SENTRY_DSN is set) gets the stack trace, with bodies, locals and PII disabled.
        request_id = getattr(request.state, "request_id", None)
        sentry_sdk.capture_exception(error)
        log.error("Request failed", exc_info=None if request.app.state.settings.production else error,
                  extra={"request_id": request_id, "error_type": type(error).__name__})
        return error_response(request, 500, "Something went wrong. Please try again.")
