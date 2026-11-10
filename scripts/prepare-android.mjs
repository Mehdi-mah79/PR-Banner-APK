import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execSync } from "node:child_process";

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

// Create a valid uncompressed/deflated PNG buffer of width x height with black background & gold border/center
function createBlackGoldPng(width, height) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, "ascii");
    const crcBuf = Buffer.concat([t, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcBuf), 0);
    return Buffer.concat([len, t, data, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth 8
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(height * (1 + width * 4));
  const cx = width / 2;
  const cy = height / 2;
  const rOuter = Math.min(width, height) * 0.36;
  const rInner = Math.min(width, height) * 0.24;

  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < width; x++) {
      const p = rowStart + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= rOuter && dist >= rInner) {
        // Gold ring (#D4AF37)
        raw[p] = 212;
        raw[p + 1] = 175;
        raw[p + 2] = 55;
        raw[p + 3] = 255;
      } else if (dist < rInner * 0.5) {
        // Gold center dot
        raw[p] = 230;
        raw[p + 1] = 195;
        raw[p + 2] = 92;
        raw[p + 3] = 255;
      } else {
        // Dark background (#0B0B0D)
        raw[p] = 11;
        raw[p + 1] = 11;
        raw[p + 2] = 13;
        raw[p + 3] = 255;
      }
    }
  }

  const idat = zlib.deflateSync(raw);
  const iend = Buffer.alloc(0);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", iend)]);
}

console.log("=== 1. Verify Web Build Output (dist/index.html) ===");
if (!fs.existsSync("dist/index.html")) {
  throw new Error("dist/index.html not found! Run npm run build first.");
}

console.log("=== 2. Add or Sync Capacitor Android Platform ===");
if (!fs.existsSync("android")) {
  run("npx cap add android");
}
run("npx cap sync android");

console.log("=== 3. Configure AndroidManifest.xml Permissions & RTL Support ===");
const manifestPath = path.join("android", "app", "src", "main", "AndroidManifest.xml");
if (fs.existsSync(manifestPath)) {
  let xml = fs.readFileSync(manifestPath, "utf8");
  if (!xml.includes("android:supportsRtl")) {
    xml = xml.replace("<application", '<application android:supportsRtl="true"');
  }
  const perms = [
    '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />',
    '<uses-permission android:name="android.permission.USE_EXACT_ALARM" />',
    '<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />',
    '<uses-permission android:name="android.permission.VIBRATE" />',
  ];
  for (const perm of perms) {
    const permName = perm.match(/android:name="([^"]+)"/)[1];
    if (!xml.includes(permName)) {
      xml = xml.replace("</manifest>", `    ${perm}
</manifest>`);
    }
  }
  fs.writeFileSync(manifestPath, xml, "utf8");
}

console.log("=== 4. Configure strings.xml with Persian App Title ===");
const stringsPath = path.join("android", "app", "src", "main", "res", "values", "strings.xml");
if (fs.existsSync(stringsPath)) {
  const stringsXml = `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">مدیریت بنرهای روابط عمومی</string>
    <string name="title_activity_main">مدیریت بنرهای روابط عمومی</string>
    <string name="package_name">ir.prbanner.manager</string>
    <string name="custom_url_scheme">ir.prbanner.manager</string>
</resources>
`;
  fs.writeFileSync(stringsPath, stringsXml, "utf8");
}

console.log("=== 5. Generate Black & Gold Icons and Splash Resources ===");
const resDir = path.join("android", "app", "src", "main", "res");
const iconPng = createBlackGoldPng(192, 192);
const splashPng = createBlackGoldPng(480, 480);

const mipmapDirs = ["mipmap-mdpi", "mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"];
for (const dir of mipmapDirs) {
  const full = path.join(resDir, dir);
  fs.mkdirSync(full, { recursive: true });
  fs.writeFileSync(path.join(full, "ic_launcher.png"), iconPng);
  fs.writeFileSync(path.join(full, "ic_launcher_round.png"), iconPng);
  fs.writeFileSync(path.join(full, "ic_launcher_foreground.png"), iconPng);
}

const drawableDirs = [
  "drawable",
  "drawable-port-mdpi",
  "drawable-port-hdpi",
  "drawable-port-xhdpi",
  "drawable-port-xxhdpi",
  "drawable-port-xxxhdpi",
  "drawable-land-mdpi",
  "drawable-land-hdpi",
  "drawable-land-xhdpi",
  "drawable-land-xxhdpi",
  "drawable-land-xxxhdpi",
];
for (const dir of drawableDirs) {
  const full = path.join(resDir, dir);
  fs.mkdirSync(full, { recursive: true });
  fs.writeFileSync(path.join(full, "splash.png"), splashPng);
}
fs.writeFileSync(path.join(resDir, "drawable", "ic_stat_icon_config_sample.png"), iconPng);

console.log("=== 6. Ensure gradlew Executable Permission ===");
const gradlewPath = path.join("android", "gradlew");
if (fs.existsSync(gradlewPath)) {
  try {
    fs.chmodSync(gradlewPath, 0o755);
  } catch {
    /* ignore on Windows */
  }
}

console.log("Android preparation and resource verification completed successfully!");
