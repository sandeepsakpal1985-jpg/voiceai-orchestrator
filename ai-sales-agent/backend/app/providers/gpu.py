"""
GPU Auto-Detection Utility — Probes hardware and recommends optimal provider device settings.
"""

import logging
import os
from dataclasses import dataclass, field

logger = logging.getLogger("ai_sales_agent.providers.gpu")


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


def _probe_torch() -> GpuInfo:
    """Probe PyTorch for CUDA availability and device details."""
    info = GpuInfo()
    try:
        import torch
    except ImportError:
        return info

    try:
        info.available = torch.cuda.is_available()
        if not info.available:
            return info

        info.device_count = torch.cuda.device_count()
        info.cuda_version = torch.version.cuda or ""

        for i in range(info.device_count):
            try:
                info.device_names.append(torch.cuda.get_device_name(i))
            except Exception:
                info.device_names.append(f"Unknown GPU [{i}]")

        try:
            info.total_vram_mb = int(torch.cuda.get_device_properties(0).total_memory / (1024 * 1024))
        except Exception:
            info.total_vram_mb = 0

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
    except Exception:
        info.available = False

    return info


def detect_gpu_config() -> GpuInfo:
    """Detect GPU configuration and return recommended device settings."""
    info = _probe_torch()

    torch_dev = os.getenv("TORCH_DEVICE", "auto").strip().lower()
    if torch_dev == "cpu":
        info.recommended_device = "cpu"
        info.recommended_compute_type = "int8"

    whisper_dev = os.getenv("WHISPER_DEVICE", "").strip().lower()
    if whisper_dev and whisper_dev != "auto":
        info.recommended_device = whisper_dev
        if whisper_dev == "cpu":
            info.recommended_compute_type = "int8"

    logger.info("GPU detection: %s", info)
    return info


def is_gpu_available() -> bool:
    return detect_gpu_config().available


def recommended_device(fallback: str = "cpu") -> str:
    info = detect_gpu_config()
    return "cuda" if info.available and info.recommended_device == "cuda" else fallback
