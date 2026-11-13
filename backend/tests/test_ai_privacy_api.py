
"""
AI Data Guardian 3.0

Automated API Privacy Regression Tests

Tests:
- Sensitive questions are blocked
- Blocked requests do not invoke Ollama
- Blocked requests do not query validation
- General questions are accepted
- Unapproved tables are rejected
- Investigation endpoint remains functional

All external operations are mocked.

No real database connection.
No real Ollama inference.
"""

import unittest

from unittest.mock import patch

from fastapi import HTTPException

from app.api.ai_api import (
    ChatRequest,
    chat_with_guardian,
    investigate_table
)


# =====================================================
# FIXTURES
# =====================================================

SAMPLE_SUMMARY = {
    "table": "customers",
    "total_records": 8,
    "quality_score": 75.0,
    "missing": 3,
    "duplicates": 1,
    "invalid": 2
}

MOCK_CHAT_RESULT = {
    "model": "gemma3:1b",
    "provider": "ollama_local",
    "answer": (
        "Review missing emails and invalid phones."
    ),
    "disclaimer": (
        "AI guidance is advisory."
    )
}

MOCK_INVESTIGATION_RESULT = {
    "model": "gemma3:1b",
    "provider": "ollama_local",
    "explanation": (
        "The customer table has six failed checks."
    )
}


# =====================================================
# TEST CASES
# =====================================================

class TestAIPrivacyAPI(unittest.TestCase):

    # -------------------------------------------------
    # TEST 1: BLOCK SENSITIVE QUESTIONS
    # -------------------------------------------------

    def test_sensitive_questions_are_blocked(self):

        questions = [
            "Give me the actual customer IDs.",
            "Show the exact customer names.",
            "Which customer records have missing emails?",
            "Check alice@example.invalid",
            "Investigate phone +60123456789",
            "Review customer 123456789012",
            "Find row_1234567890abcdef1234"
        ]

        for question in questions:

            with self.subTest(question=question):

                with (
                    patch(
                        "app.api.ai_api.ask_guardian"
                    ) as mock_ai,

                    patch(
                        "app.api.ai_api.prepare_summary"
                    ) as mock_summary
                ):

                    with self.assertRaises(
                        HTTPException
                    ) as error:

                        chat_with_guardian(
                            "customers",
                            ChatRequest(
                                question=question
                            )
                        )

                    self.assertEqual(
                        error.exception.status_code,
                        400
                    )

                    mock_ai.assert_not_called()
                    mock_summary.assert_not_called()

    # -------------------------------------------------
    # TEST 2: ALLOW GENERAL QUALITY QUESTIONS
    # -------------------------------------------------

    def test_general_question_is_allowed(self):

        with (
            patch(
                "app.api.ai_api.prepare_summary",
                return_value=SAMPLE_SUMMARY
            ) as mock_summary,

            patch(
                "app.api.ai_api.ask_guardian",
                return_value=MOCK_CHAT_RESULT
            ) as mock_ai
        ):

            response = chat_with_guardian(
                "customers",
                ChatRequest(
                    question=(
                        "How can I improve data quality?"
                    )
                )
            )

            self.assertEqual(
                response["status"],
                "success"
            )

            self.assertTrue(
                response["ai_used"]
            )

            self.assertEqual(
                response["model"],
                "gemma3:1b"
            )

            mock_summary.assert_called_once_with(
                "customers"
            )

            mock_ai.assert_called_once_with(
                question=(
                    "How can I improve data quality?"
                ),
                summary=SAMPLE_SUMMARY
            )

    # -------------------------------------------------
    # TEST 3: REJECT UNKNOWN TABLE
    # -------------------------------------------------

    def test_unknown_table_is_rejected(self):

        with (
            patch(
                "app.api.ai_api.prepare_summary"
            ) as mock_summary,

            patch(
                "app.api.ai_api.ask_guardian"
            ) as mock_ai
        ):

            with self.assertRaises(
                HTTPException
            ) as error:

                chat_with_guardian(
                    "secret_table",
                    ChatRequest(
                        question=(
                            "Explain data quality."
                        )
                    )
                )

            self.assertEqual(
                error.exception.status_code,
                404
            )

            mock_summary.assert_not_called()
            mock_ai.assert_not_called()

    # -------------------------------------------------
    # TEST 4: PRESERVE AI INVESTIGATION
    # -------------------------------------------------

    def test_investigation_still_works(self):

        with (
            patch(
                "app.api.ai_api.prepare_summary",
                return_value=SAMPLE_SUMMARY
            ) as mock_summary,

            patch(
                "app.api.ai_api.investigate_validation",
                return_value=MOCK_INVESTIGATION_RESULT
            ) as mock_investigate
        ):

            response = investigate_table(
                "customers"
            )

            self.assertEqual(
                response["status"],
                "success"
            )

            self.assertEqual(
                response["table"],
                "customers"
            )

            self.assertEqual(
                response["summary"],
                SAMPLE_SUMMARY
            )

            self.assertTrue(
                response["ai_used"]
            )

            mock_summary.assert_called_once_with(
                "customers"
            )

            mock_investigate.assert_called_once_with(
                SAMPLE_SUMMARY
            )

    # -------------------------------------------------
    # TEST 5: REJECT BLANK QUESTION
    # -------------------------------------------------

    def test_blank_question_is_rejected(self):

        with (
            patch(
                "app.api.ai_api.prepare_summary"
            ) as mock_summary,

            patch(
                "app.api.ai_api.ask_guardian"
            ) as mock_ai
        ):

            with self.assertRaises(
                HTTPException
            ) as error:

                chat_with_guardian(
                    "customers",
                    ChatRequest(question="   ")
                )

            self.assertEqual(
                error.exception.status_code,
                400
            )

            mock_summary.assert_not_called()
            mock_ai.assert_not_called()

    # -------------------------------------------------
    # TEST 6: MODEL FAILURE RETURNS 503
    # -------------------------------------------------

    def test_ollama_failure_is_handled(self):

        with (
            patch(
                "app.api.ai_api.prepare_summary",
                return_value=SAMPLE_SUMMARY
            ),

            patch(
                "app.api.ai_api.ask_guardian",
                side_effect=RuntimeError(
                    "Simulated Ollama failure"
                )
            )
        ):

            with self.assertRaises(
                HTTPException
            ) as error:

                chat_with_guardian(
                    "customers",
                    ChatRequest(
                        question="Explain data quality."
                    )
                )

            self.assertEqual(
                error.exception.status_code,
                503
            )

            self.assertNotIn(
                "Simulated Ollama failure",
                str(error.exception.detail)
            )


# =====================================================
# RUN TESTS
# =====================================================

if __name__ == "__main__":
    unittest.main(verbosity=2)
