from pathlib import Path
import subprocess
import re

root = Path('/home/ubuntu/marianmadrid2002')
raw = subprocess.check_output(['git', 'ls-files', '-z', 'src/pages/*.js'], cwd=root)
paths = [Path(item) for item in raw.decode('utf-8').split('\0') if item]
pattern = re.compile(r'^.+\.[A-Za-z0-9]{4,}\.(?:js|mjs)$', re.UNICODE)
invalid = []
for path in paths:
    if path.name == 'masterPage.js':
        continue
    if not pattern.match(path.name):
        invalid.append(str(path))
print(f'PAGES_JS={len(paths)}')
print(f'NON_CANONICAL={len(invalid)}')
for path in invalid:
    print(f'NON_CANONICAL\t{path}')
if invalid:
    raise SystemExit(1)
print('PASS\tTodas las paginas JS salvo masterPage.js usan nombre con identificador interno Wix')
