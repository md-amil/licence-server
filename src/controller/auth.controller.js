import Mailjet from "node-mailjet";
import dotenv from "dotenv";
import User from "../models/user.js";
import  sgMail from '@sendgrid/mail';
sgMail.setApiKey(process.env.SENDGRID_API_KEY)
dotenv.config();
const publicKey = process.env.MJ_APIKEY_PUBLIC;
const privateKey = process.env.MJ_APIKEY_PRIVATE;
const token = process.env.MOODLE_TOKEN;
const baseUrl = process.env.MOODLE_URL ?? "https://lms.autogpt.tools/webservice/rest/server.php";
const twoFactorApiKey = process.env.TWOFACTOR_API_KEY;

if (!publicKey || !privateKey) throw new Error("Cred not found");
// const mailjet = Mailjet.apiConnect(publicKey, privateKey);

export async function sendOtp(req, res) {
  const { email, username, phone } = req.body;
  try {
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
    await sendOtpMail(email,emailOtp)
    // await mailjet.post("send", { version: "v3.1" }).request({
    //   Messages: [
    //     {
    //       From: {
    //         Email: process.env.MJ_SENDER_EMAIL,
    //         Name: "MyApp",
    //       },
    //       To: [{ Email: email }],
    //       Subject: "Your Email Verification Code",
    //       HTMLPart: `<h3>Your Email OTP is:</h3><p><b>${emailOtp}</b></p><p>Valid for 5 minutes.</p>`,
    //     },
    //   ],
    // });
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
    console.log(err.response.body);
    res.status(400).json({ error: err.message });
  }
}

async function sendOtpMail(to,emailOtp){
const msg = {
  to, 
  from:  process.env.MJ_SENDER_EMAIL, // Change to your verified sender
  subject: 'Sending with SendGrid is Fun',
  text: "Your Email Verification Code",
  html:  `<h3>Your Email OTP is:</h3><p><b>${emailOtp}</b></p><p>Valid for 5 minutes.</p>`,
}
return sgMail.send(msg)
}

export async function verifyOtp(req, res) {
  const { email, phone, emailOtp, phoneOtp } = req.body;
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

export async function existUser(req, res) {
  const { field, value } = req.query
  if (field == 'phone') {
    const response = await checkByPhone(value)
    console.log(response)
    return res.send({
      exist: response.exists,
      message: response.exists ? `${field} already exists` : `${field} does not exist`
    });
  }
  const exist = await checkBy(field, value)
  console.dir({ exist }, { depth: null })
  return res.send({
    exist: !!exist?.length,
    message: exist?.length ? `${field} already exists` : `${field} does not exist`
  })
}


export async function login(req, res) {
  const { username, password } = req.body;
  // return res.json({ message: "Login disabled temporarily" });
  try {
    const form = new FormData();
    form.append("username", username);
    form.append("password", password);
    form.append("service", "moodle_mobile_app");
    form.append("moodlewsrestformat", "json");
    form.append("wsfunction", "local_sd_login_get_token");

    form.append("wstoken", token);

    const response = await fetch(
      baseUrl,
      {
        method: "POST",
        body: form,
        headers: {
          Accept: "application/json",
        },
      }
    );
    const resp = await response.json();
    if (resp.exception) {
      return res.status(400).json(resp);
    }
    const params = new URLSearchParams({
      wstoken: resp.token,
      wsfunction: "core_webservice_get_site_info",
      moodlewsrestformat: "json",
    });

    const infoRes = await fetch(`${baseUrl}?${params.toString()}`);
    if (!infoRes.ok) {
      return res.status(400).json(infoRes);
    }

    const {functions,...data} = await infoRes.json();
    return res.status(200).json({ token:resp.token, siteInfo: data });
  } catch (err) {
    console.error("Error in login:", err.response);
    res.status(400).json({ error: err.message });
  }
}

async function checkByPhone(value) {
  const url = "https://lms.autogpt.tools/webservice/rest/server.php";
  const payload = new URLSearchParams({
    wstoken: token,
    wsfunction: "coursehook_check_user_by_mobile",
    moodlewsrestformat: "json",
    mobile: value,
  });
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload.toString(),
  });
  const data = await response.json();
  return data;
}


async function checkBy(field, value) {
  const url = "https://lms.autogpt.tools/webservice/rest/server.php";
  const params = new URLSearchParams({
    wstoken: token,
    wsfunction: "core_user_get_users",
    moodlewsrestformat: "json",
    "criteria[0][key]": field,
    "criteria[0][value]": value,
  });
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = await response.json();
  return data?.users;
}

async function createUser(body) {
  try {
    const form = new FormData();
    form.append("users[0][username]", body.username);
    form.append("users[0][password]", body.password);
    form.append("users[0][firstname]", body.firstname);
    form.append("users[0][lastname]", body.lastname);
    form.append("users[0][email]", body.email);
    form.append("users[0][phone1]", body.phone);
    form.append("users[0][city]", body.city);
    form.append("users[0][country]", body.country);
    form.append("wstoken", token);
    form.append("wsfunction", "core_user_create_users");
    form.append("moodlewsrestformat", "json");
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
