import parser from "node-html-parser";
import stringWidth from "string-width";
import fetch from "node-fetch";
import { containsZhuyin, isToneChar } from "./zhuyin-map.js";
export default async function convertHanzi(hanzi) {
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
    const json = await resp.json();
    // this endpoint actually returns HTML
    const html = json[1];
    return parseZhuyinResult(html);
}
function parseZhuyinResult(html) {
    const parsed = parser.parse(html);
    const structured = [];
    for (const line of parsed.childNodes) {
        for (const child of line.childNodes) {
            const [converted, original] = child.childNodes;
            const item = {
                hanzi: {
                    text: original.rawText,
                    width: stringWidth(original.rawText)
                }
            };
            if (converted.childNodes.length) {
                let zhuyinText = converted.childNodes[0].rawText;
                // add an explicit first tone mark, which is usually omitted. we want to make the user type it
                if (containsZhuyin(zhuyinText) && !isToneChar(zhuyinText[zhuyinText.length - 1])) {
                    zhuyinText += "ˉ";
                }
                item.zhuyin = {
                    text: zhuyinText,
                    width: stringWidth(zhuyinText)
                };
            }
            structured.push(item);
        }
        structured.push({
            hanzi: {
                text: "\n",
                width: 0
            }
        });
    }
    return structured;
}
