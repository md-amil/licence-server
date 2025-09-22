import Mailjet from "node-mailjet";
import dotenv from "dotenv";
import User from "../models/user.js";

dotenv.config();
const publicKey = process.env.MJ_APIKEY_PUBLIC;
const privateKey = process.env.MJ_APIKEY_PRIVATE;
const token = process.env.MOODLE_TOKEN;
if (!publicKey || !privateKey) throw new Error("Cred not found");
const mailjet = Mailjet.apiConnect(publicKey, privateKey);

export async function sendOtp(req, res) {
  const { email,username } = req.body;
  try {
    const userRes = await checkBy('username',username)
    if(userRes.length) return res.status(400).json({ error: "username already exist" });
    const emailRes = await checkBy('email',email)
    if(emailRes.length) return res.status(400).json({ error: "email already exist" });
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); 
    let user = await User.findOne({ email });
    if (user) {
      user.otp = otp;
      user.otpExpires = otpExpires;
      user.verified = false;
    } else {
      user = new User({ email, otp, otpExpires });
    }
    await user.save();
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
    console.dir(resp.body, { depth: null });
    res.json({
      message: "OTP sent successfully, check your email for verification code.",
    });
  } catch (err) {
    console.log(err)
    res.status(400).json({ error: err.message });
  }
}

export async function verifyOtp(req, res) {
  const { "users[0][email]": email, otp } = req.body;
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
    const moodleResult = await createUser(req.body);
    if (moodleResult.exception)
      return res.status(400).json({ data: moodleResult });

    res.status(200).json({
      message: "Email verified successfully!",
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
  return  response.json();
}

async function createUser(body) {
  try {
    const form = new FormData();
    for (const key in body) {
      if (key == "otp" || key == "confirmPassword") continue;
      form.append(key, body[key]);
    }
    form.append("wstoken",token);
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
