const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'icon-72x72.png', size: 72 },
  { name: 'icon-96x96.png', size: 96 },
  { name: 'icon-128x128.png', size: 128 },
  { name: 'icon-144x144.png', size: 144 },
  { name: 'icon-152x152.png', size: 152 },
  { name: 'icon-192x192.png', size: 192 },
  { name: 'icon-384x384.png', size: 384 },
  { name: 'icon-512x512.png', size: 512 }
];

const assetsDir = path.join(__dirname, 'assets');

// assetsディレクトリが存在しない場合は作成
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir);
}

// 各サイズのアイコンを生成
async function generateIcons() {
  try {
    for (const { name, size } of sizes) {
      await sharp('icon.svg')
        .resize(size, size)
        .toFile(path.join(assetsDir, name));
      console.log(`Generated ${name}`);
    }

    // favicon.icoの生成（16x16と32x32を結合）
    const favicon16 = await sharp('icon.svg').resize(16, 16).toBuffer();
    const favicon32 = await sharp('icon.svg').resize(32, 32).toBuffer();
    
    await sharp(favicon32)
      .joinChannel(favicon16)
      .toFile(path.join(assetsDir, 'favicon.ico'));
    console.log('Generated favicon.ico');

    // OGP画像の生成
    await sharp('icon.svg')
      .resize(1200, 630)
      .toFile(path.join(assetsDir, 'ogp-image.png'));
    console.log('Generated ogp-image.png');

  } catch (error) {
    console.error('Error generating icons:', error);
  }
}

generateIcons(); 