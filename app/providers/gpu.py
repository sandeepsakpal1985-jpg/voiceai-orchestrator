"""
GPU Auto-Detection Utility — Probes hardware and recommends optimal provider device settings.

This module is used during provider registration (app/main.py) to auto-detect
whether CUDA is available and configure Whisper, XTTS, and Embedding providers
accordingly. It respects explicit user overrides via environment variables.

Usage:
    from app.providers.gpu import detect_gpu_config, GpuInfo

    gpu = detect_gpu_config()
    # gpu.available = True/False
    # gpu.recommended_device = "cuda" or "cpu"
    # gpu.recommended_compute_type = "float16" or "int8"
"""

import logging
import os
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("voiceai.providers.gpu")


@dataclass
class GpuInfo:
    """Detected GPU capabilities and recommended provider settings."""

    available: bool = False
    device_count: int = 0
    device_names: list[str] = field(default_factory=list)
    cuda_version: str = ""
    total_vram_mb: int = 0
    recommended_device: str = "cpu"
    recommended_compute_type: str = "int8"
    recommended_whisper_model: str = "base"
    user_override: bool = False

    def __str__(self) -> str:
        if not self.available:
            return "GPU: not available (using CPU)"
        devices = ", ".join(self.device_names) if self.device_names else f"{self.device_count} device(s)"
        return (
            f"GPU: {devices} | "
            f"CUDA {self.cuda_version} | "
            f"VRAM: ~{self.total_vram_mb}MB | "
            f"recommended: {self.recommended_device}/{self.recommended_compute_type}"
        )


def _probe_torch() -> GpuInfo:
    """Probe PyTorch for CUDA availability and device details.

    Returns GpuInfo with detected capabilities, never raises.
    """
    info = GpuInfo()

    try:
        import torch
    except ImportError:
        logger.debug("PyTorch not installed — GPU detection skipped")
        return info

    try:
        info.available = torch.cuda.is_available()
        if not info.available:
            logger.debug("CUDA not available via PyTorch")
            return info

        info.device_count = torch.cuda.device_count()
        info.cuda_version = torch.version.cuda or ""

        for i in range(info.device_count):
            try:
                name = torch.cuda.get_device_name(i)
                info.device_names.append(name)
            except Exception:
                info.device_names.append(f"Unknown GPU [{i}]")

        # Estimate total VRAM from first device
        try:
            info.total_vram_mb = int(torch.cuda.get_device_properties(0).total_memory / (1024 * 1024))
        except Exception:
            info.total_vram_mb = 0

        # Recommend settings based on VRAM
        if info.total_vram_mb >= 16000:
            info.recommended_whisper_model = "large-v3"
            info.recommended_compute_type = "float16"
        elif info.total_vram_mb >= 8000:
            info.recommended_whisper_model = "medium"
            info.recommended_compute_type = "float16"
        elif info.total_vram_mb >= 4000:
            info.recommended_whisper_model = "small"
            info.recommended_compute_type = "float16"
        elif info.total_vram_mb >= 2000:
            info.recommended_whisper_model = "base"
            info.recommended_compute_type = "float16"
        else:
            info.recommended_whisper_model = "tiny"
            info.recommended_compute_type = "float16"

        info.recommended_device = "cuda"

    except Exception as e:
        logger.debug("GPU probe failed: %s", e)
        info.available = False

    return info


def _check_user_override() -> bool:
    """Check if user has explicitly set TORCH_DEVICE or WHISPER_DEVICE."""
    torch_dev = os.getenv("TORCH_DEVICE", "").strip().lower()
    whisper_dev = os.getenv("WHISPER_DEVICE", "").strip().lower()
    return bool(torch_dev and torch_dev != "auto") or bool(whisper_dev and whisper_dev != "auto")


def detect_gpu_config() -> GpuInfo:
    """Detect GPU configuration and return recommended device settings.

    Respects explicit user overrides via environment variables:
        - TORCH_DEVICE=cpu  → force CPU even if GPU is available
        - TORCH_DEVICE=cuda → force CUDA (will fail if no GPU)
        - WHISPER_DEVICE=cpu/cuda → override just Whisper

    Returns:
        GpuInfo dataclass with detected capabilities and recommendations.
        If PyTorch is not installed or CUDA is unavailable, returns CPU defaults.
    """
    info = _probe_torch()
    info.user_override = _check_user_override()

    # Respect explicit user overrides
    torch_dev = os.getenv("TORCH_DEVICE", "auto").strip().lower()
    whisper_dev = os.getenv("WHISPER_DEVICE", "").strip().lower()

    if torch_dev == "cpu":
        info.recommended_device = "cpu"
        info.recommended_compute_type = "int8"
    elif torch_dev == "cuda" and not info.available:
        logger.warning(
            "TORCH_DEVICE=cuda but no GPU detected — will fall back to CPU at runtime"
        )

    if whisper_dev and whisper_dev != "auto":
        info.recommended_device = whisper_dev
        if whisper_dev == "cpu":
            info.recommended_compute_type = "int8"

    logger.info("GPU detection: %s", info)
    return info


def is_gpu_available() -> bool:
    """Quick check: is a CUDA-capable GPU available?"""
    return detect_gpu_config().available


def recommended_device(fallback: str = "cpu") -> str:
    """Get recommended device string ('cuda' or 'cpu') for provider initialization.

    Args:
        fallback: Device to use if no GPU is detected (default: 'cpu')

    Returns:
        'cuda' if GPU is available and not overridden, else fallback.
    """
    info = detect_gpu_config()
    if info.available and info.recommended_device == "cuda":
        return "cuda"
    return fallback


def recommended_compute_type() -> str:
    """Get recommended compute type ('float16' or 'int8') based on GPU VRAM.

    Returns:
        'float16' for GPU (optimal for NVIDIA), 'int8' for CPU.
    """
    info = detect_gpu_config()
    return info.recommended_compute_type if info.available else "int8"


def recommended_whisper_model() -> str:
    """Get recommended Whisper model size based on available VRAM.

    Returns:
        Model size string: 'large-v3', 'medium', 'small', 'base', or 'tiny'.
        Falls back to the WHISPER_MODEL_SIZE env var if no GPU.
    """
    info = detect_gpu_config()
    if info.available:
        return info.recommended_whisper_model
    return os.getenv("WHISPER_MODEL_SIZE", "base")
