import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from google.genai import errors as genai_errors

from AI_service.errors import (
    AIProviderAuthenticationError,
    AIProviderError,
    AIProviderResponseError,
    AIProviderTimeoutError,
)
from AI_service.services import ai_model_service


class AIModelServiceTests(unittest.TestCase):
    def test_invalid_key_is_sanitized_and_logged_without_provider_details(self):
        for status, provider_message in (
            (401, "secret-provider-response"),
            (400, "API key not valid: secret-provider-response")
        ):
            api_error = genai_errors.ClientError(
                status,
                {"message": provider_message}
            )
            with (
                self.subTest(status=status),
                patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}),
                patch.object(
                    ai_model_service.client.models,
                    "generate_content",
                    side_effect=api_error
                ),
                self.assertLogs(
                    "AI_service.services.ai_model_service",
                    level="WARNING"
                ) as captured
            ):
                with self.assertRaises(AIProviderAuthenticationError):
                    ai_model_service.generate_answer(
                        "private customer question"
                    )

            logged = "\n".join(
                record.getMessage() for record in captured.records
            )
            self.assertNotIn("secret-provider-response", logged)
            self.assertNotIn("private customer question", logged)
            self.assertEqual(
                captured.records[0].failure_kind,
                "authentication"
            )
            self.assertEqual(captured.records[0].provider_status, status)

    def test_timeout_and_connection_failures_are_classified(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            with patch.object(
                ai_model_service.client.models,
                "generate_content",
                side_effect=httpx.ReadTimeout("sensitive timeout detail")
            ):
                with self.assertRaises(AIProviderTimeoutError):
                    ai_model_service.generate_answer("question")
            with patch.object(
                ai_model_service.client.models,
                "generate_content",
                side_effect=httpx.ConnectError("sensitive host detail")
            ):
                with self.assertRaises(AIProviderError) as raised:
                    ai_model_service.generate_answer("question")
        self.assertNotIsInstance(raised.exception, AIProviderTimeoutError)

    def test_empty_and_malformed_text_are_rejected(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            for response in (
                SimpleNamespace(text=" \n "),
                SimpleNamespace(text={"text": "not a string"}),
                SimpleNamespace()
            ):
                with (
                    self.subTest(response=response),
                    patch.object(
                        ai_model_service.client.models,
                        "generate_content",
                        return_value=response
                    ),
                    self.assertRaises(AIProviderResponseError)
                ):
                    ai_model_service.generate_answer("question")

    def test_valid_response_is_returned_as_trimmed_text(self):
        with (
            patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}),
            patch.object(
                ai_model_service.client.models,
                "generate_content",
                return_value=SimpleNamespace(text="  Safe answer. \n")
            )
        ):
            result = ai_model_service.generate_answer("question")

        self.assertEqual(result, "Safe answer.")


if __name__ == "__main__":
    unittest.main()
