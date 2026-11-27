#!/usr/bin/env python3
"""Compares the hand-written protobuf messages of this crate with the firmware's .proto files.

The messages of the Safe 7 are written by hand in `src/proto.rs`, and the messages that only the
emulator tests use are written by hand at the top of `tests/emulator.rs`. Run this script after a
firmware bump: it reads both files and checks that every field has the number, the label and the
type that the firmware's `common/protob/messages*.proto` give it, that every enum value has the
number of the firmware, and that every wire type number is the one of `messages.proto`.

Usage:
  python3 -I check-proto.py <directory with the .proto files> <rust file>...

Example, from `src-tauri/trezor` (see README.md in this folder for how to fetch the .proto files):
  python3 -I tests/emulator-rig/check-proto.py "$PROTO_DIR" src/proto.rs tests/emulator.rs

It needs Python 3.8 or newer and nothing else. It prints one line for each problem. The last line is
`OK <n> checked, 0 problems`, and the exit code is 0 only then. A line that starts with `NOTE` is
not a problem: it names a Rust item that the script does not check.

The check is textual. It does not read Rust, so it expects the layout of the two files: one
`#[prost(...)]` attribute before each field, `Name => number` lines in the `wire!` list of
`src/proto.rs`, and `const TYPE: u16 = number;` in the `impl Wire` blocks of `tests/emulator.rs`.
"""
import glob
import re
import sys

# A Rust name that differs from the name in the .proto file.
RENAMED = {"HdNodeType": "HDNodeType"}


