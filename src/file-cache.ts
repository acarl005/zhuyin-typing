import * as fs from "fs"
import { join as pathJoin }from "path"

export default class FileCache {
  cacheDir: string
  keys: Set<string>

  constructor(cacheDir: string) {
    fs.mkdirSync(cacheDir, { recursive: true })
    this.cacheDir = cacheDir
    const keys = fs.readdirSync(cacheDir)
    this.keys = new Set(keys)
  }

  get(key: string) {
    if (this.keys.has(key)) {
      return fs.readFileSync(pathJoin(this.cacheDir, key))
    }
    return null
  }

  set(key: string, value: Buffer) {
    fs.writeFileSync(pathJoin(this.cacheDir, key), value)
    const didOverwrite = this.keys.has(key)
    this.keys.add(key)
    return didOverwrite
  }

  remove(key: string) {
    const didRemove = this.keys.has(key)
    this.keys.delete(key)
    if (didRemove) {
      fs.unlinkSync(pathJoin(this.cacheDir, key))
    }
    return didRemove
  }
}

