import fs from "fs-extra";
import path from "path";
import { Feed } from "feed";

// Define the interface for our JSON data
interface Article {
  id: number;
  title: string;
  url: string;
  rewritten_title: string;
  rewritten_content: string;
  original_content: string;
}

interface ProcessedArticle {
  id: number;
  title: string;
  rewritten_title: string;
  url: string;
  filename: string;
}

/**
 * Converts markdown to HTML using remark
 */
async function markdownToHtml(markdown: string): Promise<string> {
  // Use dynamic imports for ESM modules
  const { remark } = await import("remark");
  const remarkHtml = await import("remark-html");

  const result = await remark().use(remarkHtml.default).process(markdown);

  return result.toString();
}

/**
 * Creates a navigation HTML for articles
 */
function createNavigation(
  articles: ProcessedArticle[],
  currentId?: number
): string {
  const navItems = articles.map((article) => {
    const isActive = article.id === currentId;
    const activeClass = isActive ? 'class="active"' : "";
    return `<li><a href="${article.filename}" ${activeClass}>${article.rewritten_title}</a></li>`;
  });

  return `
<div class="nav-container">
  <div class="nav-title">Articles</div>
  <ul class="nav-list">
    ${currentId ? '<li><a href="index.html">← Back to Index</a></li>' : ""}
    ${navItems.join("\n    ")}
  </ul>
</div>`;
}

/**
 * Creates a simple back to index link
 */
function createBackToIndex(): string {
  return `<div class="back-to-index"><a href="index.html">← Back to Index</a></div>`;
}

/**
 * Creates a card-based list of articles for the index page
 */
function createArticleCards(articles: ProcessedArticle[]): string {
  return articles
    .map(
      (article) => `
    <div class="article-card">
      <h2><a href="${article.filename}">${article.rewritten_title}</a></h2>
      <div class="article-meta">
        <span class="original-title">${article.title}</span>
        <a href="${article.url}" target="_blank" class="article-source">Source</a>
      </div>
    </div>
  `
    )
    .join("\n");
}

/**
 * Creates a footer with timestamp
 */
function createFooter(): string {
  const timestamp = new Date().toLocaleString();
  return `
<footer class="footer">
  <p>Generated on ${timestamp}</p>
</footer>`;
}

/**
 * Generates RSS feed from articles
 */
