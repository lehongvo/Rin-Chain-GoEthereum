import json, glob
from eth_keyfile import decode_keyfile_json

with open("/data/password.txt", "rb") as f:
    pw = f.read().strip()
keyfiles = sorted(glob.glob("/data/keystore/*"))
if not keyfiles:
    raise SystemExit("No keystore files found in /data/keystore")
with open(keyfiles[0]) as fh:
    k = json.load(fh)
priv = decode_keyfile_json(k, pw)
print(priv.hex())
