// Embeds the card images into src/pass/assets.js so the function needs no file access.
// Run again after replacing images in public/assets:  npm run embed
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '../public/assets');
const files = fs.readdirSync(dir).filter(f => /^(icon|logo|strip|thumbnail)(@[23]x)?\.png$/.test(f));
const out = 'module.exports = {\n' + files.map(f => `  '${f}': '${fs.readFileSync(path.join(dir, f)).toString('base64')}',`).join('\n') + '\n};\n';
fs.writeFileSync(path.join(__dirname, '../src/pass/assets.js'), out);
console.log('embedded', files.join(', '));
