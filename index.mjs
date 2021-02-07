#!/usr/bin/env node
import fs from "fs"
import zlib from "zlib"
import path from "path"
import crypto from "crypto"
import { fileURLToPath } from "url"
import { promisify } from "util"

import blessed from "blessed"

import { zhuyinMap } from "./zhuyin-map.mjs"
import FileCache from "./file-cache.mjs"
import convertHanzi from "./api.mjs"


// polyfill some old commonJS stuff
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.join(__filename, "..")

const packageData = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json")))
const ONE_WEEK_IN_SECONDS = 60 * 60 * 24 * 7
const cacheDir = path.join(__dirname, "cache", packageData.version)
const fileCache = new FileCache(cacheDir)


function stringifyContent(textInfo, keyStack) {
  let rows = []
  let textIndex = 0
    // subtract 2 for the borders and 1 for the scrollbar
  let rowSpace = process.stdout.columns - 3
  let hanziRow = []
  let zhuyinRow = []
  let keyStackIndex = 0
  let cursorRow = 0
  while (textIndex < textInfo.length) {
    const { hanzi, zhuyin } = textInfo[textIndex]
    const spaceNeeded = Math.max(hanzi.width, zhuyin?.width || 0)
    if (hanzi.text === "\n") {
      textIndex++
    }
    if (spaceNeeded > rowSpace || hanzi.text === "\n") {
      rowSpace = process.stdout.columns - 3
      // this condition shouldn't be necessary, but there's a bug in Blessed causing newlines to
      // be ignored if the "{/}" tag occurs before the newline, i.e. "{/}\n" gets ignored
      if (hanziRow.length === 0) {
        rows.push("")
      } else {
        rows.push("{bold}" + hanziRow.join("") + "{/}")
        rows.push(zhuyinRow.join("") + "{/}")
      }
      hanziRow = []
      zhuyinRow = []
      continue
    }
    rowSpace -= spaceNeeded
    hanziRow.push(hanzi.text + " ".repeat(spaceNeeded - hanzi.width))
    if (zhuyin) {
      for (const zh of zhuyin.text) {
        if (keyStackIndex > keyStack.length) {
          zhuyinRow.push("{#888-fg}" + zh)
        } else if (keyStackIndex === keyStack.length) {
          zhuyinRow.push("{underline}" + zh + "{/}")
          cursorRow = rows.length + 1
          keyStackIndex++
        } else {
          zhuyinRow.push(`{${zh !== keyStack[keyStackIndex++] ? "red-bg" : "green-fg"}}${zh}{/}`)
        }
      }
      zhuyinRow.push(" ".repeat(spaceNeeded - zhuyin.width))
    } else {
      zhuyinRow.push(" ".repeat(spaceNeeded))
    }
    textIndex++
  }
  return { content: rows.join("\n"), cursorRow }
}


function computeTypableChars(textData) {
  return textData.reduce((total, char) => total + (char.zhuyin?.text?.length || 0), 0)
}


function computeGameDuration(startTime, endTime, pauseTimes) {
  let gameDurationSec = (endTime - startTime) / 1000
  // need to subtract the amount of time the game was paused for
  // the `pausedTimes` array contains timestamps when the game was paused and unpaused
  // so, the times at even indices are all pause start times and the odd indices are end times
  for (let i = 0; i < pauseTimes.length; i += 2) {
    const pauseStart = pauseTimes[i]
    const pauseEnd = pauseTimes[i + 1]
    gameDurationSec -= (pauseEnd - pauseStart) / 1000
  }
  return gameDurationSec
}


function expandPaths(paths, results) {
  for (const thisPath of paths) {
    const stat = fs.lstatSync(thisPath)
    if (stat.isDirectory()) {
      const contents = fs.readdirSync(thisPath).map(f => path.join(thisPath, f))
      expandPaths(contents, results)
    } else if (stat.isFile()) {
      results.push(thisPath)
    }
  }
  return results
}


function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}


