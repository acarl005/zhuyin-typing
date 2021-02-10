import * as fs from "fs";
import { join as pathJoin } from "path";
export default class FileCache {
    constructor(cacheDir) {
        fs.mkdirSync(cacheDir, { recursive: true });
        this.cacheDir = cacheDir;
        const keys = fs.readdirSync(cacheDir);
        this.keys = new Set(keys);
    }
    get(key) {
        if (this.keys.has(key)) {
            return fs.readFileSync(pathJoin(this.cacheDir, key));
        }
        return null;
    }
    set(key, value) {
        fs.writeFileSync(pathJoin(this.cacheDir, key), value);
        const didOverwrite = this.keys.has(key);
        this.keys.add(key);
        return didOverwrite;
    }
    remove(key) {
        const didRemove = this.keys.has(key);
        this.keys.delete(key);
        if (didRemove) {
            fs.unlinkSync(pathJoin(this.cacheDir, key));
        }
        return didRemove;
    }
}
