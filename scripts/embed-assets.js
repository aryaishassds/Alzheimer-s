// Embeds the card images into src/pass/assets.js so the function needs no file access.
// Run again after replacing images in public/assets:  npm run embed
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '../public/assets');
const files = fs.readdirSync(dir).filter(f => /^(icon|logo|strip|thumbnail)(@[23]x)?\.png$/.test(f));
const out = 'module.exports = {\n' + files.map(f => `  '${f}': '${fs.readFileSync(path.join(dir, f)).toString('base64')}',`).join('\n') + '\n};\n';
fs.writeFileSync(path.join(__dirname, '../src/pass/assets.js'), out);
console.log('embedded', files.join(', '));

// Card fonts for the strip image (Noto Sans Arabic, includes Latin)
const fdir = path.join(__dirname, '../fonts');
if (fs.existsSync(fdir)) {
  const b64 = f => fs.readFileSync(path.join(fdir, f)).toString('base64');
  fs.writeFileSync(path.join(__dirname, '../src/pass/fonts.js'),
    `module.exports = { regular: '${b64('NotoSansArabic_400Regular.ttf')}', bold: '${b64('NotoSansArabic_700Bold.ttf')}' };\n`);
  console.log('embedded fonts');
}
