import asyncio
import time
import aiohttp
import json
import os
from crawl4ai import AsyncWebCrawler

from google import genai
from google.genai import types


async def rewrite_article(title, content):
    client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
    prompt = f"""用中文重写下面这篇文章和标题，尽量保持原文的格式和意思。使用 Markdown 格式输出。
内容是从网页上爬取的，移除没有意义的内容、移出原文中和内容无关的部分。

重要规则：
1. 不要翻译专有名词、技术术语、产品名称、公司名称和人名，保留原文
2. 例如：JavaScript、Python、React、Vue、Docker、Kubernetes、GitHub、OpenAI、Deno 等技术名词保持原样
3. 标题要符合中文表达习惯，但保留原文中的关键技术词汇
4. 内容要通顺易懂，适合中文读者阅读

标题: {title}

正文:
{content}

请按以下格式返回:
标题: [中文标题]

[中文正文内容]
"""

    response = await client.aio.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=1,
            top_p=0.95,
            top_k=64,
            candidate_count=1,
            max_output_tokens=1_000_000,
        ),
    )

    result = response.text

    # Extract title and content from the response
    try:
        title_line = result.split("\n", 1)[0]
        if title_line.startswith("标题:"):
            rewritten_title = title_line[3:].strip()
            rewritten_content = result.split("\n", 1)[1].strip()
        else:
            rewritten_title = title  # Fallback to original title
            rewritten_content = result
    except:
        rewritten_title = title  # Fallback to original title
        rewritten_content = result

    return rewritten_title, rewritten_content.strip("```markdown").strip("```")


def load_existing_stories():
    """Load existing stories from the JSON file."""
    if os.path.exists("hn_stories.json"):
        try:
            with open("hn_stories.json", "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError:
            print("Error reading hn_stories.json, starting fresh")
    return []


def get_known_post_ids(stories):
    """Extract post IDs from existing stories."""
    return [story["id"] for story in stories]


async def fetch_top_stories(session, limit):
    """Fetch the IDs of the top stories from Hacker News API."""
    async with session.get("https://hacker-news.firebaseio.com/v0/topstories.json") as response:
        if response.status == 200:
            all_ids = await response.json()
            return all_ids[:limit]
        else:
            print(f"Failed to fetch top stories: {response.status}")
            return []


async def fetch_story_details(session, story_id):
    """Fetch the details of a story by its ID."""
    async with session.get(f"https://hacker-news.firebaseio.com/v0/item/{story_id}.json") as response:
        if response.status == 200:
            return await response.json()
        else:
            print(f"Failed to fetch story {story_id}: {response.status}")
            return None


async def process_stories(crawler, stories):
    """Process multiple stories concurrently using arun_many."""
    # Filter out stories without URLs
    valid_stories = [story for story in stories if story and "url" in story]

    if not valid_stories:
        return []

    # Prepare URLs and metadata for crawling
    urls = [story["url"] for story in valid_stories]
    for story in valid_stories:
        print(f"Queuing: {story['title']} - {story['url']}")

    # Crawl all URLs concurrently
    results = await crawler.arun_many(urls=urls)

    processed_stories = []
    rewrite_tasks = []

    # Create a mapping of URL to result for easier matching
    url_to_result = {result.url: result for result in results if result and hasattr(result, "url")}

    # Process the results
    for story in valid_stories:
        try:
            result = url_to_result.get(story["url"])
            if result and result.markdown:
                print(f"Successfully crawled: {story['title']}")

                # Queue up the rewrite task
                rewrite_task = asyncio.create_task(rewrite_article(story["title"], result.markdown))
                rewrite_tasks.append((story, result, rewrite_task))
            else:
                print(f"No content found for: {story['title']}")
        except Exception as e:
            print(f"Error processing {story['title']}: {str(e)}")

    # Wait for all rewrites to complete
    for story, result, rewrite_task in rewrite_tasks:
        try:
            rewritten_title, rewritten_content = await rewrite_task

            processed_stories.append(
                {
                    "id": story["id"],
                    "title": story["title"],
                    "url": story["url"],
                    "rewritten_title": rewritten_title,
                    "rewritten_content": rewritten_content,
                    "original_content": result.markdown,
                }
            )
        except Exception as e:
            print(f"Error rewriting {story['title']}: {str(e)}")

    return processed_stories


async def main():
    # Load existing stories
    existing_stories = load_existing_stories()
    print(f"Loaded {len(existing_stories)} existing stories")

    # Extract known post IDs from existing stories
    known_post_ids = get_known_post_ids(existing_stories)
    print(f"Found {len(known_post_ids)} known post IDs")

    # Create an HTTP session for API requests
    async with aiohttp.ClientSession() as session:
        # Fetch top 30 story IDs
        current_top_ids = await fetch_top_stories(session, limit=30)
        print(f"Fetched {len(current_top_ids)} top story IDs")

        # Find new story IDs that we haven't processed yet
        new_story_ids = [id for id in current_top_ids if id not in known_post_ids]
        print(f"Found {len(new_story_ids)} new stories to process")

        if new_story_ids:
            # Process in two batches of 15 each
            first_batch = new_story_ids[:15]
            second_batch = new_story_ids[15:]

            all_processed_stories = []

            # Create a crawler instance
            async with AsyncWebCrawler() as crawler:

                # Helper function to process a batch of story IDs
                async def process_batch(batch_ids, batch_num):
                    if not batch_ids:
                        return []

                    print(f"\nProcessing batch {batch_num} of {len(batch_ids)} stories...")
                    # Fetch details for each story in batch
                    story_tasks = [fetch_story_details(session, story_id) for story_id in batch_ids]
                    batch_stories = await asyncio.gather(*story_tasks)
                    batch_stories = [s for s in batch_stories if s]  # Filter out None values

                    # Process batch stories
                    batch_processed = await process_stories(crawler, batch_stories)
                    print(f"Processed {len(batch_processed)} stories in batch {batch_num}")
                    return batch_processed

                # Process both batches sequentially
                start_time = time.time()
                all_processed_stories.extend(await process_batch(first_batch, 1))
                await asyncio.sleep(60 - (time.time() - start_time))
                all_processed_stories.extend(await process_batch(second_batch, 2))

                print(f"\nProcessed {len(all_processed_stories)} new stories successfully in total")

                # Combine with existing stories, keeping only the latest 30
                all_stories = all_processed_stories + [s for s in existing_stories if s["id"] in current_top_ids]

                # Ensure we only keep the latest stories based on current_top_ids order
                latest_stories = []
                for story_id in current_top_ids:
                    for story in all_stories:
                        if story["id"] == story_id:
                            latest_stories.append(story)
                            break

                # Save results to a file
                with open("hn_stories.json", "w", encoding="utf-8") as f:
                    json.dump(latest_stories, f, ensure_ascii=False, indent=2)

                print(f"Results saved to hn_stories.json with {len(latest_stories)} stories")
        else:
            print("No new stories to process")


# Run the async main function
if __name__ == "__main__":
    asyncio.run(main())
