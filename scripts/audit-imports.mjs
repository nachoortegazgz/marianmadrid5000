import fs from 'fs';
import path from 'path';

const files = [];
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) {
      if (f === 'mocks') continue;
      walk(p);
    } else if (/\.js$/.test(f)) files.push(p);
  }
}
walk('src');
walk('tests');

function exportsOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  const names = new Set();
  let m;
  const re = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = re.exec(src))) names.add(m[1]);
  const re2 = /export\s*\{([^}]+)\}/g;
  while ((m = re2.exec(src))) {
    for (const part of m[1].split(',')) {
      const seg = part.trim().split(/\s+as\s+/).pop().trim();
      if (seg) names.add(seg);
    }
  }
  if (/export\s+default/.test(src)) names.add('default');
  return names;
}

const cache = {};
let issues = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[2];
    if (!spec.startsWith('backend/') && !spec.startsWith('public/') && !spec.startsWith('.')) continue;
    let target;
    if (spec.startsWith('.')) {
      target = path.resolve(path.dirname(f), spec);
    } else {
      target = path.join('src', spec + '.js');
    }
    if (!fs.existsSync(target)) target = target.replace(/\.js$/, '/index.js');
    if (!fs.existsSync(target)) {
      console.log('MISSING MODULE:', f, '->', spec);
      issues++;
      continue;
    }
    if (!cache[target]) cache[target] = exportsOf(target);
    for (const raw of m[1].split(',')) {
      const nm = raw.trim().split(/\s+as\s+/)[0].trim();
      if (!nm) continue;
      if (!cache[target].has(nm)) {
        console.log('MISSING EXPORT:', f, 'imports', nm, 'from', spec);
        issues++;
      }
    }
  }
}
console.log('Audit done. Issues:', issues);
