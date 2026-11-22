// // controllers/productController.js
// import Product from "../models/Product.js";
// import {
//   uploadMultipleFromBase64,
//   deleteMultipleImages,
//   getPublicIdFromUrl,
// } from "../utils/cloudinary.js";

// export const createProduct = async (req, res) => {
//   try {
//     const {
//       name,
//       price,
//       oldPrice,
//       quantity,
//       minQuantity,
//       category,
//       description,
//       images: base64Images = [],
//     } = req.body;

//     const supplier = req.user._id;

//     let uploadedImages = [];
//     if (base64Images.length > 0) {
//       uploadedImages = await uploadMultipleFromBase64(base64Images);
//     }

//     const product = await Product.create({
//       name,
//       price,
//       oldPrice: oldPrice ? Number(oldPrice) : undefined,
//       quantity: Number(quantity),
//       minQuantity: Number(minQuantity),
//       category,
//       description: description || "",
//       images: uploadedImages.map((img) => img.url),
//       supplier,
//     });

//     res.status(201).json({
//       success: true,
//       message: "تم اضافة المنتج بنجاح",
//       product,
//     });
//   } catch (error) {
//     console.log(error);
//     res.status(400).json({
//       success: false,
//       message: error.message || "فشل إنشاء المنتج",
//     });
//   }
// };

// export const updateProduct = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const {
//       name,
//       price,
//       oldPrice,
//       quantity,
//       minQuantity,
//       category,
//       description,
//       images,
//     } = req.body;

//     console.log(oldPrice, "oldPrice value");
//     console.log(price, "price value");

//     const product = await Product.findById(id);
//     if (!product) {
//       return res
//         .status(404)
//         .json({ success: false, message: "المنتج غير موجود" });
//     }

//     if (product.supplier.toString() !== req.user._id.toString()) {
//       return res.status(403).json({ success: false, message: "غير مصرح" });
//     }

//     if (oldPrice < price) {
//       return res.status(400).json({
//         success: false,
//         message: "السعر قبل التخفيض يجب أن يكون أكبر من السعر الحالي",
//       });
//     }

//     const currentImages = product.images || [];
//     let finalImageUrls = [...currentImages];

//     const newBase64Images = images.filter((img) =>
//       img.startsWith("data:image/"),
//     );

//     console.log("New base64 images to upload:", newBase64Images.length);

//     if (newBase64Images.length > 0) {
//       const uploaded = await uploadMultipleFromBase64(newBase64Images);
//       const newUrls = uploaded.map((img) => img.url);
//       finalImageUrls = [...finalImageUrls, ...newUrls];
//     }

//     const imagesToDelete = currentImages.filter(
//       (oldUrl) => !images.includes(oldUrl),
//     );

//     if (imagesToDelete.length > 0) {
//       const publicIds = imagesToDelete.map(getPublicIdFromUrl);

//       console.log("Deleting images with public IDs:", publicIds);

//       if (publicIds.length > 0) {
//         await deleteMultipleImages(publicIds);
//         finalImageUrls = finalImageUrls.filter(
//           (url) => !imagesToDelete.includes(url),
//         );
//       }
//     }

//     const updatedProduct = await Product.findByIdAndUpdate(
//       id,
//       {
//         name: name || product.name,
//         price: price || product.price,
//         oldPrice:
//           oldPrice !== undefined
//             ? oldPrice
//               ? Number(oldPrice)
//               : undefined
//             : product.oldPrice,
//         quantity: quantity !== undefined ? Number(quantity) : product.quantity,
//         minQuantity: minQuantity || product.minQuantity,
//         category: category || product.category,
//         description:
//           description !== undefined ? description : product.description,
//         images: finalImageUrls.slice(0, 5),
//       },
//       { new: true, runValidators: true },
//     );

//     res.status(200).json({
//       success: true,
//       product: updatedProduct,
//       message: "تم تعديل المنتج بنجاح",
//     });
//   } catch (error) {
//     console.error("Update product error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message || "فشل تعديل المنتج",
//     });
//   }
// };

// export const deleteProduct = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const product = await Product.findById(id);

//     if (!product) {
//       return res
//         .status(404)
//         .json({ success: false, message: "المنتج غير موجود" });
//     }

//     if (product.supplier.toString() !== req.user._id.toString()) {
//       return res.status(403).json({ success: false, message: "غير مصرح" });
//     }

//     if (product.images.length > 0) {
//       const publicIds = product.images.map(getPublicIdFromUrl).filter(Boolean);
//       if (publicIds.length > 0) {
//         await deleteMultipleImages(publicIds);
//       }
//     }

