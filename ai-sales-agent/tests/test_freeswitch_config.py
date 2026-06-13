"""Tests for telephony/freeswitch/config.py — FreeSWITCH settings."""

import os
import pytest
from telephony.freeswitch.config import FreeSwitchSettings, get_freeswitch_settings


class TestFreeSwitchSettingsDefaults:
    def setup_method(self):
        # Clear relevant env vars for clean defaults testing
        for key in list(os.environ.keys()):
            if key.startswith("FREESWITCH_"):
                del os.environ[key]

    def test_default_esl_host(self):
        settings = FreeSwitchSettings()
        assert settings.FREESWITCH_ESL_HOST == "127.0.0.1"

    def test_default_esl_port(self):
        settings = FreeSwitchSettings()
        assert settings.FREESWITCH_ESL_PORT == 8021

    def test_default_esl_password(self):
        settings = FreeSwitchSettings()
        assert settings.FREESWITCH_ESL_PASSWORD == "ClueCon"

    def test_default_esl_timeout(self):
        settings = FreeSwitchSettings()
        assert settings.FREESWITCH_ESL_TIMEOUT == 10

    def test_default_audio_dir(self):
        settings = FreeSwitchSettings()
        assert "fs_audio" in settings.FREESWITCH_AUDIO_DIR

    def test_default_record_timeout(self):
        settings = FreeSwitchSettings()
        assert settings.FREESWITCH_RECORD_TIMEOUT == 30

    def test_default_max_call_duration(self):
        settings = FreeSwitchSettings()
        assert settings.FREESWITCH_MAX_CALL_DURATION == 600

    def test_default_max_turns(self):
        settings = FreeSwitchSettings()
        assert settings.FREESWITCH_MAX_TURNS == 50

    def test_default_greeting(self):
        settings = FreeSwitchSettings()
        assert "Hello" in settings.FREESWITCH_GREETING

    def test_default_llm_timeout(self):
        settings = FreeSwitchSettings()
        assert settings.FREESWITCH_LLM_TIMEOUT == 15

    def test_default_reconnect_delay(self):
        settings = FreeSwitchSettings()
        assert settings.FREESWITCH_BRIDGE_RECONNECT_DELAY == 5

    def test_default_max_retries(self):
        settings = FreeSwitchSettings()
        assert settings.FREESWITCH_BRIDGE_MAX_RETRIES == 10

    def test_enabled_defaults_to_false(self):
        settings = FreeSwitchSettings()
        assert settings.enabled is False

    def test_esl_address_property(self):
        settings = FreeSwitchSettings()
        assert settings.esl_address == "127.0.0.1:8021"


class TestFreeSwitchSettingsFromEnv:
    def test_custom_esl_host(self):
        os.environ["FREESWITCH_ESL_HOST"] = "192.168.1.100"
        settings = FreeSwitchSettings()
        assert settings.FREESWITCH_ESL_HOST == "192.168.1.100"
        del os.environ["FREESWITCH_ESL_HOST"]

    def test_custom_port(self):
        os.environ["FREESWITCH_ESL_PORT"] = "8022"
        settings = FreeSwitchSettings()
        assert settings.FREESWITCH_ESL_PORT == 8022
        del os.environ["FREESWITCH_ESL_PORT"]

    def test_custom_password(self):
        os.environ["FREESWITCH_ESL_PASSWORD"] = "secret123"
        settings = FreeSwitchSettings()
        assert settings.FREESWITCH_ESL_PASSWORD == "secret123"
        del os.environ["FREESWITCH_ESL_PASSWORD"]

    def test_enabled_via_env(self):
        os.environ["FREESWITCH_BRIDGE_ENABLED"] = "true"
        settings = FreeSwitchSettings()
        assert settings.enabled is True
        del os.environ["FREESWITCH_BRIDGE_ENABLED"]

    def test_custom_greeting(self):
        os.environ["FREESWITCH_GREETING"] = "Hi there!"
        settings = FreeSwitchSettings()
        assert settings.FREESWITCH_GREETING == "Hi there!"
        del os.environ["FREESWITCH_GREETING"]

    def test_custom_audio_dir(self):
        os.environ["FREESWITCH_AUDIO_DIR"] = "/custom/path"
        settings = FreeSwitchSettings()
        assert settings.FREESWITCH_AUDIO_DIR == "/custom/path"
        del os.environ["FREESWITCH_AUDIO_DIR"]


class TestGetFreeSwitchSettings:
    def test_singleton(self):
        s1 = get_freeswitch_settings()
        s2 = get_freeswitch_settings()
        assert s1 is s2
