import { S3Client } from "@aws-sdk/client-s3";
import { generateAllWeeklyPages } from "./converter";

// Import r2Config from the config file
import { r2Config } from "./config";

async function main() {
  // Get command line arguments
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error(
      "Usage: node --loader ts-node/esm src/generate-all-weeks.ts <output-directory>"
    );
    process.exit(1);
  }

  const outputDir = args[0];

  try {
    // Create R2 client
    const r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
      },
    });

    console.log("Generating pages for all weeks...");
    await generateAllWeeklyPages(r2Client, outputDir);
    console.log("All weekly pages generated successfully!");
  } catch (err) {
    console.error("Generation failed:", err);
    process.exit(1);
  }
}

// Run the main function
main();
