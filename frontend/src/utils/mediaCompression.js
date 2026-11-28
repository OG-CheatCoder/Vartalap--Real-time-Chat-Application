/**
 * Client-side media compression before uploading (mirrors WhatsApp media optimization):
 * Resizes & compresses large raster images in-browser via HTML5 Canvas so minimal bandwidth
 * and storage are consumed without degrading chat quality.
 */
export const compressImageIfNeeded = async (file, maxDimension = 1600, quality = 0.78) => {
  if (!file || !file.type?.startsWith("image/")) return file;
  if (file.type === "image/gif" || file.size < 120 * 1024) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      const outputMime = file.type === "image/png" ? "image/webp" : "image/jpeg";
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          const baseName = file.name.replace(/\.[^/.]+$/, "");
          const ext = outputMime === "image/webp" ? "webp" : "jpg";
          resolve(new File([blob], `${baseName}.${ext}`, { type: outputMime }));
        },
        outputMime,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
};
