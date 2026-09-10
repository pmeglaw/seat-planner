#!/usr/bin/env python3
"""
Contrast checker for the IBM / Carbon palette.

Why this exists: the palette is a uniform 12-grade ladder, so people reach for
the step-counting rule and assume a grade-30 colour behaves like every other
grade-30 colour. Yellow and orange break that badly -- yellow 30 (#f1c21b),
Carbon's warning colour, is 1.68:1 on white and fails the 3:1 minimum for
graphical elements. Those failures are invisible by eye, so measure.

Usage
-----
  # any two colours, by hex or by Carbon palette name
  python check_contrast.py "yellow-30" white
  python check_contrast.py "#f1c21b" "#ffffff"

  # a whole theme's worth of pairs at once, from JSON on stdin or a file
  python check_contrast.py --pairs pairs.json
      where pairs.json is [{"name": "...", "fg": "...", "bg": "...",
                            "kind": "text"|"large-text"|"graphic"}, ...]

  # START HERE for a new design: check a whole palette against every surface
  # it can land on -- resting, layered, AND hovered -- in one call
  python check_contrast.py --preset status-light text-light
  python check_contrast.py --preset all

  # sweep one colour against every grade of a family to find what passes
  python check_contrast.py --find "#ffffff" --family blue --kind graphic

Exit code is 1 if anything fails, so this can gate a build.
"""

import argparse
import json
import re
import sys

PALETTE = {
    "blue":      ["001141","001d6c","002d9c","0043ce","0f62fe","4589ff","78a9ff","a6c8ff","d0e2ff","edf5ff"],
    "cyan":      ["061727","012749","003a6d","00539a","0072c3","1192e8","33b1ff","82cfff","bae6ff","e5f6ff"],
    "teal":      ["081a1c","022b30","004144","005d5d","007d79","009d9a","08bdba","3ddbd9","9ef0f0","d9fbfb"],
    "green":     ["071908","022d0d","044317","0e6027","198038","24a148","42be65","6fdc8c","a7f0ba","defbe6"],
    "yellow":    ["1c1500","302400","483700","684e00","8e6a00","b28600","d2a106","f1c21b","fddc69","fcf4d6"],
    "orange":    ["231000","3e1a00","5e2900","8a3800","ba4e00","eb6200","ff832b","ffb784","ffd9be","fff2e8"],
    "red":       ["2d0709","520408","750e13","a2191f","da1e28","fa4d56","ff8389","ffb3b8","ffd7d9","fff1f1"],
    "magenta":   ["2a0a18","510224","740937","9f1853","d02670","ee5396","ff7eb6","ffafd2","ffd6e8","fff0f7"],
    "purple":    ["1c0f30","31135e","491d8b","6929c4","8a3ffc","a56eff","be95ff","d4bbff","e8daff","f6f2ff"],
    "gray":      ["161616","262626","393939","525252","6f6f6f","8d8d8d","a8a8a8","c6c6c6","e0e0e0","f4f4f4"],
    "cool-gray": ["121619","21272a","343a3f","4d5358","697077","878d96","a2a9b0","c1c7cd","dde1e6","f2f4f8"],
    "warm-gray": ["171414","272525","3c3838","565151","726e6e","8f8b8b","ada8a8","cac5c4","e5e0df","f7f3f2"],
}
GRADES = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10]

THRESHOLDS = {"text": 4.5, "large-text": 3.0, "graphic": 3.0}

# Surfaces a mark can land on. In light themes rows and tiles LIGHTEN on hover,
# so the resting surface is not the worst case -- check the hover surface too.
LIGHT_SURFACES = [("white", "ffffff"), ("layer-01", "f4f4f4"), ("hover", "e8e8e8")]
DARK_SURFACES = [("background", "161616"), ("layer-01", "262626"), ("hover", "333333")]

PRESETS = {
    # name: (surfaces, [(label, colour, kind)])
    "status-light": (LIGHT_SURFACES, [
        ("error", "red-60", "graphic"), ("success", "green-50", "graphic"),
        ("warning", "yellow-30", "graphic"), ("caution", "orange-40", "graphic"),
        ("info", "blue-70", "graphic"), ("undefined", "purple-60", "graphic"),
        ("draft", "gray-60", "graphic"), ("interactive", "blue-60", "graphic")]),
    "status-dark": (DARK_SURFACES, [
        ("error", "red-50", "graphic"), ("success", "green-40", "graphic"),
        ("warning", "yellow-30", "graphic"), ("caution", "orange-40", "graphic"),
        ("info", "blue-50", "graphic"), ("undefined", "purple-50", "graphic"),
        ("draft", "gray-50", "graphic"), ("interactive", "blue-50", "graphic")]),
    "text-light": (LIGHT_SURFACES, [
        ("text-primary", "gray-100", "text"), ("text-secondary", "gray-70", "text"),
        ("text-helper", "gray-60", "text"), ("text-error", "red-60", "text"),
        ("link", "blue-60", "text")]),
    "text-dark": (DARK_SURFACES, [
        ("text-primary", "gray-10", "text"), ("text-secondary", "gray-30", "text"),
        ("text-helper", "gray-40", "text"), ("text-error", "red-40", "text"),
        ("link", "blue-40", "text")]),
}


