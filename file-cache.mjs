import fs from "fs"
import path from "path"

export default class FileCache {
  constructor(cacheDir) {
    fs.mkdirSync(cacheDir, { recursive: true })
    this.cacheDir = cacheDir
    const keys = fs.readdirSync(cacheDir)
    this.keys = new Set(keys)
  }

  get(key) {
    if (this.keys.has(key)) {
      return fs.readFileSync(path.join(this.cacheDir, key))
    }
    return null
  }

  set(key, value) {
    fs.writeFileSync(path.join(this.cacheDir, key), value)
    const didOverwrite = this.keys.has(key)
    this.keys.add(key)
    return didOverwrite
  }

  remove(key) {
    const didRemove = this.keys.has(key)
    this.keys.delete(key)
    if (didRemove) {
      fs.unlinkSync(path.join(this.cacheDir, key))
    }
    return didRemove
  }
}

