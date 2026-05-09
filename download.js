import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';

const dir = path.join(process.env.LOCALAPPDATA, 'hardhat-nodejs', 'compilers', 'windows-amd64');
fs.mkdirSync(dir, { recursive: true });

async function download(url, dest) {
  console.log('Downloading', url, 'to', dest);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download: ${res.statusText}`);
  const fileStream = fs.createWriteStream(dest);
  await finished(Readable.fromWeb(res.body).pipe(fileStream));
  console.log('Downloaded', dest);
}

async function run() {
  await download(
    'https://binaries.soliditylang.org/windows-amd64/list.json',
    path.join(dir, 'list.json')
  );
  await download(
    'https://binaries.soliditylang.org/windows-amd64/solc-windows-amd64-v0.8.20+commit.a1b79de6.exe',
    path.join(dir, 'solc-windows-amd64-v0.8.20+commit.a1b79de6.exe')
  );
}

run().catch(console.error);