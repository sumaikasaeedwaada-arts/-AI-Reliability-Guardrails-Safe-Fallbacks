import sqlite3


SNIPPET_CONTEXT_CHARS = 60
MAX_SNIPPET_CHARS = 320


def _document_snippet(content: str, query: str) -> str:
    folded_query = query.casefold()
    folded_parts = []
    source_positions = []
    for source_position, character in enumerate(content):
        folded_character = character.casefold()
        folded_parts.append(folded_character)
        source_positions.extend([source_position] * len(folded_character))

    match_start = "".join(folded_parts).find(folded_query)
    if match_start < 0:
        return content[:MAX_SNIPPET_CHARS]

    source_start = source_positions[match_start]
    source_end = source_positions[match_start + len(folded_query) - 1] + 1
    match_length = source_end - source_start
    context_chars = min(
        SNIPPET_CONTEXT_CHARS,
        max(0, (MAX_SNIPPET_CHARS - match_length - 6) // 2)
    )
    start = max(0, source_start - context_chars)
    end = min(len(content), source_end + context_chars)
    snippet = content[start:end].strip()
    if start:
        snippet = "..." + snippet
    if end < len(content):
        snippet += "..."
    return snippet


def search_document_excerpts(
    connection: sqlite3.Connection,
    user_id: int,
    query: str,
    limit: int,
    offset: int
) -> tuple[list[dict], int]:
    connection.create_function(
        "casefold",
        1,
        lambda value: value.casefold() if isinstance(value, str) else "",
        deterministic=True
    )
    matching_clause = """
        documents.user_id = ?
        AND documents.status = 'ready'
        AND INSTR(casefold(chunks.content), casefold(?)) > 0
    """
    parameters = (user_id, query)
    total = connection.execute(
        f"""
        SELECT COUNT(DISTINCT documents.id)
        FROM documents
        JOIN chunks ON chunks.document_id = documents.id
        WHERE {matching_clause}
        """,
        parameters
    ).fetchone()[0]

    rows = connection.execute(
        f"""
        WITH matching_chunks AS (
            SELECT
                documents.id AS document_id,
                documents.filename,
                documents.created_at,
                chunks.page_number,
                chunks.content,
                ROW_NUMBER() OVER (
                    PARTITION BY documents.id
                    ORDER BY chunks.chunk_index, chunks.id
                ) AS match_number
            FROM documents
            JOIN chunks ON chunks.document_id = documents.id
            WHERE {matching_clause}
        )
        SELECT document_id, filename, page_number, content
        FROM matching_chunks
        WHERE match_number = 1
        ORDER BY created_at DESC, document_id DESC
        LIMIT ? OFFSET ?
        """,
        (*parameters, limit, offset)
    ).fetchall()
    results = [
        {
            "kind": "document_excerpt",
            "document_id": row["document_id"],
            "filename": row["filename"],
            "page_number": row["page_number"],
            "snippet": _document_snippet(row["content"], query)
        }
        for row in rows
    ]
    return results, total
