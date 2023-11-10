import torch
from TTS.api import TTS
import sys

id = sys.argv[1]
device = "cuda" if torch.cuda.is_available() else "cpu"
tts = TTS("tts_models/bn/custom/vits-male").to(device)
text_string = open(f"./audio-digest/{id}.txt", mode='r', encoding='utf8')
tts.tts_to_file(text=text_string.read(), file_path=f"./audio-digest/{id}.wav", speed=2)
text_string.close()