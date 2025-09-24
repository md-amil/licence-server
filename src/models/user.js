import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  phoneOtp: { type: String },
  emailOtp: { type: String },
  phone: { type: String, required: true, unique: true },
  otpExpires: { type: Date },
  verified: { type: Boolean, default: false }
});

export default mongoose.model("User", userSchema);
