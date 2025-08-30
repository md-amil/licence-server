import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import jwt from 'jsonwebtoken'
import cors from "cors";
import { keyId2UUId } from "./utils.js";

dotenv.config();

const app = express();
app.use(cors({
  origin: "*", // or replace with your frontend domain
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-AxDRM-Message", "X-AxDRM-MessageType", "X-AxDRM-TenantId"]
}));
app.use("/license", bodyParser.raw({ type: "*/*" }));

const tenantId = process.env.TENANT_ID;
const managementKey = process.env.MANAGEMENT_KEY;
const licenseUrl = process.env.AXINOM_LICENSE_URL;
const communicationKeyId = process.env.COMMUNICATION_KEY_ID; 
const communicationKeyBase64 =  process.env.COMMUNICATION_KEY; 
const communicationKey = Buffer.from(communicationKeyBase64, 'base64');
const contentKeyId = keyId2UUId();
console.log({contentKeyId})
const licenseServiceMessage = {
  version: 1,
  com_key_id: communicationKeyId,
  message: {
    type: 'entitlement_message',
    version: 2,
    content_keys_source: {
      inline: [
        {
          id: contentKeyId,
        },
      ],
    },
  },
};
// This is the Key ID of the content you want to decrypt
const port = process.env.PORT || 3000;
// export function generateLicenseToken() {
//   const commKey = Buffer.from(commKeyBase64, "base64");

//   return jwt.sign(
//     { iss: tenantId }, // payload
//     commKey,           // secret
//     {
//       algorithm: "HS256",
//       keyid: commKeyId, // ensures kid in header
//       expiresIn: "5m"
//     }
//   );
// }

// const data = Buffer.from(base64Str, "base64");

// helper: convert 16-byte buffer to UUID string
// function toUUID(buf) {
//   return [
//     buf.slice(0, 4).toString("hex"),
//     buf.slice(4, 6).toString("hex"),
//     buf.slice(6, 8).toString("hex"),
//     buf.slice(8, 10).toString("hex"),
//     buf.slice(10, 16).toString("hex"),
//   ].join("-");
// }

// Widevine protobuf is very simple: key_id are length-delimited fields with tag = 2
// Quick + dirty extractor (no full protobuf lib)
// function extractKeyIds(buf) {
//   let keyIds = [];
//   let i = 0;
//   while (i < buf.length) {
//     let tag = buf[i] >> 3;
//     let wireType = buf[i] & 7;
//     i++;
//     if (tag === 2 && wireType === 2) { // field 2 = key_id (length-delimited)
//       let len = buf[i]; // varint, assuming <128
//       i++;
//       let keyBuf = buf.slice(i, i + len);
//       if (len === 16) {
//         keyIds.push(toUUID(keyBuf));
//       }
//       i += len;
//     } else if (wireType === 2) {
//       let len = buf[i];
//       i++;
//       i += len;
//     } else {
//       i++; // skip unknown
//     }
//   }
//   return keyIds;
// }

// const keyIds = extractKeyIds(data);

app.get('/test',(req,res)=>res.send("working"))

app.post("/license", async (req, res) => {
  if(!req.body) return  res.status(400).send("Empty license request body");
  try{
    const jwtToken = jwt.sign(licenseServiceMessage, communicationKey, {
  algorithm: 'HS256',
  noTimestamp: true, 
});
 const licenseRequest = req.body;
  const axinomResponse = await fetch('https://a684b6fc.drm-widevine-licensing.axprod.net/AcquireLicense', {
    method: 'POST',
    headers: {
      // 'Authorization': 'Basic ' + Buffer.from(`${tenantId}:${managementKey}`).toString('base64'),
      'Content-Type': 'application/octet-stream',
      "X-AxDRM-Message": jwtToken,
    },
    body: licenseRequest
  });
  console.log(axinomResponse.status)
  console.log(axinomResponse.statusText)

  const license = await axinomResponse.arrayBuffer();
  res.set('Content-Type', 'application/octet-stream');
  return res.send(Buffer.from(license));
  }catch(e){
     console.error("License request failed:", {
      status: err.response?.status,
      headers: err.response?.headers,
      data: err.response?.data?.toString("utf8"),
      message: err.message
    });
    res.status(500).json({ error: "License request failed" });
  }
 

  try {
    // const payload = req.body; 

    // console.log("Raw buffer:", req.body);          // <Buffer ...>
  // console.log("Hex:", req.body.toString("hex")); // readable hex dump
  // console.log("Base64:", req.body.toString("base64")); // compact form
  // console.log(extractKeyIds(req.body.toString("base64")),"key id")
  // console.log("UTF8:", req.body.toString("utf8")); // might be gibberish, since it's not text
    // const auth = Buffer.from(`${tenantId}:${managementKey}`).toString("base64");

// console.log({jwtToken})
//     const response = await axios.post(licenseUrl, payload, {
//       headers: {
//         "Content-Type": "application/octet-stream",
//         "X-AxDRM-Message": jwtToken,
//         "X-AxDRM-MessageType": "LicenseRequest",
//         "X-AxDRM-TenantId": 'a684b6fc-e29d-44f9-8668-f4ae56e0155b',
//       },
//       responseType: "arraybuffer"
//     });

    // res.set("Content-Type", "application/octet-stream");
    // res.send(response.data);
  } catch (err) {
    console.error("License request failed:", {
      status: err.response?.status,
      headers: err.response?.headers,
      data: err.response?.data?.toString("utf8"),
      message: err.message
    });
    res.status(500).json({ error: "License request failed" });
  }
});

app.listen(port, () => {
  console.log(`License Proxy running on http://localhost:${port}`);
});
