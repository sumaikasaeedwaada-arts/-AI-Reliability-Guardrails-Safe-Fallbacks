from pydantic import BaseModel, Field


class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    type: str
    related_entity_id: str | None
    related_entity_type: str | None
    is_read: bool
    created_at: str


class NotificationListResponse(BaseModel):
    success: bool
    notifications: list[NotificationResponse]
    total: int
    limit: int
    offset: int


class UnreadCountResponse(BaseModel):
    success: bool
    unread_count: int


class NotificationActionResponse(BaseModel):
    success: bool
    notification: NotificationResponse


class MarkAllReadResponse(BaseModel):
    success: bool
    updated_count: int = Field(ge=0)