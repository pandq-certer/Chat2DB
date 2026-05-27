from fastapi import APIRouter
from starlette.responses import StreamingResponse
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from app.core.models import CopilotConfirmRequest, CopilotRunRequest
from app.workflow.copilot_graph import resume_copilot_confirm, run_copilot

router = APIRouter()


@router.post("/ai/copilot/run")
async def copilot_run(request: CopilotRunRequest):
    logger.info(f"Received copilot request: message={request.message[:20]}..., llm_url={request.llm_url[:50] if request.llm_url else None}")
    return StreamingResponse(
        run_copilot(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/ai/copilot/confirm")
async def copilot_confirm(request: CopilotConfirmRequest):
    return StreamingResponse(
        resume_copilot_confirm(request.session_id, request.trace_id, request.confirmed),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
