"""Package only public website assets; never include drafts, tests or local config."""
from pathlib import Path
import sys
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent.parent
output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / 'dist/openagix-website.zip'
files = [root / name for name in ('index.html', 'styles.css', 'catalog.js', 'app.js', 'robots.txt', 'sitemap.xml', 'README.md')]
files.extend(sorted(path for path in (root / 'assets').rglob('*') if path.is_file()))
for path in files:
    if not path.is_file():
        raise SystemExit(f'Missing required website file: {path.name}')
output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, path.relative_to(root))
print(f'Packaged {len(files)} public files: {output}')
