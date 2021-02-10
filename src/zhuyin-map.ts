export const zhuyinMap: Record<string, string> = {
  "1": "ㄅ",
  "2": "ㄉ",
  "3": "ˇ",
  "4": "ˋ",
  "5": "ㄓ",
  "6": "ˊ",
  "7": "˙",
  "8": "ㄚ",
  "9": "ㄞ",
  "0": "ㄢ",
  "-": "ㄦ",
  "q": "ㄆ",
  "w": "ㄊ",
  "e": "ㄍ",
  "r": "ㄐ",
  "t": "ㄔ",
  "y": "ㄗ",
  "u": "ㄧ",
  "i": "ㄛ",
  "o": "ㄟ",
  "p": "ㄣ",
  "a": "ㄇ",
  "s": "ㄋ",
  "d": "ㄎ",
  "f": "ㄑ",
  "g": "ㄕ",
  "h": "ㄘ",
  "j": "ㄨ",
  "k": "ㄜ",
  "l": "ㄠ",
  ";": "ㄤ",
  "z": "ㄈ",
  "x": "ㄌ",
  "c": "ㄏ",
  "v": "ㄒ",
  "b": "ㄖ",
  "n": "ㄙ",
  "m": "ㄩ",
  ",": "ㄝ",
  ".": "ㄡ",
  "/": "ㄥ",
  " ": "ˉ"
}


const zhuyinCharSet = new Set(Object.values(zhuyinMap))
const zhuyinToneSet = new Set(["ˉ",  "ˊ",  "ˇ",  "ˋ",  "˙"])


export function containsZhuyin(text: string) {
  return Array.prototype.some.call(text, isZhuyinChar)
}


export function isZhuyinChar(char: string) {
  return zhuyinCharSet.has(char)
}


export function isToneChar(char: string) {
  return zhuyinToneSet.has(char)
}
