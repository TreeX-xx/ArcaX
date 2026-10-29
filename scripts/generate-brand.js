// Raster and standalone assets are derived from the editable vector master, never hand-edited.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(require.resolve('sharp', { paths: [require.resolve('next/package.json')] }));
const mark = require('../src/brand/mark.json');

const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${mark.viewBox}"><path fill="#242424" d="${mark.path}"/></svg>\n`;
const appIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64"><rect x="2" y="2" width="60" height="60" rx="14" fill="#202020"/><path transform="translate(12 12) scale(1.25)" fill="#F0F0ED" d="${mark.path}"/></svg>\n`;

async function main() {
  const root = path.resolve(__dirname, '..');
  fs.writeFileSync(path.join(root, 'public/brand-mark.svg'), markSvg);
  fs.writeFileSync(path.join(root, 'public/app-icon.svg'), appIconSvg);
  fs.copyFileSync(path.join(root, 'public/app-icon.svg'), path.join(root, 'src/app/icon.svg'));
  const png = await sharp(Buffer.from(appIconSvg)).resize(1024, 1024).ensureAlpha().png().toBuffer();
  fs.writeFileSync(path.join(root, 'public/logo.png'), png);
  fs.writeFileSync(path.join(root, 'src-tauri/app-icon.png'), png);

  const installerDir = path.join(root, 'src-tauri/icons/installer');
  fs.mkdirSync(installerDir, { recursive: true });
  const markPng = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${mark.viewBox}"><path fill="#F0F0ED" d="${mark.path}"/></svg>`))
    .resize(512, 512)
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(installerDir, 'mark.png'), markPng);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
