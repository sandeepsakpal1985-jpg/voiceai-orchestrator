"""Unit tests for the GPU auto-detection utility (app/providers/gpu.py).

Tests cover:
    - GpuInfo dataclass creation and string formatting
    - _probe_torch with mocked torch (available/unavailable)
    - detect_gpu_config with various user override scenarios
    - Convenience functions (is_gpu_available, recommended_device)
    - VRAM-based Whisper model recommendations
    - Edge cases (no PyTorch, partial probe failure)
"""

import pytest
from unittest.mock import patch, MagicMock, PropertyMock


class TestGpuInfo:
    """Test the GpuInfo dataclass."""

    def test_default_creation(self):
        """Test creation with default values (CPU)."""
        from app.providers.gpu import GpuInfo

        info = GpuInfo()
        assert info.available is False
        assert info.device_count == 0
        assert info.device_names == []
        assert info.cuda_version == ""
        assert info.total_vram_mb == 0
        assert info.recommended_device == "cpu"
        assert info.recommended_compute_type == "int8"
        assert info.recommended_whisper_model == "base"
        assert info.user_override is False

    def test_gpu_creation(self):
        """Test creation with GPU values."""
        from app.providers.gpu import GpuInfo

        info = GpuInfo(
            available=True,
            device_count=2,
            device_names=["NVIDIA A100", "NVIDIA A10"],
            cuda_version="12.4",
            total_vram_mb=81920,
            recommended_device="cuda",
            recommended_compute_type="float16",
            recommended_whisper_model="large-v3",
        )
        assert info.available is True
        assert info.device_count == 2
        assert "NVIDIA A100" in info.device_names

    def test_str_no_gpu(self):
        """Test string representation when no GPU is available."""
        from app.providers.gpu import GpuInfo

        info = GpuInfo()
        assert "GPU: not available" in str(info)

    def test_str_with_gpu(self):
        """Test string representation with GPU."""
        from app.providers.gpu import GpuInfo

        info = GpuInfo(
            available=True,
            device_names=["NVIDIA RTX 4090"],
            cuda_version="12.4",
            total_vram_mb=24576,
            recommended_device="cuda",
            recommended_compute_type="float16",
        )
        s = str(info)
        assert "NVIDIA RTX 4090" in s
        assert "CUDA 12.4" in s
        assert "24576MB" in s
        assert "cuda/float16" in s


class TestProbeTorch:
    """Test the _probe_torch function with mocked PyTorch."""

    def test_no_torch_installed(self):
        """Test when PyTorch is not installed at all."""
        import builtins
        original_import = builtins.__import__

        def mock_import(name, *args, **kwargs):
            if name == "torch":
                raise ImportError("No module named 'torch'")
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=mock_import):
            from app.providers.gpu import _probe_torch
            info = _probe_torch()
            assert info.available is False
            assert info.device_count == 0

    def test_torch_no_cuda(self):
        """Test when PyTorch is installed but CUDA is not available."""
        with patch("torch.cuda.is_available", return_value=False):
            from app.providers.gpu import _probe_torch
            info = _probe_torch()
            assert info.available is False
            assert info.recommended_device == "cpu"

    def test_torch_with_cuda(self):
        """Test when PyTorch and CUDA are available."""
        mock_props = MagicMock()
        mock_props.total_memory = 8 * 1024 * 1024 * 1024  # 8 GB

        with (
            patch("torch.cuda.is_available", return_value=True),
            patch("torch.cuda.device_count", return_value=1),
            patch("torch.version.cuda", "12.4"),
            patch("torch.cuda.get_device_name", return_value="NVIDIA RTX 4080"),
            patch("torch.cuda.get_device_properties", return_value=mock_props),
        ):
            from app.providers.gpu import _probe_torch
            info = _probe_torch()
            assert info.available is True
            assert info.device_count == 1
            assert info.device_names == ["NVIDIA RTX 4080"]
            assert info.cuda_version == "12.4"
            assert info.total_vram_mb == 8192
            assert info.recommended_device == "cuda"
            # 8GB VRAM → medium model
            assert info.recommended_whisper_model == "medium"

    def test_vram_recommendations(self):
        """Test VRAM-based model recommendations."""
        scenarios = [
            (256 * 1024 * 1024, "tiny"),        # 256 MB -> < 2000 MB -> tiny
            (2 * 1024 * 1024 * 1024, "base"),   # 2 GB -> 2048 MB -> >= 2000 -> base
            (4 * 1024 * 1024 * 1024, "small"),  # 4 GB -> 4096 MB -> >= 4000 -> small
            (8 * 1024 * 1024 * 1024, "medium"), # 8 GB -> 8192 MB -> >= 8000 -> medium
            (16 * 1024 * 1024 * 1024, "large-v3"), # 16 GB -> 16384 MB -> >= 16000 -> large-v3
        ]

        for vram_bytes, expected_model in scenarios:
            mock_props = MagicMock()
            mock_props.total_memory = vram_bytes

            with (
                patch("torch.cuda.is_available", return_value=True),
                patch("torch.cuda.device_count", return_value=1),
                patch("torch.version.cuda", "12.4"),
                patch("torch.cuda.get_device_name", return_value="NVIDIA GPU"),
                patch("torch.cuda.get_device_properties", return_value=mock_props),
            ):
                from app.providers.gpu import _probe_torch
                info = _probe_torch()
                assert info.recommended_whisper_model == expected_model, (
                    f"Expected {expected_model} for {vram_bytes} bytes VRAM, got {info.recommended_whisper_model}"
                )

    def test_probe_failure_graceful(self):
        """Test that probe failure returns safe defaults."""
        with patch("torch.cuda.is_available", side_effect=RuntimeError("CUDA error")):
            from app.providers.gpu import _probe_torch
            info = _probe_torch()
            assert info.available is False
            assert info.recommended_device == "cpu"

    def test_device_name_failure_graceful(self):
        """Test that get_device_name failure doesn't crash."""
        mock_props = MagicMock()
        mock_props.total_memory = 8 * 1024 * 1024 * 1024

        with (
            patch("torch.cuda.is_available", return_value=True),
            patch("torch.cuda.device_count", return_value=2),
            patch("torch.cuda.get_device_name", side_effect=[RuntimeError("fail"), "NVIDIA RTX 4090"]),
            patch("torch.cuda.get_device_properties", return_value=mock_props),
        ):
            from app.providers.gpu import _probe_torch
            info = _probe_torch()
            assert info.available is True
            assert info.device_names[0] == "Unknown GPU [0]"
            assert info.device_names[1] == "NVIDIA RTX 4090"


