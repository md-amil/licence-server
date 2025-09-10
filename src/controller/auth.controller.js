import Mailjet from "node-mailjet";
import dotenv from "dotenv";
import User from "../models/user.js";

dotenv.config(); 
const publicKey = process.env.MJ_APIKEY_PUBLIC
const privateKey = process.env.MJ_APIKEY_PRIVATE
if(!publicKey||!privateKey) throw new Error("Cred not found")
const mailjet = Mailjet.apiConnect(
  publicKey,
  privateKey
);

export async function sendOtp(req, res) {
  const { email } = req.body;
  try {
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry
    let user = await User.findOne({ email });
    if (user) {
      user.otp = otp;
      user.otpExpires = otpExpires;
      user.verified = false;
    } else {
      user = new User({ email, otp, otpExpires });
    }
    await user.save();
    
    // send OTP with mailjet
    const resp = await mailjet.post("send", { version: "v3.1" }).request({
      Messages: [
        {
          From: {
            Email: process.env.MJ_SENDER_EMAIL,
            Name: "MyApp",
          },
          To: [{ Email: email }],
          Subject: "Your Verification Code",
          HTMLPart: `<h3>Your OTP is:</h3><p><b>${otp}</b></p><p>Valid for 5 minutes.</p>`,
        },
      ],
    });
    console.dir(resp.body,{depth:null})
    res.json({ message: "OTP sent successfully, check your email for verification code." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function verifyOtp(req, res) {
  const { email, otp } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });
    if (user.verified) return res.json({ message: "Already verified" });
    if (user.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });
    if (user.otpExpires < Date.now())
      return res.status(400).json({ error: "OTP expired" });
    user.verified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();
    res.status(200).json({ message: "Email verified successfully!" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
