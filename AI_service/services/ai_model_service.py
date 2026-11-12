import os
import logging
import math
from typing import NoReturn

import httpx
from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from AI_service import settings
from AI_service.context.business_context import SYSTEM_PROMPT
from AI_service.errors import (
    AIProviderAuthenticationError,
    AIProviderError,
    AIProviderResponseError,
    AIProviderTimeoutError,
)


logger = logging.getLogger(__name__)
MODEL = settings.GEMINI_MODEL
client = genai.Client(
    http_options=types.HttpOptions(timeout=settings.GEMINI_TIMEOUT_MS)
)


def _log_provider_failure(
    failure_kind: str,
    error: Exception | None = None,
    provider_status: int | None = None
) -> None:
    logger.warning(
        "Gemini provider request failed.",
        extra={
            "event": "ai_provider_failure",
            "provider": "gemini",
            "failure_kind": failure_kind,
            "error_type": type(error).__name__ if error else None,
            "provider_status": provider_status
        }
    )


def _raise_provider_error(error: Exception) -> NoReturn:
    if isinstance(error, AIProviderError):
        raise error
    if isinstance(error, (TimeoutError, httpx.TimeoutException)):
        _log_provider_failure("timeout", error)
        raise AIProviderTimeoutError from error
    if isinstance(error, genai_errors.APIError):
        status = error.code
        message = (error.message or "").casefold()
        invalid_api_key = (
            status == 400
            and "api key" in message
            and ("invalid" in message or "not valid" in message)
        )
        if status in {401, 403} or invalid_api_key:
            _log_provider_failure("authentication", error, status)
            raise AIProviderAuthenticationError from error
        if status in {408, 504}:
            _log_provider_failure("timeout", error, status)
            raise AIProviderTimeoutError from error
        _log_provider_failure(
            "provider_rate_limit" if status == 429 else "unavailable",
            error,
            status
        )
        raise AIProviderError from error
    if isinstance(error, (httpx.NetworkError, ConnectionError, OSError)):
        _log_provider_failure("connection", error)
        raise AIProviderError from error
    _log_provider_failure("unexpected_provider_error", error)
    raise AIProviderError from error


def _ensure_api_key() -> None:
    if not os.getenv("GEMINI_API_KEY"):
        _log_provider_failure("missing_api_key")
        raise AIProviderAuthenticationError


def generate_answer(prompt: str) -> str:
    _ensure_api_key()
    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT
            )
        )
    except Exception as exc:
        _raise_provider_error(exc)

    try:
        text = response.text
    except (AttributeError, TypeError, ValueError) as exc:
        _log_provider_failure("invalid_response", exc)
        raise AIProviderResponseError from exc
    if not isinstance(text, str) or not text.strip():
        _log_provider_failure("invalid_response")
        raise AIProviderResponseError
    return text.strip()


def create_embedding(text: str, task_type: str) -> list[float]:
    _ensure_api_key()
    try:
        result = client.models.embed_content(
            model=settings.GEMINI_EMBEDDING_MODEL,
            contents=text,
            config=types.EmbedContentConfig(task_type=task_type)
        )
    except Exception as exc:
        _raise_provider_error(exc)

    try:
        values = result.embeddings[0].values
        if not values:
            raise ValueError("Empty embedding.")
        if any(
            isinstance(value, bool) or not isinstance(value, (int, float))
            for value in values
        ):
            raise ValueError("Non-numeric embedding.")
        vector = [float(value) for value in values]
        if not all(math.isfinite(value) for value in vector):
            raise ValueError("Non-finite embedding.")
    except (AttributeError, IndexError, TypeError, ValueError, OverflowError) as exc:
        _log_provider_failure("invalid_embedding", exc)
        raise AIProviderResponseError from exc
    return vector