class TestDetectGpuConfig:
    """Test the detect_gpu_config function with user override scenarios."""

    def test_detect_no_gpu(self):
        """Test detection without GPU."""
        with patch("app.providers.gpu._probe_torch") as mock_probe:
            from app.providers.gpu import GpuInfo
            mock_probe.return_value = GpuInfo()

            from app.providers.gpu import detect_gpu_config
            info = detect_gpu_config()
            assert info.available is False
            assert info.recommended_device == "cpu"

    def test_detect_with_gpu(self):
        """Test detection with GPU available."""
        with (
            patch("app.providers.gpu._probe_torch") as mock_probe,
            patch.dict("os.environ", {"TORCH_DEVICE": "auto", "WHISPER_DEVICE": ""}, clear=False),
        ):
            from app.providers.gpu import GpuInfo
            mock_probe.return_value = GpuInfo(
                available=True,
                device_count=1,
                device_names=["NVIDIA RTX 4090"],
                cuda_version="12.4",
                total_vram_mb=24576,
                recommended_device="cuda",
                recommended_compute_type="float16",
                recommended_whisper_model="large-v3",
            )

            from app.providers.gpu import detect_gpu_config
            info = detect_gpu_config()
            assert info.available is True
            assert info.recommended_device == "cuda"

    def test_override_torch_device_cpu(self):
        """Test TORCH_DEVICE=cpu forces CPU even if GPU is available."""
        with (
            patch("app.providers.gpu._probe_torch") as mock_probe,
            patch.dict("os.environ", {"TORCH_DEVICE": "cpu"}, clear=False),
        ):
            from app.providers.gpu import GpuInfo
            mock_probe.return_value = GpuInfo(
                available=True,
                device_count=1,
                device_names=["NVIDIA RTX 4090"],
                recommended_device="cuda",
                recommended_compute_type="float16",
            )

            from app.providers.gpu import detect_gpu_config
            info = detect_gpu_config()
            assert info.available is True  # Hardware is there
            assert info.recommended_device == "cpu"  # But override forces CPU
            assert info.recommended_compute_type == "int8"
            assert info.user_override is True

    def test_override_whisper_device(self):
        """Test WHISPER_DEVICE override affects recommended device."""
        with (
            patch("app.providers.gpu._probe_torch") as mock_probe,
            patch.dict("os.environ", {"WHISPER_DEVICE": "cuda"}, clear=False),
        ):
            from app.providers.gpu import GpuInfo
            mock_probe.return_value = GpuInfo(
                available=True,
                device_count=1,
                device_names=["NVIDIA RTX 4090"],
                recommended_device="cuda",
                recommended_compute_type="float16",
            )

            from app.providers.gpu import detect_gpu_config
            info = detect_gpu_config()
            assert info.recommended_device == "cuda"

    def test_override_torch_cuda_no_gpu(self):
        """Test TORCH_DEVICE=cuda with no GPU logs warning but doesn't crash."""
        with (
            patch("app.providers.gpu._probe_torch") as mock_probe,
            patch.dict("os.environ", {"TORCH_DEVICE": "cuda"}, clear=False),
        ):
            from app.providers.gpu import GpuInfo
            mock_probe.return_value = GpuInfo(
                available=False,
                recommended_device="cpu",
                recommended_compute_type="int8",
            )

            from app.providers.gpu import detect_gpu_config
            info = detect_gpu_config()
            assert info.available is False
            # recommended_device stays at cpu since no GPU and TORCH_DEVICE=cuda
            # but _probe_torch returned cpu as recommended
            assert info.user_override is True


