import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export async function uploadVideo(buffer: Buffer) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    console.log(`[cloudinary] uploadVideo start bytes=${buffer.length}`);

    const timeout = setTimeout(() => {
      console.error(`[cloudinary] uploadVideo timeout after ${Date.now() - startedAt}ms`);
      reject(new Error("Cloudinary upload timeout"));
    }, 120000);

    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "video", folder: "shopify-videos" },
      (error, result) => {
        clearTimeout(timeout);
        if (error) {
          console.error(`[cloudinary] uploadVideo error after ${Date.now() - startedAt}ms`, error);
          return reject(error);
        }
        console.log(`[cloudinary] uploadVideo success after ${Date.now() - startedAt}ms public_id=${result?.public_id || "n/a"}`);
        resolve(result);
      }
    );

    stream.on("error", (streamError) => {
      clearTimeout(timeout);
      console.error(`[cloudinary] upload stream error after ${Date.now() - startedAt}ms`, streamError);
      reject(streamError);
    });

    stream.end(buffer);
  });
}