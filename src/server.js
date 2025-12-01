import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
dotenv.config();

import bodyParser from "body-parser";
import cors from "cors";
import { getLicense } from "./controller/license.controller.js";
import { existUser, login, sendOtp, verifyOtp } from "./controller/auth.controller.js";
import { getFairplayCertificate, getFairplayLicense, getPlayReadyLicense, getWidevineLicense } from "./service/licence.service.js";
// MongoDB connection
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || "mongodb://localhost:27017/license-server";
    await mongoose.connect(mongoURI);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

// Connect to MongoDB
connectDB();

const app = express();
app.use(
  cors({
    origin: "*", // or replace with your frontend domain
    methods: ["POST", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "X-AxDRM-Message",
      "X-AxDRM-MessageType",
      "X-AxDRM-TenantId",
      "X-Key-Id", 
      'X-Require-Hardware-DRM'
    ],
  })
);
app.use(express.json());
app.use("/license", bodyParser.raw({ type: "*/*" }));


const port = process.env.PORT || 3000;

app.get("/test", (req, res) => res.send("working"));
// app.post("/license", getLicense);

app.get('/auth/exist',existUser)
app.post("/auth/send-otp", sendOtp);
app.post("/auth/verify-otp", verifyOtp);
app.post('/auth/login',login)


app.post("/license", getLicense);

// DRM-specific endpoints
app.post("/license/widevine", getWidevineLicense);
app.post("/license/fairplay", getFairplayLicense);
app.post("/license/playready", getPlayReadyLicense);

// FairPlay certificate endpoint (required for FairPlay)
app.get("/fairplay/cert", getFairplayCertificate);

app.listen(port, () => {
  console.log(`License Proxy running on http://localhost:${port}`);
});
