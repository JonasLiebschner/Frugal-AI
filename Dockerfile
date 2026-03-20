FROM python:3.12-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy project files
COPY pyproject.toml uv.lock ./

# Install dependencies
RUN uv sync --no-dev --frozen

# Copy source
COPY src/ src/

# Create data directory
RUN mkdir -p data

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "frugal_code.main:app", "--host", "0.0.0.0", "--port", "8000"]
