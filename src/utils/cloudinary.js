// services/cloudinary.js
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: "dfwxtyqz9",
  api_key: "915533779278641",
  api_secret: "kEbXnaZOlb7_KI8ItkBwhFTQoCk",
  secure: true,
});

/**
 * Extract public_id from a Cloudinary URL
 * Example:
 *   https://res.cloudinary.com/dfwxtyqz9/image/upload/v1234567890/products/myimage.jpg
 *   → "products/myimage"
 */
const getPublicIdFromUrl = (url) => {
  try {
    if (!url || typeof url !== "string") return null;
    const cleanUrl = url.split("?")[0];
    const parts = cleanUrl.split("/upload/");
    if (parts.length < 2) return null;
    let pathAfterUpload = parts[1];
    pathAfterUpload = pathAfterUpload.replace(/^v\d+\//, "");
    const withoutExtension = pathAfterUpload.replace(/\.[^.]+$/, "");

    return withoutExtension;
  } catch (error) {
    console.error("Error extracting public_id:", error);
    return null;
  }
};

const uploadImageFromBase64 = async (base64String) => {
  try {
    const result = await cloudinary.uploader.upload(base64String, {
      resource_type: "image",
      folder: "products",
      use_filename: true,
      unique_filename: false,
    });

    return {
      url: result.secure_url,
      public_id: result.public_id,
    };
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    throw new Error("فشل رفع الصورة");
  }
};

const uploadMultipleFromBase64 = async (base64Array) => {
  const uploads = base64Array.map((base64) => uploadImageFromBase64(base64));
  return Promise.all(uploads);
};

const deleteImage = async (imageUrlOrPublicId) => {
  try {
    let publicId;
    if (imageUrlOrPublicId.includes("cloudinary.com")) {
      publicId = getPublicIdFromUrl(imageUrlOrPublicId);
      if (!publicId) throw new Error("لا يمكن استخراج public_id من الرابط");
    } else {
      publicId = imageUrlOrPublicId;
    }

    const result = await cloudinary.uploader.destroy(publicId, {
      invalidate: true,
    });

    return result.result === "ok" || result.result === "not found";
  } catch (error) {
    console.error("Cloudinary delete error:", error);
    throw new Error("فشل حذف الصورة");
  }
};

const deleteMultipleImages = async (imageUrlsOrIds) => {
  const publicIds = imageUrlsOrIds.map((item) =>
    item.includes("cloudinary.com") ? getPublicIdFromUrl(item) : item
  );

  const validPublicIds = publicIds.filter(Boolean);
  if (validPublicIds.length === 0) return true;

  const deletions = validPublicIds.map((id) => deleteImage(id));
  const results = await Promise.all(deletions);
  return results.every((res) => res);
};

export {
  uploadImageFromBase64,
  uploadMultipleFromBase64,
  deleteImage,
  deleteMultipleImages,
  getPublicIdFromUrl,
};