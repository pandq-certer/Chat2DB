import json
import uuid
from typing import Any

from app.storage.memory_store import session_store
from app.workflow.state import CopilotState


class SessionService:
    def get_or_create(self, session_id: str | None) -> tuple[str, CopilotState]:
        if session_id:
            existing = session_store.get(session_id)
            if existing is not None:
                return session_id, existing

        new_id = session_id or str(uuid.uuid4())
        state: CopilotState = {
            "session_id": new_id,
            "trace_id": str(uuid.uuid4()),
            "conversation_history": [],
        }
        session_store.put(new_id, state)
        return new_id, state

    def save(self, session_id: str, state: CopilotState) -> None:
        session_store.put(session_id, state)

    def get(self, session_id: str) -> CopilotState | None:
        return session_store.get(session_id)


session_service = SessionService()
