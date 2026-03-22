from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator

from classifier.config import MODEL_SAVE_DIR
from classifier.predictor import LLMRouterPredictor

predictor: LLMRouterPredictor | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global predictor
    predictor = LLMRouterPredictor(MODEL_SAVE_DIR)
    yield


app = FastAPI(lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


class ClassifyRequest(BaseModel):
    query: str

    @field_validator("query")
    @classmethod
    def query_must_not_be_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("query must not be empty or whitespace")
        return v


class ClassifyResponse(BaseModel):
    result: Literal["small", "large"]


@app.post("/api/v1/classify", response_model=ClassifyResponse)
async def classify(request: ClassifyRequest):
    if predictor is None:
        return JSONResponse(status_code=500, content={"detail": "Model not loaded"})
    try:
        result = predictor.predict(request.query)
        return ClassifyResponse(result=result)
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


def serve():
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    serve()
