#!/usr/bin/env node
import fs from "fs"
import path from "path"
import crypto from "crypto"
import { fileURLToPath } from "url"

import fetch from "node-fetch"
import parser from "node-html-parser"
import chalk from "chalk"
import stringWidth from "string-width"
import blessed from "blessed"
import cache from "node-file-cache"
import _ from "lodash"

import ZHUYIN_MAP from "./zhuyin-map.mjs"


// polyfill some old commonJS stuff
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.join(__filename, "..")

const ONE_WEEK_IN_SECONDS = 60 * 60 * 24 * 7
const fileCache = cache.create({
  file: path.join(__dirname, "cache", "cache.json"),
  life: ONE_WEEK_IN_SECONDS
})


function stringifyContent(textInfo, keyStack) {
  let rows = []
  let textIndex = 0
    // subtract 2 for the borders
  let rowSpace = process.stdout.columns - 2
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
      rowSpace = process.stdout.columns - 2
      rows.push("{bold}" + hanziRow.join("") + "{/}")
      rows.push(zhuyinRow.join("") + "{/}")
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


async function convertHanzi(hanzi) {
  const resp = await fetch("https://www.ezlang.net/cmn/tool_data.php", {
    "credentials": "omit",
    "headers": {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:83.0) Gecko/20100101 Firefox/83.0",
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.5",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Pragma": "no-cache",
      "Cache-Control": "no-cache"
    },
    "referrer": "https://www.ezlang.net/en/tool/bopomofo",
    "body": `txt=${encodeURIComponent(hanzi)}&sn=bopomofo`,
    "method": "POST",
    "mode": "cors"
  });
  const json = await resp.json()
  // this endpoint actually returns HTML
  const html = json[1]
  return html
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


function parseZhuyinResult(html) {
  const parsed = parser.parse(html)

  const structured = []
  let totalTypableChars = 0
  for (const line of parsed.childNodes) {
    for (const child of line.childNodes) {
      const [converted, original] = child.childNodes
      const item = {
        hanzi: {
          text: original.rawText,
          width: stringWidth(original.rawText)
        }
      }
      if (converted.childNodes.length) {
        const zhuyinText = converted.childNodes[0].rawText
        totalTypableChars += zhuyinText.length
        item.zhuyin = {
          text: zhuyinText,
          width: stringWidth(zhuyinText)
        }
      }
      structured.push(item)
    }
    structured.push({
      hanzi: {
        text: "\n",
        width: 0
      }
    })
  }
  return [structured, totalTypableChars]
}


function checkWinCondition(textInfo, keyStack) {
  const allTypableChars = textInfo.flatMap(item => item.zhuyin?.text?.split("") || [])
  return _.isEqual(allTypableChars, keyStack)
}


async function main(paths) {
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

  // if not in cache, download and set it in the cache
  let html = fileCache.get(hexHash)
  if (html === null) {
    console.error("在下載注音...")
    html = await convertHanzi(hanzi)
    fileCache.set(hexHash, html)
  }
  const [structured, totalTypableChars] = parseZhuyinResult(html)
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
  screen.key(["C-c"], () => process.exit(0))

  const { content } = stringifyContent(structured, keyStack)
  const box = blessed.box({
    parent: screen,
    // give is the code and highlight the first character green!
    //content: chalk.bgGreen(text[0]) + text.slice(1),
    content,
    height: "100%",
    scrollable: true,
    tags: true,
    border: {
      type: "line"
    }
  })

  screen.render()
  screen.on("keypress", (ch, key) => {
    // on mac, pressing enter triggers TWO keypresses, one called 'enter' and one called 'return'.
    if (key.name === "return" || key.ctrl || key.name === "enter") {
      return
    }
    if (key.name === "backspace") {
      keyStack.pop()
    } else {
      keyStack.push(ch in ZHUYIN_MAP ? ZHUYIN_MAP[ch] : ch)
    }

    const { content, cursorRow } = stringifyContent(structured, keyStack)
    box.setContent(content)
    box.scrollTo(cursorRow + Math.floor((box.height - 2) / 2))

    if (keyStack.length === totalTypableChars && checkWinCondition(structured, keyStack)) {
      blessed.box({
        parent: screen,
        top: "center",
        left: "center",
        height: "50%",
        width: "50%",
        content: "你贏了！".repeat(200),
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
