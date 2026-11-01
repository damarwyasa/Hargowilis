import os
from PIL import Image

ada_error = 0
for z in range(13, 20):          # zoom 13 sampai 19
    folder = str(z)
    if not os.path.isdir(folder):
        print("zoom", z, "tidak ada, dilewati")
        continue
    jumlah = 0
    for root, _, files in os.walk(folder):
        for f in files:
            if f.lower().endswith(".png"):
                src = os.path.join(root, f)
                dst = src[:-4] + ".webp"
                try:
                    Image.open(src).save(dst, "WEBP", quality=80, method=4)
                    os.remove(src)
                    jumlah += 1
                except Exception as e:
                    ada_error += 1
                    print("GAGAL:", src, e)
    print("zoom", z, "selesai:", jumlah, "file")
print("SELESAI. Jumlah error:", ada_error)