function checkWinCondition(textInfo, keyStack) {
  const allTypableChars = textInfo.flatMap(item => item.zhuyin?.text?.split("") || [])
  return arrayShallowEquals(allTypableChars, keyStack)
}


function arrayShallowEquals(arr1, arr2) {
  if (arr1.length != arr2.length) {
    return false
  }
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) {
      return false
    }
  }
  return true
}


async function main(paths) {
  // if no paths provided, default to included examples
  if (paths.length === 0) {
    paths = [path.join(__dirname, "examples")]
  }
  // arguments are filepaths. we'll expand any dirs, then pick 1 file randomly
  const filePaths = expandPaths(paths, [])
  const hanzi = fs.readFileSync(pickRandom(filePaths), "utf-8")

  // generate a hash key from file contents
  const hash = crypto.createHash("sha1")
  hash.update(hanzi)
  const hexHash = hash.digest("hex")

  // if not in cache, download and set it in the cache. data is serialized with protobuf
  let textData = fileCache.get(hexHash)
  if (textData === null) {
    console.error("在下載注音...")
    textData = await convertHanzi(hanzi)
    const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(textData)))
    fileCache.set(hexHash, compressed)
  } else {
    textData = JSON.parse(zlib.gunzipSync(textData).toString("utf8"))
  }
  const totalTypableChars = computeTypableChars(textData)
  if (totalTypableChars === 0) {
    console.error("文件沒有漢字")
    process.exit(1)
  }

  // these are all the keys that the player pressed
  const keyStack = []

  // create the one and only screen we'll need
  const screen = blessed.screen({
    fullUnicode: true
  })
  screen.key(["C-c", "escape"], () => process.exit(0))

  const { content } = stringifyContent(textData, keyStack)
  const mainBox = blessed.box({
    parent: screen,
    content,
    height: "100%",
    scrollable: true,
    tags: true,
    border: {
      type: "line"
    },
    scrollbar: {
      bg: "gray",
    }
  })
  const pauseBox = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    height: "50%",
    width: "50%",
    content: "遊戲暫停了。按『\\』玩下去。",
    align: "center",
    valign: "middle",
    border: {
      type: "line"
    }
  })
  pauseBox.hide()

  screen.render()
  const startTime = Date.now()
  const pauseTimes = []
  let paused = false
  const keysToIgnore = new Set(["return", "enter", "left", "right", "down", "up"])
  screen.on("keypress", (ch, key) => {
    if (keysToIgnore.has(key.name)) {
      return
    }
    if (paused) {
      if (ch === "\\") {
        paused = false
        pauseTimes.push(Date.now())
        pauseBox.hide()
      }
    } else {
      if (key.name === "backspace") {
        keyStack.pop()
      } else if (ch === "\\") {
        paused = true
        pauseTimes.push(Date.now())
        pauseBox.show()
      } else {
        keyStack.push(ch in zhuyinMap ? zhuyinMap[ch] : ch)
      }
    }

    const { content, cursorRow } = stringifyContent(textData, keyStack)
    mainBox.setContent(content)
    mainBox.scrollTo(cursorRow + Math.floor((mainBox.height - 2) / 2))

    if (keyStack.length === totalTypableChars && checkWinCondition(textData, keyStack)) {
      const endTime = Date.now()
      const gameDurationSec = computeGameDuration(startTime, endTime, pauseTimes)
      const charPerMin = totalTypableChars / gameDurationSec * 60
      blessed.box({
        parent: screen,
        top: "center",
        left: "center",
        height: "50%",
        width: "50%",
        content: `你贏了！\n你${Math.round(gameDurationSec)}秒輸入${totalTypableChars}個漢字。\n每個分鐘${charPerMin.toFixed(1)}漢字。`,
        align: "center",
        valign: "middle",
        border: {
          type: "line"
        }
      })
      screen.key(["enter"], () => process.exit(0))
    }
    screen.render()
  })
}


main(process.argv.slice(2))
