// @ts-ignore
import blessed from "blessed"
import { Widgets } from "blessed"

import { zhuyinMap } from "./zhuyin-map.js"
import { arrayShallowEquals } from "./utils.js"


export type TextData = {
  text: string;
  width: number;
}

export type CharData = {
  hanzi: TextData;
  zhuyin?: TextData;
};

export type Manuscript = Array<CharData>

export default class Game {
  manuscript: Manuscript
  totalTypableChars: number
  keyStack: Array<string>
  startTime: number
  pauseTimes: Array<number>
  paused: boolean
  screen!: Widgets.Screen
  mainBox!: Widgets.BoxElement
  pauseBox!: Widgets.BoxElement
  winBox!: Widgets.BoxElement

  // these keys have no effect on the game, so ignore them
  static keysToIgnore = new Set(["return", "enter", "left", "right", "down", "up"])

  constructor(manuscript: Manuscript) {
    this.manuscript = manuscript
    this.totalTypableChars = Game.computeTypableChars(manuscript)
    if (this.totalTypableChars === 0) {
      console.error("文件沒有漢字")
      process.exit(1)
    }
    // these are all the keys that the player pressed
    this.keyStack = []
    this.createNodes()
    this.startTime = Date.now()
    this.pauseTimes = []
    this.paused = false
  }

  static computeTypableChars(manuscript: Manuscript) {
    return manuscript.reduce((total, char) => total + (char.zhuyin?.text?.length || 0), 0)
  }

  static computeGameDuration(startTime: number, endTime: number, pauseTimes: Array<number>) {
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

  static checkWinCondition(manuscript: Manuscript, keyStack: Array<string>) {
    const allTypableChars = manuscript.flatMap(item => item.zhuyin?.text?.split("") || [])
    return arrayShallowEquals(allTypableChars, keyStack)
  }

  start() {
    this.registerEvents()
    this.render()
  }

  createNodes() {
    // create the one and only screen we'll need
    this.screen = blessed.screen({
      fullUnicode: true
    })
    // displays the text to be typed
    this.mainBox = blessed.box({
      parent: this.screen,
      height: "100%",
      scrollable: true,
      tags: true,
      border: {
        type: "line"
      },
      scrollbar: {
        style: {
          bg: "gray",
        }
      }
    })
    // only show this while paused
    this.pauseBox = blessed.box({
      parent: this.screen,
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
    this.pauseBox.hide()
    // show this when the game is won
    this.winBox = blessed.box({
      parent: this.screen,
      top: "center",
      left: "center",
      height: "50%",
      width: "50%",
      align: "center",
      valign: "middle",
      border: {
        type: "line"
      }
    })
    this.winBox.hide()
  }

  unpause() {
    this.paused = false
    this.pauseTimes.push(Date.now())
    this.pauseBox.hide()
  }

  pause() {
    this.paused = true
    this.pauseTimes.push(Date.now())
    this.pauseBox.show()
  }

  onKeyPress(ch: string, key: Widgets.Events.IKeyEventArg) {
    if (Game.keysToIgnore.has(key.name)) {
      return
    }
    if (this.paused) {
      // only the "unpause" button, a backslash, can unpause the game
      if (ch === "\\") {
        this.unpause()
      }
    } else {
      if (key.name === "backspace") {
        this.keyStack.pop()
      } else if (ch === "\\") {
        this.pause()
      } else {
        this.keyStack.push(ch in zhuyinMap ? zhuyinMap[ch] : ch)
      }
    }

    if (this.keyStack.length === this.totalTypableChars && Game.checkWinCondition(this.manuscript, this.keyStack)) {
      this.winGame()
    }
    this.render()
  }

  registerEvents() {
    this.screen.key(["C-c", "escape"], () => process.exit(0))
    this.screen.on("keypress", this.onKeyPress.bind(this))
  }

  winGame() {
    const endTime = Date.now()
    const gameDurationSec = Game.computeGameDuration(this.startTime, endTime, this.pauseTimes)
    const charPerMin = this.totalTypableChars / gameDurationSec * 60
    const winMessage = `
      你贏了！
      你${Math.round(gameDurationSec)}秒輸入${this.totalTypableChars}個漢字。
      每個分鐘${charPerMin.toFixed(1)}漢字。
    `
    this.winBox.setContent(winMessage)
    this.winBox.show()
    this.screen.key(["enter"], () => process.exit(0))
  }

  render() {
    const { content, cursorRow } = this.stringifyContent()
    this.mainBox.setContent(content)
    // keep the scroll position up-to-date as the cursor descends down the screen.
    this.mainBox.scrollTo(cursorRow + Math.floor((+this.mainBox.height - 2) / 2))
    this.screen.render()
  }

  stringifyContent() {
    const { manuscript, keyStack } = this
    let rows = []
    let textIndex = 0
      // subtract 2 for the borders and 1 for the scrollbar
    let rowSpace = process.stdout.columns - 3
    let hanziRow = []
    let zhuyinRow = []
    let keyStackIndex = 0
    let cursorRow = 0
    while (textIndex < manuscript.length) {
      const { hanzi, zhuyin } = manuscript[textIndex]
      // the minimum amount of space required to display the hanzi and zhuyin for this character
      // if not enough, need to wrap the line
      const spaceNeeded = Math.max(hanzi.width, zhuyin?.width || 0)
      if (hanzi.text === "\n") {
        textIndex++
      }
      // if we need to go to the next line, either b/c of a newline char or this line ran out of space
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
    return {
      content: rows.join("\n"),
      cursorRow
    }
  }
}
