# Dockerfile (без разширение)
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Libpq за psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Код + SQL
COPY . .

# По подразбиране стартираме уеб приложението.
# Миграцията ще я пускаме с Container Apps Job: python migrate.py
CMD ["gunicorn", "-b", "0.0.0.0:8000", "app:app"]