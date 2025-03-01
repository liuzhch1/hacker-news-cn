# Hacker News 中文 AI 翻译

Hacker News 文章 AI 翻译工具，将英文文章自动翻译成中文并生成 HTML 页面。

全部使用 [Cursor AI](https://www.cursor.com/) 编写，just some code only written once.

## Dev

```shell
export GOOGLE_API_KEY=<your-api-key>
uv run src/main.py
pnpm start ./hn_stories.json ./output && npx serve output
```
