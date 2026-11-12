class ChatServiceError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.public_message = message


class ChatUnavailableError(ChatServiceError):
    pass


class InvalidChatMessageError(ChatServiceError):
    pass


class AIProviderError(Exception):
    status_code = 503
    public_message = (
        "The AI service is temporarily unavailable. "
        "No AI response was generated. Please try again later."
    )
    failure_kind = "unavailable"


class AIProviderAuthenticationError(AIProviderError):
    public_message = (
        "The AI service could not authenticate. Please contact support."
    )
    failure_kind = "authentication"


class AIProviderTimeoutError(AIProviderError):
    status_code = 504
    public_message = (
        "The AI service timed out. No AI response was generated. "
        "Please try again."
    )
    failure_kind = "timeout"


class AIProviderResponseError(AIProviderError):
    status_code = 502
    public_message = (
        "The AI service returned an invalid response. Please try again."
    )
    failure_kind = "invalid_response"
