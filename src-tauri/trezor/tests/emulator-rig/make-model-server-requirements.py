#!/usr/bin/env python3
"""Writes `model-server-requirements.txt` from the `poetry.lock` of ts-tvl.

ts-tvl (package `tvl`) is Tropic Square's model of the Tropic01 secure element. The Safe 7
emulator needs it. The firmware release names the exact commit of ts-tvl in `vendor/ts-tvl`.

This script keeps the packages of the `main` group, picks the version that each package has for
CPython 3.10 on Linux, and lists the hash of every file of that version. It leaves out `crcmod`:
the workflow installs it from a source archive that it checks by hash. It leaves out `tvl` itself:
the workflow copies it from the git commit.

Usage (Python 3.11 or newer, because it reads TOML with the standard library):
  python3 -I make-model-server-requirements.py <poetry.lock> <ts-tvl commit> > model-server-requirements.txt

The output is the whole file, with its header. If the result differs from the file in the
repository, the new file is the one to check in: read README.md in this folder first.
"""
import re
import sys
import tomllib

# The environment that the markers of poetry.lock are evaluated for. Python 3.10 is the oldest
# version that the pinned packages support. The CI job runs a newer CPython, and README.md in
# this folder says why that works.
ENVIRONMENT = {
  "python_version": "3.10",
  "python_full_version": "3.10.0",
  "platform_system": "Linux",
  "sys_platform": "linux",
  "implementation_name": "cpython",
}

SKIPPED = {"crcmod"}

HEADER = """\
# Model server (ts-tvl) runtime dependencies, taken from ts-tvl's poetry.lock at commit
# {commit}, main group, markers resolved for CPython 3.10 on Linux.
# Every wheel and source hash of each release is listed, so aarch64 and x86_64 both resolve.
# The `trezor-test` job in .github/workflows/test.yml installs this file with
# `pip --require-hashes`. It runs CPython 3.12 (see README.md in this folder for why that works,
# and for how to make this file again). crcmod 1.7 and tvl itself are not in it: the job installs
# them with their own pins.
"""


def version_tuple(text):
  """3.11.0a6 becomes (3, 11, 0): a pre-release suffix is ignored."""
  return tuple(int(part) for part in re.findall(r"\d+", text.split("a")[0].split("b")[0]))


def compare(left, operator, right):
  if operator in ("==", "!="):
    equal = left == right
    return equal if operator == "==" else not equal
  # Only the version variables are compared with an order.
  left, right = version_tuple(left), version_tuple(right)
  return {
    "<": left < right,
    "<=": left <= right,
    ">": left > right,
    ">=": left >= right,
  }[operator]


def holds(markers):
  """Evaluates a marker such as `python_version >= "3.9" and sys_platform != "win32"`. `and`
  binds tighter than `or`. Nothing else (no parentheses, no `in`) occurs in the lock file, and
  an expression that this function does not know stops the script."""
  for alternative in markers.split(" or "):
    if all(clause_holds(clause) for clause in alternative.split(" and ")):
      return True
  return False


def clause_holds(clause):
  match = re.fullmatch(r'\s*(\w+)\s*(==|!=|<=|>=|<|>)\s*"([^"]*)"\s*', clause)
  if not match or match.group(1) not in ENVIRONMENT:
    sys.exit(f"The marker {clause!r} is not one that this script knows. Extend the script.")
  name, operator, value = match.groups()
  return compare(ENVIRONMENT[name], operator, value)


def applies(package):
  if "main" not in package.get("groups", []):
    return False
  markers = package.get("markers")
  if isinstance(markers, dict):
    markers = markers.get("main")
  return markers is None or holds(markers)


def main():
  if len(sys.argv) != 3:
    sys.exit(__doc__)
  lock_path, commit = sys.argv[1], sys.argv[2]
  with open(lock_path, "rb") as handle:
    lock = tomllib.load(handle)
  chosen = {}
  for package in lock["package"]:
    name = package["name"]
    if name in SKIPPED or not applies(package):
      continue
    if name in chosen:
      sys.exit(f"{name} has two versions for CPython 3.10 on Linux. Check the markers.")
    chosen[name] = package
  out = [HEADER.format(commit=commit)]
  for name in sorted(chosen):
    package = chosen[name]
    hashes = sorted({entry["hash"] for entry in package["files"]})
    lines = [f"{name}=={package['version']}"] + [f"    --hash={digest}" for digest in hashes]
    out.append(" \\\n".join(lines) + "\n")
  sys.stdout.write("".join(out))


main()
