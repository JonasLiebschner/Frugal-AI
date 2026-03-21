FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=3003
ENV HOST=0.0.0.0

COPY packages/svc-middleware/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY packages/svc-middleware /app/packages/svc-middleware

EXPOSE 3003

CMD ["python", "/app/packages/svc-middleware/index.py"]
