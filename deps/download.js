const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');

const BASE_URI = `https://build-artifacts.signal.org/desktop`;
const HASH = 'ef53ea45ed92b928ecfd33c552d8d405263e86e63dec38e1ec63e1b0193b630b';
const SQLCIPHER_VERSION = '4.5.5-fts5-fix';
const OPENSSL_VERSION = '3.0.7';
const TOKENIZER_VERSION = '0.2.1';
const TAG = [SQLCIPHER_VERSION, OPENSSL_VERSION, TOKENIZER_VERSION].join('--');
const URL = `${BASE_URI}/sqlcipher-${TAG}-${HASH}.tar.gz`;

const tmpFile = path.join(__dirname, 'unverified.tmp');
const finalFile = path.join(__dirname, 'sqlcipher.tar.gz');

async function main() {
  if (fs.statSync(finalFile, { throwIfNoEntry: false })) {
    const hash = crypto.createHash('sha256');
    const existingHash = await pipeline(
      fs.createReadStream(finalFile),
      hash,
    );
    if (hash.digest('hex') === HASH) {
      console.log('local build artifact is up-to-date');
      return;
    }

    console.log('local build artifact is outdated');
  }
  download();
}

function download() {
  console.log(`downloading ${URL}`);

  let options = {};
  if (process.env.HTTPS_PROXY != undefined) {
    options.agent = new HttpsProxyAgent(process.env.HTTPS_PROXY);
  }

  https.get(URL, options, async (res) => {
    const out = fs.createWriteStream(tmpFile);

    const hash = crypto.createHash('sha256');

    const t = new Transform({
      transform(chunk, encoding, callback) {
        hash.write(chunk, encoding);
        callback(null, chunk);
      }
    });

    await pipeline(res, t, out);

    const actualDigest = hash.digest('hex');
    if (actualDigest !== HASH) {
      fs.unlinkSync(tmpFile);
      throw new Error(`Digest mismatch. Expected ${HASH} got ${actualDigest}`);
    }

    fs.renameSync(tmpFile, finalFile);
  })
}

main();
