const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const packageRoot = path.dirname(require.resolve('lunar-javascript/package.json'));
const destination = path.resolve(__dirname, '../app/src/main/assets/vendor');
fs.mkdirSync(destination, { recursive: true });
for (const filename of ['lunar.js', 'LICENSE']) {
  fs.copyFileSync(path.join(packageRoot, filename), path.join(destination, filename));
}
const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(destination, 'lunar.js'))).digest('hex');
console.log(`Bundled lunar-javascript ${require('lunar-javascript/package.json').version}: ${digest}`);
