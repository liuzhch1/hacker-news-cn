# Hacker News 中文 AI 翻译

Hacker News 文章 AI 翻译工具，将英文文章自动翻译成中文并生成 HTML 页面。

全部使用 [Cursor AI](https://www.cursor.com/) 编写，just some code only written once.

## Dev

```shell
export GOOGLE_API_KEY=<your-api-key>
uv run src/main.py
pnpm start ./hn_stories.json ./output && npx serve output
```

## Generate Weekly Pages

To generate HTML pages for all weekly archives stored in R2:

```shell
# Process new articles and generate all weekly pages
pnpm start ./hn_stories.json ./output --all-weeks

# Only generate all weekly pages without processing new articles
pnpm generate-all-weeks ./output
```

This will:

1. Pull all weekly JSON files from R2 storage
2. Generate HTML pages for each week
3. Update the history index page with links to all weeks
