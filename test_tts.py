import requests
import base64

payload = {
    "text": "Hello Sandeep. This is a voice synthesis test."
}

response = requests.post(
    "http://127.0.0.1:8000/voice/synthesize",
    json=payload,
    timeout=300
)

print("Status:", response.status_code)

if response.status_code != 200:
    print(response.text)
    exit()

data = response.json()

audio_bytes = base64.b64decode(data["audio_base64"])

with open("output.wav", "wb") as f:
    f.write(audio_bytes)

print("Audio saved as output.wav")
