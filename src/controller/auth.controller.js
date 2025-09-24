import Mailjet from "node-mailjet";
import dotenv from "dotenv";
import User from "../models/user.js";

dotenv.config();
const publicKey = process.env.MJ_APIKEY_PUBLIC;
const privateKey = process.env.MJ_APIKEY_PRIVATE; 
const token = process.env.MOODLE_TOKEN;
const twoFactorApiKey = process.env.TWOFACTOR_API_KEY;
if (!publicKey || !privateKey) throw new Error("Cred not found");
const mailjet = Mailjet.apiConnect(publicKey, privateKey);

export async function sendOtp(req, res) {
  const { email, username, phone } = req.body;
  try {
    const userRes = await checkBy("username", username);
    if (userRes.length)
      return res.status(400).json({ error: "username already exist" });
    const emailRes = await checkBy("email", email);
    if (emailRes.length)
      return res.status(400).json({ error: "email already exist" });
    // Generate two different OTPs
    const emailOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const phoneOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000);
    let user = await User.findOne({ email });
    if (user) {
      user.emailOtp = emailOtp;
      user.phoneOtp = phoneOtp;
      user.otpExpires = otpExpires;
      user.verified = false;
      user.phone = phone;
    } else {
      user = new User({
        email,
        phone,
        emailOtp,
        phoneOtp,
        otpExpires,
        verified: false,
      });
    }
    await user.save();
    await mailjet.post("send", { version: "v3.1" }).request({
      Messages: [
        {
          From: {
            Email: process.env.MJ_SENDER_EMAIL,
            Name: "MyApp",
          },
          To: [{ Email: email }],
          Subject: "Your Email Verification Code",
          HTMLPart: `<h3>Your Email OTP is:</h3><p><b>${emailOtp}</b></p><p>Valid for 5 minutes.</p>`,
        },
      ],
    });
    // Send OTP via SMS using 2Factor API
    if (phone) {
      const smsUrl = `https://2factor.in/API/V1/${twoFactorApiKey}/SMS/${phone}/${phoneOtp}/test`;
      const smsResp = await fetch(smsUrl);
      const smsData = await smsResp.json();
      console.log("SMS Response:", smsData);
    }
    res.json({
      message: "OTP sent successfully to both email and mobile.",
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
}

export async function verifyOtp(req, res) {
  const {
    "users[0][email]": email,
    "users[0][phone]": phone,
    emailOtp,
    phoneOtp,
  } = req.body;
  try {
    const user = await User.findOne({ email, phone });
    if (!user) return res.status(400).json({ error: "User not found" });
    if (user.emailOtp !== emailOtp)
      return res.status(400).json({ error: "Invalid Email OTP" });
    if (user.phoneOtp !== phoneOtp)
      return res.status(400).json({ error: "Invalid Phone OTP" });
    if (user.otpExpires < Date.now())
      return res.status(400).json({ error: "OTP expired" });

    user.verified = true;
    user.emailOtp = null;
    user.phoneOtp = null;
    user.otpExpires = null;
    await user.save();

    const moodleResult = await createUser(req.body);
    if (moodleResult.exception)
      return res.status(400).json({ data: moodleResult });

    res.status(200).json({
      message: "Email and phone verified successfully!",
      data: moodleResult,
    });
  } catch (err) {
    console.error("Error in verifyOtp:", err);
    res.status(400).json({ error: err.message });
  }
}

async function checkBy(field, value) {
  const emailParams = new URLSearchParams({
    wstoken: token,
    wsfunction: "core_user_get_users_by_field",
    moodlewsrestformat: "json",
    field,
    "values[0]": value,
  });
  const url = "https://lms.autogpt.tools/webservice/rest/server.php";
  const response = await fetch(`${url}?${emailParams.toString()}`);
  return response.json();
}

async function createUser(body) {
  try {
    const form = new FormData();
    for (const key in body) {
      if (key == "otp" || key == "confirmPassword") continue;
      form.append(key, body[key]);
    }
    form.append("wstoken", token);
    form.append("wsfunction", "core_user_create_users");
    form.append("moodlewsrestformat", "json");
    // Send request to Moodle with fetch
    const response = await fetch(
      "https://lms.autogpt.tools/webservice/rest/server.php",
      {
        method: "POST",
        body: form,
        headers: {
          Accept: "application/json",
        },
      }
    );
    console.log("Response status:", response.status);
    const res = await response.json();
    return res;
  } catch (error) {
    console.error("❌ Error creating user:", error.message);
    throw error;
  }
}
