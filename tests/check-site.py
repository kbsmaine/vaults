"""Source and build checks; not a browser-rendering test."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import subprocess, re, json, xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
class Page(HTMLParser):
    def __init__(self):
        super().__init__();self.ids=[];self.refs=[];self.scripts=[];self.h1=0;self.main=0;self.images=[];self.labels=[];self.controls=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if 'id' in d:self.ids.append(d['id'])
        if tag=='main':self.main+=1
        if tag=='h1':self.h1+=1
        if tag=='script' and 'src' in d:self.scripts.append(d['src'])
        if tag=='img':self.images.append(d)
        if tag=='label' and 'for' in d:self.labels.append(d['for'])
        if tag in ('input','select','textarea') and d.get('type')!='hidden':self.controls.append(d)
        for a in ('href','src'):
            if d.get(a):self.refs.append(d[a])
pages={};errors=[]
for file in ROOT.glob('*.html'):
    p=Page();p.feed(file.read_text());pages[file.name]=p
    if p.main!=1:errors.append(f'{file.name}: expected one main')
    if p.h1!=(2 if file.name=='admin.html' else 1):errors.append(f'{file.name}: unexpected h1 count')
    if len(p.ids)!=len(set(p.ids)):errors.append(f'{file.name}: duplicate IDs')
    base=['site-config.js','components.js','app.js']
    if file.stem in ('account','portal','admin'):base+=['assets/vendor/supabase.js','portal-config.js','portal-api.js',file.stem+'.js']
    if p.scripts!=base:errors.append(f'{file.name}: wrong dependency order')
    for img in p.images:
        if 'alt' not in img:errors.append(f'{file.name}: image missing alt')
    for control in p.controls:
        if control.get('id') not in p.labels and not control.get('aria-label'):errors.append(f'{file.name}: unlabeled field {control.get("id")}')
for name,p in pages.items():
    for ref in p.refs:
        u=urlsplit(ref)
        if u.scheme or u.netloc:continue
        target=ROOT/(unquote(u.path) or name)
        if not target.exists():errors.append(f'{name}: missing {ref}')
        if u.fragment and target.suffix=='.html' and target.name in pages and u.fragment not in pages[target.name].ids:errors.append(f'{name}: missing anchor {ref}')
for file in list(ROOT.glob('*.js'))+list(ROOT.glob('*.cjs')):
    r=subprocess.run(['node','--check',str(file)],capture_output=True,text=True)
    if r.returncode:errors.append(f'{file.name}: {r.stderr}')
for file in ROOT.rglob('*.svg'):
    if 'dist' in file.parts:continue
    try:ET.parse(file)
    except ET.ParseError:errors.append(f'{file}: invalid SVG')
for file in ROOT.glob('*.css'):
    css=file.read_text()
    if css.count('{')!=css.count('}'):errors.append(f'{file.name}: unbalanced CSS')
    for ref in re.findall(r'url\([\"\']?([^\)\"\']+)',css):
        if not ref.startswith(('http','data:','#')) and not (file.parent/ref).exists():errors.append(f'{file.name}: missing CSS asset {ref}')
# Reject application-side password/project stores and dangerous dynamic sinks.
for name in ('account.js','portal.js','admin.js','portal-api.js'):
    s=(ROOT/name).read_text()
    for bad in ('innerHTML','document.write','localStorage.setItem','sessionStorage.setItem','eval('):
        if bad in s:errors.append(f'{name}: unexpected {bad}')
subprocess.run(['node',str(ROOT/'build.cjs')],check=True,capture_output=True)
dist=ROOT/'dist'
for item in ('backend','tests','PORTAL_SETUP.md','README.md','build.cjs'):
    if (dist/item).exists():errors.append(f'Build includes source-only {item}')
for file in ROOT.glob('*.html'):
    if not (dist/file.name).exists():errors.append(f'Build missing {file.name}')
for item in ('_headers','assets/vendor/supabase.js','portal-config.js'):
    if not (dist/item).exists():errors.append(f'Build missing {item}')
print(json.dumps({'html_pages':len(pages),'javascript_files':len(list(ROOT.glob('*.js'))),'errors':errors},indent=2))
raise SystemExit(bool(errors))
