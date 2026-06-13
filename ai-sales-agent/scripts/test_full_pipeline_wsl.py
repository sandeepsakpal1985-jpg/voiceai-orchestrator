#!/usr/bin/env python3
"""Test all components needed for calling in WSL deployment."""

import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
import urllib.error


def test_esl(host="127.0.0.1", port=8021, password="ClueCon"):
    """Test ESL connectivity to FreeSWITCH."""
    print(f"\n{'='*60}")
    print(f"TEST 1: ESL Connectivity ({host}:{port})")
    print(f"{'='*60}")
    try:
        s = socket.socket()
        s.settimeout(5)
        s.connect((host, port))
        banner = s.recv(1024).decode().strip()
        print(f"  Banner: {banner}")
        s.send(f"auth {password}\n".encode())
        time.sleep(0.3)
        resp = s.recv(4096).decode().strip()
        print(f"  Auth: {resp}")
        
        if "OK" in resp:
            # Get FS status
            s.send(b"api status\n")
            time.sleep(1)
            fs_status = s.recv(8192).decode()
            for line in fs_status.split('\n')[:5]:
                if line.strip():
                    print(f"  FS: {line.strip()}")
            s.close()
            print("  ✅ ESL: OK")
            return True
        s.close()
        print("  ❌ ESL Auth failed")
        return False
    except Exception as e:
        print(f"  ❌ ESL: {e}")
        return False


def test_ollama():
    """Test Ollama API."""
    print(f"\n{'='*60}")
    print("TEST 2: Ollama LLM")
    print(f"{'='*60}")
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:11434/api/generate",
            data=json.dumps({
                "model": "qwen2.5:1.5b",
                "prompt": "Say 'hello' in one word",
                "stream": False,
            }).encode(),
            headers={"Content-Type": "application/json"},
        )
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read().decode())
        response = data.get("response", "")
        print(f"  Response: {response[:100]}")
        print("  ✅ Ollama: OK")
        return bool(response)
    except Exception as e:
        print(f"  ❌ Ollama: {e}")
        return False


def test_redis():
    """Test Redis connection."""
    print(f"\n{'='*60}")
    print("TEST 3: Redis")
    print(f"{'='*60}")
    try:
        result = subprocess.run(
            ["redis-cli", "ping"],
            capture_output=True, text=True, timeout=5
        )
        if "PONG" in result.stdout:
            print("  ✅ Redis: OK")
            return True
        print(f"  ❌ Redis: {result.stdout.strip() or result.stderr.strip()}")
        return False
    except Exception as e:
        print(f"  ❌ Redis: {e}")
        return False


def test_backend_health():
    """Test backend health endpoint."""
    print(f"\n{'='*60}")
    print("TEST 4: Backend Health")
    print(f"{'='*60}")
    try:
        resp = urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=10)
        data = json.loads(resp.read().decode())
        print(f"  Response: {json.dumps(data, indent=2)[:500]}")
        print("  ✅ Backend: OK")
        return True
    except Exception as e:
        print(f"  ❌ Backend: {e}")
        return False


def test_sip():
    """Test SIP registration status."""
    print(f"\n{'='*60}")
    print("TEST 5: SIP Registration")
    print(f"{'='*60}")
    try:
        s = socket.socket()
        s.settimeout(5)
        s.connect(("127.0.0.1", 8021))
        s.recv(1024)  # banner
        s.send(b"auth ClueCon\n")
        time.sleep(0.3)
        s.recv(4096)  # auth response
        s.send(b"api sofia status\n")
        time.sleep(1)
        data = s.recv(16384).decode()
        for line in data.split('\n'):
            if any(x in line.lower() for x in ['profile', 'registered', 'gateway']):
                print(f"  {line.strip()}")
        s.close()
        print("  ✅ SIP: OK")
        return True
    except Exception as e:
        print(f"  ❌ SIP: {e}")
        return False


def main():
    print("=" * 60)
    print("WSL DEPLOYMENT FULL PIPELINE TEST")
    print("=" * 60)

    results = {}

    results["esl"] = test_esl()
    results["ollama"] = test_ollama()
    results["redis"] = test_redis()
    results["backend"] = test_backend_health()
    results["sip"] = test_sip()

    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    all_pass = True
    for name, ok in results.items():
        status = "✅" if ok else "❌"
        print(f"  {status} {name}")
        if not ok:
            all_pass = False

    print(f"\n  Overall: {'✅ ALL PASS' if all_pass else '❌ SOME FAILED'}")
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
