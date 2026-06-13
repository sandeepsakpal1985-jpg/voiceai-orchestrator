import base64
import requests

with open(r"C:\Users\sande\OneDrive\Documents\Sound Recordings\test.wav", "rb") as f:
    audio = base64.b64encode(f.read()).decode("utf-8")

payload = {
    "audio_base64": audio,
    "conversation_id": None,
    "language": "en"
}

response = requests.post(
    "http://127.0.0.1:8000/voice/process",
    json=payload,
    timeout=300
)

print("Status:", response.status_code)
print(response.text)