//     await Product.findByIdAndDelete(id);

//     res.status(200).json({ success: true, message: "تم حذف المنتج بنجاح" });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

// controllers/productController.js
import mongoose from "mongoose";
import Product from "../models/Product.js";
import { deleteFileByUrl, uploadMultipleImages } from "../utils/r2storage.js";
import { getVisibleSupplierIds } from "./subscriptionController.js";

const ALLOWED_QUALITIES = [
  "original",
  "oled",
  "incell",
  "tft",
  "high_copy",
  "standard",
];

function parseArrayInput(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function sanitizeWholesaleTiers(raw) {
  return parseArrayInput(raw)
    .map((t) => ({
      minQty: Math.max(1, Number(t?.minQty) || 0),
      price: Math.max(0, Number(t?.price) || 0),
    }))
    .filter((t) => t.minQty > 0 && t.price >= 0);
}

function sanitizeBundleItems(raw) {
  return parseArrayInput(raw)
    .map((item) => {
      const name = String(item?.name || "").trim();
      const quantity = Math.max(1, parseInt(item?.quantity, 10) || 1);
      const rawPid = item?.product || item?.productId || null;
      const product =
        rawPid && mongoose.Types.ObjectId.isValid(String(rawPid))
          ? new mongoose.Types.ObjectId(String(rawPid))
          : null;
      return { name, quantity, product };
    })
    .filter((item) => item.name.length > 0);
}

function sanitizeCategories(rawCategories, primaryCategory) {
  const list = parseArrayInput(rawCategories)
    .map((c) => String(c || "").trim())
    .filter(Boolean);
  const primary = String(primaryCategory || "").trim();
  if (primary && !list.includes(primary)) {
    list.unshift(primary);
  }
  return [...new Set(list)];
}

export const createProduct = async (req, res) => {
  try {
    const {
      name,
      price,
      oldPrice,
      quantity,
      minQuantity,
      category,
      categories,
      description,
      quality,
      wholesaleTiers,
      isBundle = false,
      bundleItems,
      images: base64Images = [],
    } = req.body;

    const supplier = req.user._id;
    const bundleFlag = isBundle === true || isBundle === "true";
    const cleanBundleItems = bundleFlag ? sanitizeBundleItems(bundleItems) : [];

    if (bundleFlag && cleanBundleItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "يرجى إضافة مكون واحد على الأقل داخل التجميعة",
      });
    }

    const cleanCategories = sanitizeCategories(categories, category);
    const primaryCat = cleanCategories[0] || String(category || "").trim();

    const cleanQuality = ALLOWED_QUALITIES.includes(quality)
      ? quality
      : "standard";
    const cleanTiers = sanitizeWholesaleTiers(wholesaleTiers);

    let uploadedImageUrls = [];
    if (Array.isArray(base64Images) && base64Images.length > 0) {
      uploadedImageUrls = await uploadMultipleImages(base64Images, "products");
    }

    const product = await Product.create({
      name,
      price: Number(price),
      oldPrice: oldPrice ? Number(oldPrice) : undefined,
      quantity: Number(quantity),
      minQuantity: Number(minQuantity) || 1,
      category: primaryCat,
      categories: cleanCategories,
      description: description || "",
      quality: cleanQuality,
      wholesaleTiers: cleanTiers,
      isBundle: bundleFlag,
      bundleItems: cleanBundleItems,
      images: uploadedImageUrls,
      supplier,
    });

    res.status(201).json({
      success: true,
      message: bundleFlag
        ? "تم إضافة التجميعة بنجاح"
        : "تم اضافة المنتج بنجاح",
      product,
    });
  } catch (error) {
    console.error("Create product error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "فشل إنشاء المنتج",
    });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      price,
      oldPrice,
      quantity,
      minQuantity,
      category,
      categories,
      description,
      quality,
      wholesaleTiers,
      isBundle,
      bundleItems,
      images, // Can contain existing URLs + new base64 images
    } = req.body;

    const product = await Product.findById(id);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "المنتج غير موجود" });
    }

    if (product.supplier.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "غير مصرح" });
    }

    if (oldPrice !== undefined && Number(oldPrice) < Number(price)) {
      return res.status(400).json({
        success: false,
        message: "السعر قبل التخفيض يجب أن يكون أكبر من السعر الحالي",
      });
    }

    const currentImages = product.images || [];
    let finalImageUrls = [...currentImages];

    // 1. Separate new base64 images from existing URLs
    const newBase64Images = (images || []).filter((img) =>
      typeof img === "string" && img.startsWith("data:image/")
    );

    // 2. Upload new images to R2
    if (newBase64Images.length > 0) {
      const newUrls = await uploadMultipleImages(newBase64Images, "products");
      finalImageUrls = [...finalImageUrls, ...newUrls];
    }

    // 3. Detect images to delete (those that were sent originally but not in the new request)
    const imagesToDelete = currentImages.filter(
      (oldUrl) => !images.includes(oldUrl)
    );

    // 4. Delete removed images from R2
    if (imagesToDelete.length > 0) {
      console.log(`Deleting ${imagesToDelete.length} images from R2`);
      await Promise.all(
        imagesToDelete.map((url) => deleteFileByUrl(url))
      );

      // Remove deleted URLs from final array
      finalImageUrls = finalImageUrls.filter(
        (url) => !imagesToDelete.includes(url)
      );
    }

    // Limit to maximum 5 images
    finalImageUrls = finalImageUrls.slice(0, 5);

    const nextIsBundle =
      isBundle !== undefined
        ? isBundle === true || isBundle === "true"
        : Boolean(product.isBundle);
    const nextBundleItems = nextIsBundle
      ? bundleItems !== undefined
        ? sanitizeBundleItems(bundleItems)
        : product.bundleItems || []
      : [];

    if (nextIsBundle && nextBundleItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "يرجى إضافة مكون واحد على الأقل داخل التجميعة",
      });
    }

    const nextCategories =
      categories !== undefined || category !== undefined
        ? sanitizeCategories(categories, category || product.category)
        : product.categories?.length
          ? product.categories
          : [product.category].filter(Boolean);
    const nextPrimaryCategory =
      nextCategories[0] || category || product.category;

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      {
        name: name || product.name,
        price: price !== undefined ? Number(price) : product.price,
        oldPrice:
          oldPrice !== undefined
            ? oldPrice
              ? Number(oldPrice)
              : undefined
            : product.oldPrice,
        quantity: quantity !== undefined ? Number(quantity) : product.quantity,
        minQuantity:
          minQuantity !== undefined ? Number(minQuantity) : product.minQuantity,
        category: nextPrimaryCategory,
        categories: nextCategories,
        description:
          description !== undefined ? description : product.description,
        quality:
          quality !== undefined && ALLOWED_QUALITIES.includes(quality)
            ? quality
            : product.quality,
        wholesaleTiers:
          wholesaleTiers !== undefined
            ? sanitizeWholesaleTiers(wholesaleTiers)
            : product.wholesaleTiers,
        isBundle: nextIsBundle,
        bundleItems: nextBundleItems,
        images: finalImageUrls,
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      product: updatedProduct,
      message: "تم تعديل المنتج بنجاح",
    });
  } catch (error) {
    console.error("Update product error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "فشل تعديل المنتج",
    });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "المنتج غير موجود" });
    }

    if (product.supplier.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "غير مصرح" });
    }

    // Delete all images from R2
    if (product.images && product.images.length > 0) {
      console.log(`Deleting ${product.images.length} images from R2`);
      await Promise.all(
        product.images.map((url) => deleteFileByUrl(url))
      );
    }

    await Product.findByIdAndDelete(id);

    res.status(200).json({ success: true, message: "تم حذف المنتج بنجاح" });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || (req.query.page ? 20 : 0);
    const query = { supplier: req.user._id };

    const total = await Product.countDocuments(query);
    let productQuery = Product.find(query).sort({ createdAt: -1 });

    if (limit > 0) {
      productQuery = productQuery.skip((page - 1) * limit).limit(limit);
    }

    const products = await productQuery.lean();

    res.status(200).json({
      success: true,
      products,
      pagination: limit > 0 ? {
        total,
        page,
        pages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      } : undefined,
    });
  } catch (error) {
    console.error("Get my products error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || (req.query.page ? 20 : 0);
    const category = req.query.category;
    const supplier = req.query.supplier;
    const search = req.query.search;

    const query = { isActive: { $ne: false } };
    if (category) {
      query.$or = [{ category }, { categories: category }];
    }

    // Hide products of unsubscribed / expired suppliers from Traders & Guests
    if (req.user?.role !== "admin") {
      const { allowedSupplierIds, allowedSupplierIdSet } =
        await getVisibleSupplierIds();
      if (supplier) {
        if (!allowedSupplierIdSet.has(String(supplier))) {
          return res.status(200).json({
            success: true,
            products: [],
            pagination:
              limit > 0
                ? { total: 0, page, pages: 0, hasMore: false }
                : undefined,
          });
        }
        query.supplier = supplier;
      } else {
        query.supplier = { $in: allowedSupplierIds };
      }
    } else if (supplier) {
      query.supplier = supplier;
    }

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const total = await Product.countDocuments(query);
    let productQuery = Product.find(query)
      .sort({ createdAt: -1 })
      .populate("supplier", "name phone logo businessName type isVerified isActive");

    if (limit > 0) {
      productQuery = productQuery.skip((page - 1) * limit).limit(limit);
    }

    const products = await productQuery.lean();

    res.status(200).json({
      success: true,
      products,
      pagination: limit > 0 ? {
        total,
        page,
        pages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      } : undefined,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getProductsBySupplier = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || (req.query.page ? 20 : 0);
    const category = req.query.category;

    const isAdmin = req.user?.role === "admin";
    const isSelfSupplier =
      req.user?.role === "supplier" &&
      req.user?._id?.toString() === String(req.params.id);

    if (!isAdmin && !isSelfSupplier) {
      const { allowedSupplierIdSet } = await getVisibleSupplierIds();
      if (!allowedSupplierIdSet.has(String(req.params.id))) {
        return res.status(200).json({
          success: true,
          products: [],
          pagination:
            limit > 0
              ? { total: 0, page, pages: 0, hasMore: false }
              : undefined,
        });
      }
    }

    const query = {
      supplier: req.params.id,
      isActive: { $ne: false },
    };
    if (category) {
      query.$or = [{ category }, { categories: category }];
    }

    const total = await Product.countDocuments(query);
    let productQuery = Product.find(query)
      .sort({ createdAt: -1 })
      .populate("supplier", "name phone logo businessName type isVerified isActive");

    if (limit > 0) {
      productQuery = productQuery.skip((page - 1) * limit).limit(limit);
    }

    const products = await productQuery.lean();

    res.status(200).json({
      success: true,
      products,
      pagination: limit > 0 ? {
        total,
        page,
        pages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      } : undefined,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getProductsByIds = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(200).json({ success: true, products: [] });
    }

    const query = { _id: { $in: ids } };
    if (req.user?.role !== "admin") {
      const { allowedSupplierIds } = await getVisibleSupplierIds();
      query.isActive = { $ne: false };
      query.supplier = { $in: allowedSupplierIds };
    }

    const products = await Product.find(query)
      .populate("supplier", "name phone logo businessName type isVerified isActive")
      .lean();

    res.status(200).json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const bulkCreateProducts = async (req, res) => {
  try {
    const { products } = req.body;
    const supplierId = req.user._id;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "يجب تقديم قائمة منتجات صالحة",
      });
    }

    const formattedProducts = products.map((p) => ({
      name: p.name,
      price: Number(p.price) || 0,
      oldPrice: p.oldPrice ? Number(p.oldPrice) : undefined,
      quantity: Number(p.quantity) || 0,
      minQuantity: Number(p.minQuantity) || 1,
      category: p.category,
      quality: p.quality || "standard",
      description: p.description || "",
      images: p.images || [],
      supplier: supplierId,
    }));

    const inserted = await Product.insertMany(formattedProducts);

    res.status(201).json({
      success: true,
      message: `تم إضافة ${inserted.length} منتج بنجاح`,
      count: inserted.length,
    });
  } catch (error) {
    console.error("Bulk create products error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "فشل استيراد المنتجات",
    });
  }
};

export const bulkUpdatePrices = async (req, res) => {
  try {
    const { category, percentage, fixedAmount } = req.body;
    const supplierId = req.user._id;

    const query = { supplier: supplierId };
    if (category && category !== "all") {
      query.category = category;
    }

    const products = await Product.find(query);
    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: "لا توجد منتجات لتعديل أسعارها",
      });
    }

    let updatedCount = 0;
    for (const product of products) {
      let newPrice = product.price;
      if (percentage !== undefined && percentage !== 0) {
        newPrice = Math.round(newPrice * (1 + Number(percentage) / 100));
      }
      if (fixedAmount !== undefined && fixedAmount !== 0) {
        newPrice = Math.max(0, newPrice + Number(fixedAmount));
      }

      if (newPrice !== product.price) {
        product.price = newPrice;
        await product.save();
        updatedCount++;
      }
    }

    res.status(200).json({
      success: true,
      message: `تم تعديل أسعار ${updatedCount} منتج بنجاح`,
      updatedCount,
    });
  } catch (error) {
    console.error("Bulk update prices error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "فشل تعديل الأسعار",
    });
  }
};
