# ============================================================================
# VoiceAI Orchestrator — Docker Multi-Stage Build (GPU-Ready)
# ============================================================================
#
# Build:
#   docker build -t voiceai-orchestrator -f Dockerfile .
#
# GPU build (requires nvidia-docker):
#   DOCKER_BUILDKIT=1 docker build --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cu124 -t voiceai-orchestrator .
#
# Targets:
#   builder  — Install dependencies
#   runtime  — Production runtime (default)
#   dev      — Development with hot-reload
# ============================================================================

ARG PYTHON_VERSION=3.12
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu

# ── Stage 1: Dependencies ─────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ── Stage 2: Development (hot-reload) ─────────────────────────────────
FROM builder AS dev

WORKDIR /app

# Install dev dependencies
RUN pip install --no-cache-dir --user pytest pytest-asyncio coverage

# Copy application code (bind-mounted in dev)
COPY app/ ./app/

EXPOSE 8000

ENV HOST=0.0.0.0
ENV PORT=8000
ENV DEBUG=true

CMD ["python", "-m", "app.main"]

# ── Stage 3: GPU-Optimized Builder ────────────────────────────────────
# For CUDA-accelerated Whisper/TTS/Embeddings
# Build: docker build --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cu124 --target gpu-builder .
FROM builder AS gpu-builder

ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cu124

# Install CUDA-enabled PyTorch
RUN pip install --no-cache-dir --user \
    torch --index-url ${TORCH_INDEX_URL}

# Re-install GPU-dependent packages
# These detect CUDA availability at import time when torch is CUDA-enabled
RUN pip install --no-cache-dir --user \
    faster-whisper \
    sentence-transformers

RUN python -c "import torch; print(f'PyTorch GPU available: {torch.cuda.is_available()}, Device count: {torch.cuda.device_count()}')" \
    || echo "GPU not available in build environment (OK — runtime detection will handle this)"

# ── Stage 4: GPU Production Runtime ────────────────────────────────────
# CUDA-enabled runtime for production deployment with GPU acceleration
# Use with: docker compose --profile gpu up
FROM python:${PYTHON_VERSION}-slim AS gpu-runtime

WORKDIR /app

# GPU runtime system dependencies + CUDA libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy GPU-enabled packages
COPY --from=gpu-builder /root/.local /home/voiceai/.local
ENV PATH=/home/voiceai/.local/bin:$PATH \
    PYTHONPATH=/app:$PYTHONPATH

# Copy application code
COPY app/ ./app/
COPY audio/ ./audio/
COPY requirements.txt .

# Create necessary directories
RUN mkdir -p audio chroma_data models checkpoints

EXPOSE 8000
EXPOSE 8001

ENV HOST=0.0.0.0
ENV PORT=8000
ENV TORCH_DEVICE=cuda
ENV WHISPER_DEVICE=cuda
ENV WHISPER_COMPUTE_TYPE=float16
ENV XTTS_DEVICE=cuda
ENV EMBEDDING_DEVICE=cuda

CMD ["python", "-m", "app.main"]

# ── Stage 5: Production Runtime (CPU) ──────────────────────────────────
FROM python:${PYTHON_VERSION}-slim AS runtime

WORKDIR /app

# Runtime system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN addgroup --system --gid 1001 voiceai && \
    adduser --system --uid 1001 voiceai

# Copy installed packages from builder (CPU version)
COPY --from=builder /root/.local /home/voiceai/.local
ENV PATH=/home/voiceai/.local/bin:$PATH \
    PYTHONPATH=/app:$PYTHONPATH

# Copy application code
COPY app/ ./app/
COPY audio/ ./audio/
COPY requirements.txt .

# Create necessary directories
RUN mkdir -p audio chroma_data models && \
    chown -R voiceai:voiceai /app

# Switch to non-root user
USER voiceai

EXPOSE 8000
EXPOSE 8001

ENV HOST=0.0.0.0
ENV PORT=8000
ENV TORCH_DEVICE=cpu
ENV WHISPER_DEVICE=cpu
ENV WHISPER_COMPUTE_TYPE=int8
ENV XTTS_DEVICE=cpu
ENV EMBEDDING_DEVICE=cpu

CMD ["python", "-m", "app.main"]
