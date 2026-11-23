"""Writes the test vectors of `cpace-vectors.txt` with trezorlib as the reference.

Usage: python3 gen_cpace_vectors.py <trezor-firmware>/python/src/trezorlib/thp > cpace-vectors.txt

trezorlib is the reference implementation that the vectors come from. It is not part of this
repository: the script imports it from the path in the first argument. The random numbers come
from a fixed seed, so the same trezorlib gives the same file.

Lines:
  E <input 32 bytes> <output 32 bytes>
      The Elligator 2 map of the pairing code, as trezorlib computes it. The inputs are the edge
      values around 0, around p = 2^255 - 19 and around 2^255, each with and without the top bit,
      and random values.
  C <code> <handshake hash> <host private key> <device public key> <host public key> <host tag> <device tag>
    <secret> <challenge> <device code>
      A whole CPace exchange. The host tag is what the host sends. The device tag is the one that
      the firmware computes from its own private key. The two are equal. The last three fields
      are the code that the device derives from its secret and the challenge.
All numbers are lower-case hex, except the code.
"""
import hashlib
import importlib
import os
import random
import sys
import types

# The two modules sit in a package whose `__init__` pulls in more than the script needs, so the
# package is made empty and only its two modules are loaded.
package = types.ModuleType("thp")
package.__path__ = [os.path.abspath(sys.argv[1])]
sys.modules["thp"] = package
cpace = importlib.import_module("thp.cpace")
curve25519 = importlib.import_module("thp.curve25519")

P = 2**255 - 19
rng = random.Random(553)


def le(n):
    return n.to_bytes(32, "little")


def rand(n):
    return bytes(rng.getrandbits(8) for _ in range(n))


edges = list(range(0, 12)) + [P + d for d in range(-8, 9)] + [2**255 - k for k in range(1, 13)]
inputs = []
for value in edges:
    value %= 2**256
    inputs.append(le(value))
    inputs.append(le(value | (1 << 255)))
inputs += [rand(32) for _ in range(200)]
for data in inputs:
    print("E %s %s" % (data.hex(), curve25519.elligator2(data).hex()))

for _ in range(100):
    code = ("%06d" % rng.randrange(10**6)).encode()
    handshake_hash = rand(32)
    host_private = rand(32)
    device_private = rand(32)
    device_public = curve25519.multiply(device_private, cpace._generator(code, handshake_hash))
    exchange = cpace.cpace(prs=code, ci=handshake_hash, b_pubkey=device_public, _a_privkey=host_private)
    device_shared = curve25519.multiply(device_private, exchange.a_pubkey)
    secret = rand(16)
    challenge = rand(16)
    digest = hashlib.sha256(b"\x02" + handshake_hash + secret + challenge).digest()
    device_code = "%06d" % (int.from_bytes(digest, "big") % 10**6)
    print(
        "C %s %s %s %s %s %s %s %s %s %s"
        % (
            code.decode(),
            handshake_hash.hex(),
            host_private.hex(),
            device_public.hex(),
            exchange.a_pubkey.hex(),
            hashlib.sha256(exchange.shared_secret).hexdigest(),
            hashlib.sha256(device_shared).hexdigest(),
            secret.hex(),
            challenge.hex(),
            device_code,
        )
    )
