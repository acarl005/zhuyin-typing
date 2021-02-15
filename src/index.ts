#!/usr/bin/env node
import * as fs from "fs"
import * as zlib from "zlib"
import { join as pathJoin } from "path"
import { createHash } from "crypto"
import { fileURLToPath } from "url"

import FileCache from "./file-cache.js"
import convertHanzi from "./api.js"
import Game, { Manuscript } from "./game.js"
import { pickRandom } from "./utils.js"


// polyfill some old commonJS stuff
const __filename = fileURLToPath(import.meta.url)
const __dirname = pathJoin(__filename, "..")

const packageData = JSON.parse(fs.readFileSync(pathJoin(__dirname, "..", "package.json"), "utf8"))
const cacheDir = pathJoin(__dirname, "..", "cache", packageData.version)
const fileCache = new FileCache(cacheDir)


// recursively expand all dirs to their file names
function expandPaths(paths: Array<string>, results: Array<string>) {
  for (const thisPath of paths) {
    const stat = fs.lstatSync(thisPath)
    if (stat.isDirectory()) {
      const contents = fs.readdirSync(thisPath).map(f => pathJoin(thisPath, f))
      expandPaths(contents, results)
    } else if (stat.isFile()) {
      results.push(thisPath)
    }
  }
  return results
}


async function main(paths: Array<string>) {
  // if no paths provided, default to included examples
  if (paths.length === 0) {
    paths = [pathJoin(__dirname, "..", "examples")]
  }
  // arguments are filepaths. we'll expand any dirs, then pick 1 file randomly
  const filePaths = expandPaths(paths, [])
  const hanzi = fs.readFileSync(pickRandom(filePaths), "utf-8")

  // generate a hash as a cache key from the file contents
  const hash = createHash("sha1")
  hash.update(hanzi)
  const hexHash = hash.digest("hex")

  // if not in cache, download and set it in the cache. data is serialized and compressed
  const rawManuscript = fileCache.get(hexHash)
  let manuscript: Manuscript
  if (rawManuscript === null) {
    console.error("在下載注音...")
    manuscript = await convertHanzi(hanzi)
    // g-zipping saves a ton of disk space while not adding any perceptible amount of delay
    const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(manuscript)))
    fileCache.set(hexHash, compressed)
  } else {
    manuscript = JSON.parse(zlib.gunzipSync(rawManuscript).toString("utf8"))
  }
  const game = new Game(manuscript)
  game.start()
}


main(process.argv.slice(2))
