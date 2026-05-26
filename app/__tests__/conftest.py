"""
Pytest configuration for VoiceAI backend tests.

Sets AUTH_BYPASS=true so that tests don't need to provide JWT tokens.
Auth middleware is tested separately in test_integration.py.
"""

import os

# Enable auth bypass so all existing tests work without JWT tokens.
# Auth middleware is tested exhaustively in test_integration.py.
os.environ.setdefault("AUTH_BYPASS", "true")
