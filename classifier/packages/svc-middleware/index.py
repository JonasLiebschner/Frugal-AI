from __future__ import annotations

from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from classifier import ArenaHardSVCMiddlewareRouter, Settings, load_settings


class ClassifyRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Prompt/query to classify and route.")


class ClassifyResponse(BaseModel):
    model: str


class DebugClassifyResponse(BaseModel):
    model: str
    additionalData: dict


class HealthResponse(BaseModel):
    status: str


class AppState:
    def __init__(self, settings: Settings, router: ArenaHardSVCMiddlewareRouter) -> None:
        self.settings = settings
        self.router = router


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        router = ArenaHardSVCMiddlewareRouter.from_mapping_file(
            mapping_path=resolved_settings.mapping_path,
            model_path_override=resolved_settings.model_path_override,
        )
        app.state.service = AppState(settings=resolved_settings, router=router)
        yield

    app = FastAPI(
        title="SVC Model Routing Middleware",
        description="Arena-Hard SVC middleware that returns an exact model id for the proxy.",
        version="1.0.0",
        lifespan=lifespan,
    )

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(status="ok")

    @app.get("/ready", response_model=HealthResponse)
    async def ready() -> HealthResponse:
        if not hasattr(app.state, "service"):
            raise HTTPException(status_code=503, detail="router_not_loaded")
        return HealthResponse(status="ready")

    @app.post("/api/v1/classify", response_model=ClassifyResponse)
    async def classify(body: ClassifyRequest) -> ClassifyResponse:
        decision = app.state.service.router.route(body.query)
        return ClassifyResponse(model=decision.model)

    if resolved_settings.enable_debug_endpoints:
        @app.post("/api/v1/classify/debug", response_model=DebugClassifyResponse)
        async def classify_debug(body: ClassifyRequest) -> DebugClassifyResponse:
            decision = app.state.service.router.route(body.query)
            return DebugClassifyResponse(**decision.debug_payload())

    return app


app = create_app()


def main() -> None:
    settings = load_settings()
    uvicorn.run(app, host=settings.host, port=settings.port, reload=False)


if __name__ == "__main__":
    main()