class TestConvenienceFunctions:
    """Test the convenience functions (is_gpu_available, recommended_device, etc.)."""

    def test_is_gpu_available_true(self):
        """Test is_gpu_available returns True when GPU is available."""
        with patch("app.providers.gpu.detect_gpu_config") as mock_detect:
            from app.providers.gpu import GpuInfo
            mock_detect.return_value = GpuInfo(
                available=True, recommended_device="cuda"
            )

            from app.providers.gpu import is_gpu_available
            assert is_gpu_available() is True

    def test_is_gpu_available_false(self):
        """Test is_gpu_available returns False when no GPU."""
        with patch("app.providers.gpu.detect_gpu_config") as mock_detect:
            from app.providers.gpu import GpuInfo
            mock_detect.return_value = GpuInfo()

            from app.providers.gpu import is_gpu_available
            assert is_gpu_available() is False

    def test_recommended_device_with_gpu(self):
        """Test recommended_device returns 'cuda' with GPU."""
        with patch("app.providers.gpu.detect_gpu_config") as mock_detect:
            from app.providers.gpu import GpuInfo
            mock_detect.return_value = GpuInfo(
                available=True, recommended_device="cuda"
            )

            from app.providers.gpu import recommended_device
            assert recommended_device() == "cuda"

    def test_recommended_device_without_gpu(self):
        """Test recommended_device returns fallback without GPU."""
        with patch("app.providers.gpu.detect_gpu_config") as mock_detect:
            from app.providers.gpu import GpuInfo
            mock_detect.return_value = GpuInfo()

            from app.providers.gpu import recommended_device
            assert recommended_device() == "cpu"  # default fallback
            assert recommended_device(fallback="mps") == "mps"

    def test_recommended_device_override_to_cpu(self):
        """Test recommended_device returns fallback when user overrides to CPU."""
        with patch("app.providers.gpu.detect_gpu_config") as mock_detect:
            from app.providers.gpu import GpuInfo
            mock_detect.return_value = GpuInfo(
                available=True,
                recommended_device="cpu",  # overridden
            )

            from app.providers.gpu import recommended_device
            assert recommended_device() == "cpu"  # fallback

    def test_recommended_compute_type_with_gpu(self):
        """Test recommended_compute_type returns 'float16' with GPU."""
        with patch("app.providers.gpu.detect_gpu_config") as mock_detect:
            from app.providers.gpu import GpuInfo
            mock_detect.return_value = GpuInfo(
                available=True,
                recommended_compute_type="float16",
            )

            from app.providers.gpu import recommended_compute_type
            assert recommended_compute_type() == "float16"

    def test_recommended_compute_type_without_gpu(self):
        """Test recommended_compute_type returns 'int8' without GPU."""
        with patch("app.providers.gpu.detect_gpu_config") as mock_detect:
            from app.providers.gpu import GpuInfo
            mock_detect.return_value = GpuInfo()

            from app.providers.gpu import recommended_compute_type
            assert recommended_compute_type() == "int8"

    def test_recommended_whisper_model_with_gpu(self):
        """Test recommended_whisper_model returns model from GPU info."""
        with patch("app.providers.gpu.detect_gpu_config") as mock_detect:
            from app.providers.gpu import GpuInfo
            mock_detect.return_value = GpuInfo(
                available=True,
                recommended_whisper_model="large-v3",
            )

            from app.providers.gpu import recommended_whisper_model
            assert recommended_whisper_model() == "large-v3"

    def test_recommended_whisper_model_without_gpu(self):
        """Test recommended_whisper_model falls back to env var."""
        with (
            patch("app.providers.gpu.detect_gpu_config") as mock_detect,
            patch.dict("os.environ", {"WHISPER_MODEL_SIZE": "small"}, clear=False),
        ):
            from app.providers.gpu import GpuInfo
            mock_detect.return_value = GpuInfo()

            from app.providers.gpu import recommended_whisper_model
            assert recommended_whisper_model() == "small"
