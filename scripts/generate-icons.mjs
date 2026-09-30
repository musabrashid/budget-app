import sharp from "sharp";
import { mkdir } from "node:fs/promises";
await mkdir("public/icons", { recursive: true });
for (const [name, size] of [
  ["icon-192", 192],
  ["icon-512", 512],
  ["maskable-512", 512],
  ["apple-touch-icon", 180],
]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="${name.startsWith("maskable") ? 0 : 105}" fill="#285d4d"/><g fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"><rect x="134" y="164" width="244" height="190" rx="24"/><path d="M152 164v-20c0-12 10-22 22-22h166M308 224h70v70h-70c-20 0-20-70 0-70Z"/><path d="M329 259h1"/></g><circle cx="378" cy="385" r="13" fill="#a9cfbd"/></svg>`;
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`public/icons/${name}.png`);
}
