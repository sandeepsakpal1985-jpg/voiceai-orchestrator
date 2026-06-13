#!/usr/bin/env python3
"""Test ESL connectivity to FreeSWITCH from within WSL environment."""

import socket
import subprocess
import sys
import time


def test_esl(host: str, port: int, password: str) -> bool:
    """Try to connect to FreeSWITCH ESL and authenticate."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect((host, port))
        # Read banner
        banner = s.recv(4096)
        print(f"  Banner: {banner.decode('utf-8', errors='replace').strip()}")
        # Authenticate
        s.send(f"auth {password}\n".encode())
        time.sleep(0.5)
        response = s.recv(4096)
        result = response.decode('utf-8', errors='replace').strip()
        print(f"  Auth response: {result}")
        s.close()
        return True
    except Exception as e:
        print(f"  FAILED: {e}")
        return False


def main():
    print("=== ESL Connectivity Tests ===\n")

    # Test 1: localhost port 8021
    print("1) 127.0.0.1:8021 (password: ClueCon)")
    r1 = test_esl("127.0.0.1", 8021, "ClueCon")

    # Test 2: Try to get container IP
    print("\n2) FreeSWITCH container IP")
    try:
        result = subprocess.run(
            ["docker", "inspect", "fs-test", "--format",
             "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}"],
            capture_output=True, text=True, timeout=5
        )
        container_ip = result.stdout.strip()
        if container_ip:
            print(f"   Container IP: {container_ip}")
            r2 = test_esl(container_ip, 8021, "ClueCon")
        else:
            print("   Could not get container IP")
            r2 = False
    except Exception as e:
        print(f"   Error getting container IP: {e}")
        r2 = False

    # Test 3: Check container logs for ESL errors
    print("\n3) Checking ESL-related logs")
    try:
        result = subprocess.run(
            ["docker", "logs", "fs-test"],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.split('\n'):
            if 'event_socket' in line.lower() or 'esl' in line.lower() or '8021' in line:
                print(f"   {line.strip()}")
    except Exception as e:
        print(f"   Error: {e}")

    # Summary
    print(f"\n=== Summary ===")
    print(f"localhost:8021: {'✅ OK' if r1 else '❌ FAILED'}")
    print(f"container IP: {'✅ OK' if r2 else '❌ FAILED' if 'r2' in dir() else '⏭️ SKIPPED'}")

    if not r1 and not r2:
        print("\nESL is not accessible. Possible issues:")
        print("  - Container not fully started yet (health: starting)")
        print("  - Port mapping not working correctly")
        print("  - FreeSWITCH event socket module not loaded")
        sys.exit(1)
    else:
        print("\nESL is accessible!")
        sys.exit(0)


if __name__ == "__main__":
    main()
