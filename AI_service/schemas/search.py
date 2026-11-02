from typing import Literal

from pydantic import BaseModel


class SearchResult(BaseModel):
    kind: Literal["document_excerpt"] = "document_excerpt"
    document_id: str
    filename: str
    page_number: int | None
    snippet: str


class SearchResponse(BaseModel):
    success: bool
    results: list[SearchResult]
    total: int
    limit: int
    offset: int