def strip_comments(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def read_protos(proto_dir):
    """Returns (messages, enums, wire): message -> {field: (label, type, number)},
    enum -> {value: number}, and message name -> wire type number."""
    messages, enums, wire = {}, {}, {}
    files = sorted(glob.glob(proto_dir + "/messages*.proto"))
    if not files:
        sys.exit("no messages*.proto in " + proto_dir)
    for path in files:
        with open(path) as handle:
            text = strip_comments(handle.read())
        stack = []
        # Cut after each `;`, `{` and `}`, so that a line holds one statement.
        for raw in re.split(r"(?<=[;{}])", text):
            line = raw.strip()
            if not line:
                continue
            opened = re.match(r"(message|enum)\s+(\w+)\s*\{", line)
            if opened:
                stack.append((opened.group(1), opened.group(2)))
                (messages if opened.group(1) == "message" else enums).setdefault(
                    opened.group(2), {}
                )
                line = line[opened.end():].strip()
                if not line:
                    continue
            if line == "}":
                if stack:
                    stack.pop()
                continue
            if not stack:
                continue
            kind, name = stack[-1]
            if kind == "message":
                field = re.match(
                    r"(required|optional|repeated)\s+([\w.]+)\s+(\w+)\s*=\s*(\d+)", line
                )
                if field:
                    messages[name][field.group(3)] = (
                        field.group(1),
                        field.group(2),
                        int(field.group(4)),
                    )
            else:
                value = re.match(r"(\w+)\s*=\s*(\d+)", line)
                if value and not line.startswith(("option", "reserved")):
                    enums[name][value.group(1)] = int(value.group(2))
    with open(proto_dir + "/messages.proto") as handle:
        for match in re.finditer(r"MessageType_(\w+)\s*=\s*(\d+)", handle.read()):
            wire[match.group(1)] = int(match.group(2))
    with open(proto_dir + "/messages-thp.proto") as handle:
        for match in re.finditer(r"ThpMessageType_(\w+)\s*=\s*(\d+)", handle.read()):
            wire.setdefault(match.group(1), int(match.group(2)))
    return messages, enums, wire


class Report:
    def __init__(self):
        self.checked = 0
        self.problems = 0

    def problem(self, *words):
        print(*words)
        self.problems += 1


def check_structs(rust, messages, enums, report):
    # A struct of proto.rs is `pub(crate) struct`, one of emulator.rs is a private `struct`.
    for struct in re.finditer(
        r"(?:pub\(crate\) )?struct (\w+) \{(?:\}|\n(.*?)\n\})", rust, flags=re.S
    ):
        name, body = struct.group(1), struct.group(2) or ""
        if "#[prost(" not in body:
            # Not a message with fields: a helper struct of the tests, or an empty message.
            continue
        proto_name = RENAMED.get(name, name)
        if proto_name not in messages:
            print("NOTE no proto message", name)
            continue
        fields = messages[proto_name]
        for field in re.finditer(r"#\[prost\(([^\]]*)\)\]\s*(?:pub )?(\w+): ([^,]+),", body):
            attrs, field_name = field.group(1), field.group(2)
            tag = int(re.search(r'tag = "(\d+)"', attrs).group(1))
            label = (
                "repeated"
                if "repeated" in attrs
                else "required" if "required" in attrs else "optional"
            )
            if field_name not in fields:
                report.problem("MISSING in proto:", name, field_name)
                continue
            proto_label, proto_type, proto_number = fields[field_name]
            report.checked += 1
            if proto_number != tag:
                report.problem("TAG", name, field_name, "rust", tag, "proto", proto_number)
            if proto_label != label:
                report.problem("LABEL", name, field_name, "rust", label, "proto", proto_label)
            base = attrs.split(",")[0].strip()
            plain = {"string", "uint32", "uint64", "bool", "bytes"}
            simple = proto_type.split(".")[-1]
            if simple in plain:
                if not base.startswith(simple):
                    report.problem("TYPE", name, field_name, "rust", base, "proto", proto_type)
            elif simple in enums:
                # An enum is a varint on the wire, so a test message may use `uint32` for it.
                if not base.startswith(("enumeration", "uint32")):
                    report.problem("TYPE", name, field_name, "rust", base, "proto enum", proto_type)
            elif base != "message":
                report.problem("TYPE", name, field_name, "rust", base, "proto message", proto_type)
            # proto2 does not pack repeated numbers.
            if label == "repeated" and simple == "uint32" and 'packed = "false"' not in attrs:
                report.problem("PACKED", name, field_name)


def check_enums(rust, enums, report):
    def norm(text):
        return re.sub(r"[^a-z0-9]", "", text.lower())

    for enum in re.finditer(r"pub\(crate\) enum (\w+) \{(.*?)\n\}", rust, flags=re.S):
        name, body = enum.group(1), enum.group(2)
        if name not in enums:
            print("NOTE no proto enum", name)
            continue
        values = enums[name]
        for value in re.finditer(r"(\w+) = (\d+),", body):
            variant, number = value.group(1), int(value.group(2))
            # prost names are CamelCase, the proto names are UPPER_CASE with a type prefix, so
            # compare them without case, underscores and prefix.
            hits = [
                known
                for known in values
                if norm(known).endswith(norm(variant)) or norm(variant).endswith(norm(known))
            ]
            report.checked += 1
            if not hits:
                report.problem("ENUM no value", name, variant)
            elif not any(values[hit] == number for hit in hits):
                report.problem(
                    "ENUM number", name, variant, "rust", number, "proto",
                    [(hit, values[hit]) for hit in hits],
                )


def check_wire(rust, wire, report):
    # proto.rs: `Name => number,` in the `wire!` list. emulator.rs: `impl Wire for Name { const
    # TYPE: u16 = number; }`.
    pairs = [(m.group(1), int(m.group(2))) for m in re.finditer(r"(\w+) => (\d+),", rust)]
    pairs += [
        (m.group(1), int(m.group(2)))
        for m in re.finditer(
            r"impl Wire for (\w+) \{\s*const TYPE: u16 = (\d+);", rust
        )
    ]
    for name, number in pairs:
        if name in wire:
            report.checked += 1
            if wire[name] != number:
                report.problem("WIRE", name, "rust", number, "proto", wire[name])
        elif name.startswith("TxAck"):
            # Every TxAck message travels as MessageType_TxAck (22).
            report.checked += 1
            if number != 22:
                report.problem("WIRE", name, number)
        else:
            print("NOTE wire name not in messages.proto:", name)


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    messages, enums, wire = read_protos(sys.argv[1])
    report = Report()
    for path in sys.argv[2:]:
        with open(path) as handle:
            rust = handle.read()
        check_structs(rust, messages, enums, report)
        check_enums(rust, enums, report)
        check_wire(rust, wire, report)
    print("OK" if not report.problems else "PROBLEMS", report.checked, "checked,",
          report.problems, "problems")
    sys.exit(1 if report.problems else 0)


main()
