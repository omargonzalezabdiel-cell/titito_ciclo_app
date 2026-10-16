const fs = require("fs");
const path = require("path");

const root = __dirname;
const output = path.join(root, "public");
const assets = ["index.html", "style.css", "script.js"];

fs.mkdirSync(output, { recursive: true });
for (const asset of assets) {
    fs.copyFileSync(path.join(root, asset), path.join(output, asset));
}

console.log(`Static output created in ${path.relative(root, output)}/`);
