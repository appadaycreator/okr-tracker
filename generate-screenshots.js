const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// アセットディレクトリの作成
const assetsDir = path.join(__dirname, 'assets');
if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir);
}

// デスクトップ用スクリーンショットの生成
async function generateDesktopScreenshot() {
    try {
        // 1920x1080のサイズでスクリーンショットを生成
        await sharp({
            create: {
                width: 1920,
                height: 1080,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            }
        })
        .composite([
            {
                input: {
                    text: {
                        text: 'パーソナルOKRトラッカー',
                        font: 'sans',
                        fontSize: 72,
                        rgba: true
                    }
                },
                gravity: 'center'
            }
        ])
        .png()
        .toFile(path.join(assetsDir, 'screenshot-desktop.png'));
        
        console.log('デスクトップ用スクリーンショットを生成しました');
    } catch (error) {
        console.error('デスクトップ用スクリーンショットの生成に失敗しました:', error);
    }
}

// モバイル用スクリーンショットの生成
async function generateMobileScreenshot() {
    try {
        // 390x844のサイズでスクリーンショットを生成
        await sharp({
            create: {
                width: 390,
                height: 844,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            }
        })
        .composite([
            {
                input: {
                    text: {
                        text: 'パーソナルOKRトラッカー',
                        font: 'sans',
                        fontSize: 36,
                        rgba: true
                    }
                },
                gravity: 'center'
            }
        ])
        .png()
        .toFile(path.join(assetsDir, 'screenshot-mobile.png'));
        
        console.log('モバイル用スクリーンショットを生成しました');
    } catch (error) {
        console.error('モバイル用スクリーンショットの生成に失敗しました:', error);
    }
}

// スクリーンショットの生成を実行
async function generateScreenshots() {
    await generateDesktopScreenshot();
    await generateMobileScreenshot();
}

generateScreenshots(); 