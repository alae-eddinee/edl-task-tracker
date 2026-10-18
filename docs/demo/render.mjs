// Renders demo.html frame-by-frame into an MP4 (deterministic, no dropped frames).
//
//   python docs/demo/gen_audio.py              -> docs/demo/demo-audio.wav (soundtrack, optional)
//   node docs/demo/render.mjs                 -> docs/demo/demo.mp4
//   node docs/demo/render.mjs --stills 3,12   -> PNG stills for checking
//
// Needs Playwright (npm i -g playwright) and ffmpeg (FFMPEG env var, or on PATH).
// Uses the installed Microsoft Edge, so no browser download is required.
import { createRequire } from 'module';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const stillsArg = args.includes('--stills') ? args[args.indexOf('--stills') + 1] : null;
const FPS = Number(process.env.FPS || 30);
const ffmpeg = process.env.FFMPEG || 'ffmpeg';

const browser = await playwright.chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(here, 'demo.html')).href + '?t=0');
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);

if (stillsArg) {
  for (const t of stillsArg.split(',').map(Number)) {
    await page.evaluate((t) => window.render(t), t);
    const out = path.join(process.env.OUT_DIR || here, `still-${t}.png`);
    await page.screenshot({ path: out });
    console.log(out);
  }
  await browser.close();
  process.exit(0);
}

const duration = await page.evaluate(() => window.DURATION);
const frames = Math.round(duration * FPS);
const out = path.join(here, process.env.OUT_NAME || 'demo.mp4');
// Mux the generated soundtrack in when it exists
const audio = path.join(here, 'demo-audio.wav');
const audioArgs = fs.existsSync(audio) ? ['-i', audio] : [];
const audioOut = audioArgs.length ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : [];
const ff = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', ...audioArgs,
  '-vf', 'scale=in_range=pc:out_range=tv', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', ...audioOut, '-movflags', '+faststart', out],
  { stdio: ['pipe', 'ignore', 'inherit'] });

const started = Date.now();
for (let f = 0; f < frames; f++) {
  await page.evaluate((t) => window.render(t), f / FPS);
  const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 60 === 0) console.log(`frame ${f}/${frames}  (${((Date.now() - started) / 1000).toFixed(0)}s)`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log('wrote', out);
