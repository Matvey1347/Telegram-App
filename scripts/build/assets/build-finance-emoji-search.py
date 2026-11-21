"""Generate emoji search indexes from cldr-annotations-full npm tarball.

Usage: python3 scripts/build/assets/build-finance-emoji-search.py /path/to/cldr-annotations-full-49.0.0.tgz /path/to/cldr-annotations-derived-full-49.0.0.tgz
Data: Unicode CLDR 49, Unicode License v3; see public/emoji-search/LICENSE.
"""
import json, re, sys, tarfile, unicodedata
from collections import defaultdict
from pathlib import Path

root = Path(__file__).resolve().parents[3]
out = root / 'apps/standalone/finance/web/public/emoji-search'
terms = defaultdict(lambda: defaultdict(set))

def script(text):
    for char in text:
        name = unicodedata.name(char, '')
        for key, names in [('latin', ('LATIN',)), ('cyrillic', ('CYRILLIC',)), ('cjk', ('CJK', 'HIRAGANA', 'KATAKANA', 'HANGUL')), ('arabic', ('ARABIC',))]:
            if any(n in name for n in names): return key
        if char.isalpha(): return 'other'
    return None

def normalize(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text.casefold()) if not unicodedata.combining(c))

for path, section in [(sys.argv[1], 'annotations'), (sys.argv[2], 'annotationsDerived')]:
    with tarfile.open(path) as archive:
        (out / 'LICENSE').write_bytes(archive.extractfile('package/LICENSE').read())
        for member in archive.getmembers():
            if not member.name.endswith('/annotations.json'): continue
            annotations = json.load(archive.extractfile(member)).get(section, {}).get('annotations', {})
            for emoji, entry in annotations.items():
                # Skin descriptions are indexed separately and combined with the base emoji in the picker.
                if len(emoji) > 1 and any('\U0001f3fb' <= char <= '\U0001f3ff' for char in emoji): continue
                emoji = emoji.replace('\ufe0f', '')
                for values in entry.values():
                    for value in values:
                        normalized = normalize(value)
                        key = script(normalized)
                        if key and normalized: terms[key][emoji].add(normalized)
for key, emojis in terms.items():
    data = {emoji: ' | '.join(sorted(values)) for emoji, values in emojis.items()}
    (out / f'{key}.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    print(key, len(emojis), (out / f'{key}.json').stat().st_size)
