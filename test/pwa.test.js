const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

async function read(relativePath, encoding = "utf8") {
  return readFile(path.join(root, relativePath), encoding);
}

function pngDimensions(buffer) {
  assert.deepEqual(
    [...buffer.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    "icon must be a PNG"
  );
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

test("manifest metadata and icon files are valid", async () => {
  const manifest = JSON.parse(await read("manifest.json"));

  assert.equal(manifest.name, "JamBeacon");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.theme_color, "#d9ff43");

  for (const size of [192, 512]) {
    const icon = manifest.icons.find(entry => entry.sizes === `${size}x${size}`);
    assert.ok(icon, `manifest must declare a ${size}x${size} icon`);
    assert.equal(icon.type, "image/png");
    assert.deepEqual(pngDimensions(await read(icon.src.replace(/^\.\//, ""), null)), {
      width: size,
      height: size
    });
  }
});

test("page links the manifest and registers the service worker", async () => {
  const html = await read("index.html");

  assert.match(html, /rel="manifest" href="\.\/manifest\.json"/);
  assert.match(html, /navigator\.serviceWorker\.register\("\.\/service-worker\.js"\)/);
});

test("service worker precaches every local PWA shell asset", async () => {
  const worker = await read("service-worker.js");
  const requiredAssets = [
    "./index.html",
    "./index.js",
    "./manifest.json",
    "./icon-192.png",
    "./icon-512.png"
  ];

  for (const asset of requiredAssets) {
    assert.match(worker, new RegExp(`"${asset.replaceAll(".", "\\.")}"`));
    await read(asset.slice(2), null);
  }
});
