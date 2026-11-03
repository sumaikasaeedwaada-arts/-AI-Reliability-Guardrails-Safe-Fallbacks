import sqlite3


def create_notification(
    connection: sqlite3.Connection,
    *,
    user_id: int,
    title: str,
    message: str,
    notification_type: str,
    created_at: str,
    related_entity_id: str | None = None,
    related_entity_type: str | None = None,
    dedupe_key: str | None = None
) -> bool:
    cursor = connection.execute(
        """
        INSERT INTO notifications (
            user_id, title, message, type, related_entity_id,
            related_entity_type, created_at, dedupe_key
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, dedupe_key) DO NOTHING
        """,
        (
            user_id,
            title,
            message,
            notification_type,
            related_entity_id,
            related_entity_type,
            created_at,
            dedupe_key
        )
    )
    return cursor.rowcount == 1


def list_notifications(
    connection: sqlite3.Connection,
    user_id: int,
    *,
    limit: int,
    offset: int,
    is_read: bool | None
) -> tuple[list[dict], int]:
    filters = ["user_id = ?"]
    parameters: list[object] = [user_id]
    if is_read is not None:
        filters.append("is_read = ?")
        parameters.append(int(is_read))
    where_clause = " AND ".join(filters)

    total = connection.execute(
        f"SELECT COUNT(*) FROM notifications WHERE {where_clause}",
        parameters
    ).fetchone()[0]
    rows = connection.execute(
        f"""
        SELECT id, title, message, type, related_entity_id,
               related_entity_type, is_read, created_at
        FROM notifications
        WHERE {where_clause}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
        """,
        (*parameters, limit, offset)
    ).fetchall()
    notifications = [
        {**dict(row), "is_read": bool(row["is_read"])}
        for row in rows
    ]
    return notifications, total


def unread_count(connection: sqlite3.Connection, user_id: int) -> int:
    row = connection.execute(
        "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0",
        (user_id,)
    ).fetchone()
    return row[0]


def mark_notification_read(
    connection: sqlite3.Connection,
    user_id: int,
    notification_id: int
) -> dict | None:
    connection.execute(
        "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
        (notification_id, user_id)
    )
    row = connection.execute(
        """
        SELECT id, title, message, type, related_entity_id,
               related_entity_type, is_read, created_at
        FROM notifications
        WHERE id = ? AND user_id = ?
        """,
        (notification_id, user_id)
    ).fetchone()
    if row is None:
        return None
    return {**dict(row), "is_read": bool(row["is_read"])}


def mark_all_notifications_read(
    connection: sqlite3.Connection,
    user_id: int
) -> int:
    cursor = connection.execute(
        "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
        (user_id,)
    )
    return cursor.rowcount


def delete_notification(
    connection: sqlite3.Connection,
    user_id: int,
    notification_id: int
) -> bool:
    cursor = connection.execute(
        "DELETE FROM notifications WHERE id = ? AND user_id = ?",
        (notification_id, user_id)
    )
    return cursor.rowcount == 1