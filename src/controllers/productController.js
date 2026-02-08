// controllers/productController.js
import Product from "../models/Product.js";
import {
  uploadMultipleFromBase64,
  deleteMultipleImages,
  getPublicIdFromUrl,
} from "../utils/cloudinary.js";

export const createProduct = async (req, res) => {
  try {
    const {
      name,
      price,
      oldPrice,
      quantity,
      minQuantity,
      category,
      description,
      images: base64Images = [],
    } = req.body;

    const supplier = req.user._id;

    let uploadedImages = [];
    if (base64Images.length > 0) {
      uploadedImages = await uploadMultipleFromBase64(base64Images);
    }

    const product = await Product.create({
      name,
      price,
      oldPrice: oldPrice ? Number(oldPrice) : undefined,
      quantity: Number(quantity),
      minQuantity: Number(minQuantity),
      category,
      description: description || "",
      images: uploadedImages.map((img) => img.url),
      supplier,
    });

    res.status(201).json({
      success: true,
      message: "تم اضافة المنتج بنجاح",
      product,
    });
  } catch (error) {
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
      description,
      images,
    } = req.body;

    console.log(oldPrice, "oldPrice value");
    console.log(price, "price value");

    const product = await Product.findById(id);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "المنتج غير موجود" });
    }

    if (product.supplier.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "غير مصرح" });
    }

    if (oldPrice < price) {
      return res.status(400).json({
        success: false,
        message: "السعر قبل التخفيض يجب أن يكون أكبر من السعر الحالي",
      });
    }

    const currentImages = product.images || [];
    let finalImageUrls = [...currentImages];

    const newBase64Images = images.filter((img) =>
      img.startsWith("data:image/"),
    );

    console.log("New base64 images to upload:", newBase64Images.length);

    if (newBase64Images.length > 0) {
      const uploaded = await uploadMultipleFromBase64(newBase64Images);
      const newUrls = uploaded.map((img) => img.url);
      finalImageUrls = [...finalImageUrls, ...newUrls];
    }

    const imagesToDelete = currentImages.filter(
      (oldUrl) => !images.includes(oldUrl),
    );

    if (imagesToDelete.length > 0) {
      const publicIds = imagesToDelete.map(getPublicIdFromUrl);

      console.log("Deleting images with public IDs:", publicIds);

      if (publicIds.length > 0) {
        await deleteMultipleImages(publicIds);
        finalImageUrls = finalImageUrls.filter(
          (url) => !imagesToDelete.includes(url),
        );
      }
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      {
        name: name || product.name,
        price: price || product.price,
        oldPrice:
          oldPrice !== undefined
            ? oldPrice
              ? Number(oldPrice)
              : undefined
            : product.oldPrice,
        quantity: quantity || product.quantity,
        minQuantity: minQuantity || product.minQuantity,
        category: category || product.category,
        description:
          description !== undefined ? description : product.description,
        images: finalImageUrls.slice(0, 5),
      },
      { new: true, runValidators: true },
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

    if (product.images.length > 0) {
      const publicIds = product.images.map(getPublicIdFromUrl).filter(Boolean);
      if (publicIds.length > 0) {
        await deleteMultipleImages(publicIds);
      }
    }

    await Product.findByIdAndDelete(id);

    res.status(200).json({ success: true, message: "تم حذف المنتج بنجاح" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyProducts = async (req, res) => {
  try {
    const products = await Product.find({ supplier: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, products });
  } catch (error) {
    console.error("Get my products error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find()
      .sort({ createdAt: -1 })
      .populate("supplier")
      .lean();

    res.status(200).json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getProductsBySupplier = async (req, res) => {
  try {
    const products = await Product.find({
      supplier: req.params.id,
    })
      .sort({ createdAt: -1 })
      .populate("supplier")
      .lean();

    res.status(200).json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