def run_preset(names):
    """Check a whole palette against every surface it can land on, in one pass.

    Doing this as one call rather than pair-by-pair matters: the failures cluster
    on the hover surface, which is easy to forget when checking colours one at a time.
    """
    results = []
    for name in names:
        surfaces, entries = PRESETS[name]
        print(f"\n=== {name} ===")
        for label, colour, kind in entries:
            row = []
            worst_ok = True
            for surf_name, surf_hex in surfaces:
                r = ratio(colour, surf_hex)
                ok = r >= THRESHOLDS[kind]
                worst_ok = worst_ok and ok
                row.append(f"{surf_name} {r:5.2f}{'' if ok else ' FAIL'}")
            mark = "PASS" if worst_ok else "FAIL"
            print(f"[{mark}] {label:<12} {grade_of(colour):<14} " + " | ".join(row))
            results.append(worst_ok)
            if not worst_ok:
                family = grade_of(colour).rsplit(" ", 1)[0]
                if family in PALETTE:
                    fixes = [g for g, h in zip(GRADES, PALETTE[family])
                             if all(ratio(h, s[1]) >= THRESHOLDS[kind] for s in surfaces)]
                    print("        clears every surface at: "
                          + (", ".join(f"{family} {g}" for g in fixes) if fixes
                             else "no grade of this family — pick another"))
    failed = results.count(False)
    print(f"\n{len(results) - failed}/{len(results)} clear every surface"
          + (f" — {failed} to fix" if failed else ""))
    return failed == 0


def resolve(value):
    """Accept '#f1c21b', 'f1c21b', 'yellow-30', 'white', 'black'."""
    v = str(value).strip().lower()
    if v in ("white", "#ffffff", "ffffff"):
        return "ffffff"
    if v in ("black", "#000000", "000000"):
        return "000000"
    v = v.lstrip("#")
    if re.fullmatch(r"[0-9a-f]{6}", v):
        return v
    if re.fullmatch(r"[0-9a-f]{3}", v):
        return "".join(c * 2 for c in v)
    m = re.fullmatch(r"([a-z-]+)[- ](\d{1,3})", v)
    if m and m.group(1) in PALETTE:
        grade = int(m.group(2))
        if grade in GRADES:
            return PALETTE[m.group(1)][GRADES.index(grade)]
        raise ValueError(f"{grade} is not a Carbon grade (10..100 by tens)")
    raise ValueError(f"can't resolve colour: {value!r}")


def _lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex6):
    r, g, b = (int(hex6[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def ratio(fg, bg):
    a, b = luminance(resolve(fg)), luminance(resolve(bg))
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


def grade_of(hex6):
    """Reverse-lookup so failures can be reported in palette terms."""
    h = resolve(hex6)
    for family, ramp in PALETTE.items():
        if h in ramp:
            return f"{family} {GRADES[ramp.index(h)]}"
    return {"ffffff": "white", "000000": "black"}.get(h, f"#{h}")


def report(name, fg, bg, kind):
    need = THRESHOLDS[kind]
    r = ratio(fg, bg)
    ok = r >= need
    mark = "PASS" if ok else "FAIL"
    label = f"{name}: " if name else ""
    print(f"[{mark}] {label}{grade_of(fg)} on {grade_of(bg)} "
          f"= {r:.2f}:1 (needs {need}:1 for {kind})")
    if not ok:
        print(f"        short by {need - r:.2f}. Try a darker or lighter grade of the "
              f"same family, or run --find to see which grades clear it.")
    return ok


def find(against, family, kind):
    need = THRESHOLDS[kind]
    print(f"Grades of {family} that reach {need}:1 against {grade_of(against)}:")
    passing = []
    for grade, hex6 in zip(GRADES, PALETTE[family]):
        r = ratio(hex6, against)
        flag = "ok " if r >= need else "   "
        print(f"  {flag} {family} {grade:>3}  #{hex6}  {r:5.2f}:1")
        if r >= need:
            passing.append(grade)
    print("\nUse:", ", ".join(f"{family} {g}" for g in passing) if passing
          else "none of them — pick a different family")
    return True


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("fg", nargs="?", help="foreground colour (hex or 'blue-60')")
    p.add_argument("bg", nargs="?", help="background colour")
    p.add_argument("--kind", default="text",
                   choices=sorted(THRESHOLDS), help="what is being drawn (default: text)")
    p.add_argument("--pairs", help="JSON file of {name, fg, bg, kind} objects; '-' for stdin")
    p.add_argument("--find", metavar="BG",
                   help="sweep a family against this background instead of checking one pair")
    p.add_argument("--family", default="blue", choices=sorted(PALETTE),
                   help="family to sweep with --find")
    p.add_argument("--preset", nargs="+", choices=sorted(PRESETS) + ["all"],
                   help="check a standard palette against every surface it can land on, "
                        "including the hover surface. Start here — one call instead of many.")
    args = p.parse_args()

    try:
        if args.preset:
            names = sorted(PRESETS) if "all" in args.preset else args.preset
            return 0 if run_preset(names) else 1

        if args.find:
            return 0 if find(args.find, args.family, args.kind) else 1

        if args.pairs:
            raw = sys.stdin.read() if args.pairs == "-" else open(args.pairs).read()
            items = json.loads(raw)
            results = [report(i.get("name", ""), i["fg"], i["bg"], i.get("kind", "text"))
                       for i in items]
            failed = results.count(False)
            print(f"\n{len(results) - failed}/{len(results)} pass"
                  + (f" — {failed} to fix" if failed else ""))
            return 1 if failed else 0

        if not (args.fg and args.bg):
            p.print_help()
            return 2
        return 0 if report("", args.fg, args.bg, args.kind) else 1

    except (ValueError, KeyError, json.JSONDecodeError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
