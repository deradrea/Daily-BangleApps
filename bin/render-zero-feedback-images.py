"""Convert pinned native graphics pixels to readable PNG review sheets."""
from pathlib import Path
import base64
import json
import sys
from PIL import Image, ImageDraw, ImageFont

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'output/zero-ui-review'
data = json.loads((root / 'native-frames.json').read_text(encoding='utf-8'))
for frame in data['frames']:
    pixels = base64.b64decode(frame['pixelsBase64'])
    assert len(pixels) == 176 * 176
    image = Image.new('RGB', (176, 176))
    image.putdata([((v & 4) * 255 // 4, (v & 2) * 255 // 2, (v & 1) * 255) for v in pixels])
    image.save(root / (frame['name'] + '.png'))
font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 22)
canvas = Image.new('RGB', (1184, 438), '#101b24')
draw = ImageDraw.Draw(canvas)
for i, (name, label) in enumerate([('before', 'Prima · rendering precedente'), ('transfer', 'Trasferimento · nuovo'), ('paused', 'Connessione interrotta')]):
    x = 16 + i * 392
    draw.text((x, 12), label, font=font, fill='white')
    canvas.paste(Image.open(root / (name + '.png')).resize((352, 352), Image.Resampling.NEAREST), (x, 58))
canvas.save(root / 'comparison.png')
labels = ['Preparazione', 'Trasferimento', 'Trasferimento concluso', 'Avvio protetto', 'Memoria', 'Installazione', 'Riavvio', 'Completato', 'Connessione persa', 'Errore']
canvas = Image.new('RGB', (1184, 940), '#101b24')
draw = ImageDraw.Draw(canvas)
for i, frame in enumerate([f for f in data['frames'] if f['name'] != 'before']):
    x, y = 16 + (i % 4) * 292, 12 + (i // 4) * 310
    draw.text((x, y), labels[i], font=font, fill='white')
    canvas.paste(Image.open(root / (frame['name'] + '.png')).resize((264, 264), Image.Resampling.NEAREST), (x, y + 32))
canvas.save(root / 'all-stages.png')
print(root / 'comparison.png')
