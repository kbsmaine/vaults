// Cloudflare Pages: node build.cjs; output directory: dist
// Ship website files only. Keep database scripts, tests, and setup notes in the repository.
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const out = path.join(root, 'dist');
fs.mkdirSync(out, {recursive:true});
for (const name of fs.readdirSync(root)) {
  if (/\.(html|css|js)$/.test(name) || name === '_headers') fs.copyFileSync(path.join(root,name),path.join(out,name));
}
fs.cpSync(path.join(root,'assets'),path.join(out,'assets'),{recursive:true});
console.log('Website prepared in dist/');
