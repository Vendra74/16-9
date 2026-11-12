// Confere as traduções: todo texto usado em t('…') ou plural(n, '…', '…') precisa
// existir em cada arquivo de src/locales, com os mesmos {valores}, e nenhum arquivo
// pode guardar texto que as telas não usam mais. Rodar: npm run i18n
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..', 'src');
const localesDir = path.join(root, 'locales');

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return file === localesDir ? [] : sources(file);
    return /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

const problems = [];
const keys = new Set();
for (const file of sources(root)) {
  if (file.endsWith(path.join('lib', 'i18n.ts'))) continue;
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, kind);
  (function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      const texts = name === 't' ? [node.arguments[0]] : name === 'plural' ? [node.arguments[1], node.arguments[2]] : [];
      for (const text of texts) {
        if (text && ts.isStringLiteral(text)) keys.add(text.text);
        else {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart());
          problems.push(`${path.relative(root, file)}:${line + 1}: o texto de ${name}() precisa estar escrito direto na chamada`);
        }
      }
    }
    ts.forEachChild(node, visit);
  })(source);
}

/** Lê o objeto exportado de um arquivo de src/locales. */
function dictionary(file) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const module = { exports: {} };
  new Function('module', 'exports', js.outputText)(module, module.exports);
  return Object.values(module.exports)[0];
}

const values = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join(' ');
const languages = fs.readdirSync(localesDir).filter((name) => name.endsWith('.ts'));
for (const name of languages) {
  const translations = dictionary(path.join(localesDir, name));
  for (const key of keys) {
    if (!(key in translations)) problems.push(`${name}: falta a tradução de "${key}"`);
    else if (!translations[key].trim()) problems.push(`${name}: tradução vazia de "${key}"`);
    else if (values(key) !== values(translations[key])) problems.push(`${name}: os {valores} não batem em "${key}"`);
  }
  for (const key of Object.keys(translations)) {
    if (!keys.has(key)) problems.push(`${name}: "${key}" não é mais usado nas telas`);
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`i18n ok: ${keys.size} textos em ${languages.length} idiomas além do português`);
