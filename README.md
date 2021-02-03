# Zhuyin Typing Game

This is a little terminal-based typing speed trainer for inputting chinese characters using Zhuyin (注音) input.


## Installation

```js
npm i -g zhuyin-typing
```

## Usage

```js
// runs the game on a text file
zhuyin-typing chinese-text-file.txt

// picks 1 text file randomly from dir(s)
zhuyin-typing chinese-text-files-1 chinese-text-files-2

// runs 1 included example file randomly (some old homework assignment of mine)
zhuyin-typing
```


## Remarks

**Note:** This is meant to be played with U.S. keyboard layout as an input source!
Do not use a Zhuyin input source.
This is because I couldn't figure out how to capture individual key-presses when Zhuyin input is used.
Therefore, I had to take latin characters and map them to their Zhuyin character counterparts.
If there is a better solution, please let me know by opening an issue.

Also note that internet connection is required to lookup the Zhuyin for text files.
