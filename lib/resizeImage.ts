// Browser-side image resize/compress utility using Canvas API.
// Resizes to at most 1600px on the longest side, JPEG quality 0.8.
// Keeps the 5 MB limit enforced by callers; this function only resizes.

export async function resizeImage(
  file: File,
  maxDimension = 1600,
  quality = 0.8
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const { width, height } = img;
      let newWidth = width;
      let newHeight = height;

      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          newWidth = maxDimension;
          newHeight = Math.round((height / width) * maxDimension);
        } else {
          newHeight = maxDimension;
          newWidth = Math.round((width / height) * maxDimension);
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context not available"));
        return;
      }
      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to compress image"));
            return;
          }
          // Keep original filename but force .jpg extension
          const baseName = file.name.replace(/\.[^.]+$/, "");
          const resized = new File([blob], `${baseName}.jpg`, {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          resolve(resized);
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for resizing"));
    };

    img.src = objectUrl;
  });
}