async function generateRssFeed(
  articles: ProcessedArticle[],
  outputDir: string,
  fullArticles: Article[]
): Promise<void> {
  // Create a new feed
  const feed = new Feed({
    title: "Hacker News AI 中文翻译",
    description: "Hacker News AI 中文翻译 每日更新",
    id: "https://liuzhch1.github.io/hacker-news-cn/",
    link: "https://liuzhch1.github.io/hacker-news-cn/",
    language: "zh-CN",
    image: "https://liuzhch1.github.io/hacker-news-cn/image.png",
    favicon: "https://liuzhch1.github.io/hacker-news-cn/favicon.ico",
    copyright: "Hacker News",
    updated: new Date(),
    generator: "Hacker News Feed Generator",
    feedLinks: {
      rss: "https://liuzhch1.github.io/hacker-news-cn/rss.xml",
    },
    author: {
      name: "Hacker News AI 中文翻译",
    },
  });

  // Add articles to feed
  for (const article of articles) {
    // Find the full article data
    const fullArticle = fullArticles.find((a) => a.id === article.id);
    if (!fullArticle) continue;

    // Convert markdown content to HTML
    const htmlContent = await markdownToHtml(fullArticle.rewritten_content);

    // Create a short description (first 280 chars of content)
    const plainTextDescription =
      fullArticle.rewritten_content
        .replace(/[#*`_]/g, "") // Remove markdown formatting
        .substring(0, 280) + "...";

    feed.addItem({
      title: article.rewritten_title,
      id: article.id.toString(),
      link: `https://liuzhch1.github.io/hacker-news-cn/${article.filename}`,
      description: plainTextDescription,
      content: htmlContent,
      author: [
        {
          name: "Hacker News AI 中文翻译",
        },
      ],
      date: new Date(),
    });
  }

  // Write RSS feed to file
  const outputPath = path.join(outputDir, "rss.xml");
  return fs.writeFile(outputPath, feed.rss2());
}

/**
 * Main function to process the JSON file
 */
async function processJsonFile(
  inputFilePath: string,
  outputDir: string
): Promise<void> {
  try {
    // Create output directory if it doesn't exist
    await fs.ensureDir(outputDir);

    // Create css directory in the output folder
    const cssOutputDir = path.join(outputDir, "css");
    await fs.ensureDir(cssOutputDir);

    // Copy the CSS file to the output directory
    const cssSourcePath = path.join(
      process.cwd(),
      "public",
      "css",
      "style.css"
    );
    const cssDestPath = path.join(cssOutputDir, "style.css");
    await fs.copy(cssSourcePath, cssDestPath);
    console.log(`CSS file copied to ${cssDestPath}`);

    // Read and parse the JSON file
    const jsonData = await fs.readJson(inputFilePath);

    if (!Array.isArray(jsonData)) {
      throw new Error("Input JSON is not an array");
    }

    console.log(`Found ${jsonData.length} articles to process`);

    // First pass: collect all article info for navigation
    const processedArticles: ProcessedArticle[] = [];

    for (const article of jsonData as Article[]) {
      const sanitizedTitle = article.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      const filename = `${article.id}-${sanitizedTitle}.html`;

      processedArticles.push({
        id: article.id,
        title: article.title,
        rewritten_title: article.rewritten_title || article.title,
        url: article.url,
        filename,
      });
    }

    // Sort articles by ID
    processedArticles.sort((a, b) => b.id - a.id);

    // Second pass: generate HTML files with navigation
    for (const article of jsonData as Article[]) {
      try {
        // Convert markdown to HTML
        const htmlContent = await markdownToHtml(article.rewritten_content);

        // Create filename based on article id and title
        const sanitizedTitle = article.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

        const filename = `${article.id}-${sanitizedTitle}.html`;
        const outputPath = path.join(outputDir, filename);

        // Create back to index link instead of full navigation
        const backToIndex = createBackToIndex();
        const footer = createFooter();

        // Create a simple HTML document with link to external CSS
        const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${article.rewritten_title || article.title}</title>
  <link rel="stylesheet" href="./css/style.css">
</head>
<body id="top">
  ${backToIndex}
  
  <h1>${article.rewritten_title || article.title}</h1>
  <div class="article-meta">
    <span class="original-title">${article.title}</span>
    <div>
      <a href="${
        article.url
      }" target="_blank" class="article-source">Source</a> | 
      <a href="https://news.ycombinator.com/item?id=${
        article.id
      }" target="_blank" class="article-comments">HN Comments</a>
    </div>
  </div>
  <div class="content">
    ${htmlContent}
  </div>
  
  <a href="#top" class="back-to-top" title="Back to top">↑</a>
  
  ${footer}
</body>
</html>`;

        // Write the HTML file
        await fs.writeFile(outputPath, fullHtml);
        console.log(`Processed article ${article.id}: ${outputPath}`);
      } catch (err) {
        console.error(`Error processing article ${article.id}:`, err);
      }
    }

    // Create index.html
    const indexPath = path.join(outputDir, "index.html");
    const articleCards = createArticleCards(processedArticles);
    const footer = createFooter();

    const indexHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hacker News Posts | Hacker News AI 中文翻译 每4小时更新</title>
  <meta name="description" content="Hacker News AI 中文翻译 每4小时更新">
  <link rel="stylesheet" href="./css/style.css">
  <link rel="alternate" type="application/rss+xml" title="RSS Feed" href="./rss.xml">
</head>
<body id="top">
  <h1>Hacker News Posts</h1>
  
  <div class="content-description">
    <p>文章使用 Google gemini AI 翻译，每日更新。</p>
    <p>所有内容保留原文链接和 Hacker News 评论区链接。</p>
    <p><a href="./rss.xml" class="rss-link">RSS Feed</a></p>
  </div>
  
  <div class="article-list">
    ${articleCards}
  </div>
  
  <a href="#top" class="back-to-top" title="Back to top">↑</a>
  
  ${footer}
</body>
</html>`;

    await fs.writeFile(indexPath, indexHtml);
    console.log(`Created index file: ${indexPath}`);

    // Generate RSS feed
    await generateRssFeed(processedArticles, outputDir, jsonData as Article[]);
    console.log(`Generated RSS feed: ${path.join(outputDir, "rss.xml")}`);

    console.log("All articles processed successfully!");
  } catch (err) {
    console.error("Error processing JSON file:", err);
    throw err;
  }
}

// Check if this file is being run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  // Get command line arguments
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error(
      "Usage: node --loader ts-node/esm src/converter.ts <input-json-file> <output-directory>"
    );
    process.exit(1);
  }

  const [inputFilePath, outputDir] = args;

  // Run the main function
  processJsonFile(inputFilePath, outputDir)
    .then(() => {
      console.log("Conversion completed successfully!");
    })
    .catch((err) => {
      console.error("Conversion failed:", err);
      process.exit(1);
    });
}

// Export for potential use as a module
export { processJsonFile, markdownToHtml };
