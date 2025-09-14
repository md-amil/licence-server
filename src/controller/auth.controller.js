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
  const { 'users[0][email]':email, otp } = req.body;
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
    
    // Create user in Moodle
    const moodleResult = await createUser(req.body);
   if( moodleResult.exception) return  res.status(400).json({data:moodleResult})
    
    res.status(200).json({ 
      message: "Email verified successfully!",
      data: moodleResult
    });
  } catch (err) {
    console.error("Error in verifyOtp:", err);
    res.status(400).json({ error: err.message });
  }
}


async function createUser(body){
  try {
    // Build new FormData for Moodle
    const form = new FormData();
    for (const key in body) {
      if(key=='otp'||key=='confirmPassword') continue;
      form.append(key, body[key]);
    }
    // Add Moodle-specific fields
    form.append("wstoken", "6ed5647e0a06379844961c4ffa1cdeaf");
    form.append("wsfunction", "core_user_create_users");
    form.append("moodlewsrestformat", "json");

    // Send request to Moodle with fetch
    const response = await fetch(
      "https://lms.autogpt.tools/webservice/rest/server.php",
      {
        method: "POST",
        body: form,
        headers: {
          'Accept': 'application/json'
        }
      }
    );
    console.log("Response status:", response.status);
    // console.log("Response headers:", response.headers.get('content-type'));
    // Force JSON parsing - if Moodle returns XML, it's an error
    const res = await response.json();
    console.log("Raw response:", res);
    // let data;
    // try {
    //   data = JSON.parse(responseText);
    // } catch (parseError) {
    //   console.error("Failed to parse JSON response:", parseError);
    //   console.error("Response was:", responseText);
    //   throw new Error(`Moodle API returned non-JSON response: ${responseText.substring(0, 200)}...`);
    // }

    // Check if it's a valid Moodle response
    // if (res.exception) {
    //   throw new Error(JSON.parse(res));
    // }

    console.log("✅ User creation response:", res);
    return res;
  } catch (error) {
    console.error("❌ Error creating user:", error.message);
    throw error;
  }
}