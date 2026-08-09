import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const ADMIN_NAME     = "Admin";
const ADMIN_EMAIL    = "admin@admin.com";
const ADMIN_PASSWORD = "admin123";
const ADMIN_ROLE     = "admin";

const userSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true },
    email:     { type: String, required: true, unique: true, lowercase: true },
    password:  { type: String, required: true, select: false },
    role:      { type: String, enum: ["admin", "owner"], default: "admin" },
    isActive:  { type: Boolean, default: true },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const existing = await User.findOne({ email: ADMIN_EMAIL });
    if (existing) {
      console.log(`⚠️  User "${ADMIN_EMAIL}" already exists. Skipping.`);
      process.exit(0);
    }

    const hashed = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await User.create({
      name:     ADMIN_NAME,
      email:    ADMIN_EMAIL,
      password: hashed,
      role:     ADMIN_ROLE,
      isActive: true,
    });

    console.log("────────────────────────────────────");
    console.log("✅ Admin account created!");
    console.log(`   Email    : ${ADMIN_EMAIL}`);
    console.log(`   Password : ${ADMIN_PASSWORD}`);
    console.log("────────────────────────────────────");
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seed();