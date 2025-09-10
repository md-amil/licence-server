import jwt from "jsonwebtoken";
import { keyId2UUId } from "../utils.js";
import dotenv from "dotenv";
dotenv.config();
const tenantId = process.env.TENANT_ID;
const managementKey = process.env.MANAGEMENT_KEY;
const licenseUrl = process.env.AXINOM_LICENSE_URL;
const communicationKeyId = process.env.COMMUNICATION_KEY_ID;
const communicationKeyBase64 = process.env.COMMUNICATION_KEY;
const communicationKey = Buffer.from(communicationKeyBase64, "base64");

export async function getLicense(req, res) {
  if (!req.body) return res.status(400).send("Empty license request body");
  try {
    const contentKeyId = keyId2UUId(req.headers["x-key-id"]);
    const licenseServiceMessage = {
      version: 1,
      com_key_id: communicationKeyId,
      message: {
        type: "entitlement_message",
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
    const jwtToken = jwt.sign(licenseServiceMessage, communicationKey, {
      algorithm: "HS256",
      noTimestamp: true,
    });
    const licenseRequest = req.body;
    const axinomResponse = await fetch(
      "https://a684b6fc.drm-widevine-licensing.axprod.net/AcquireLicense",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-AxDRM-Message": jwtToken,
        },
        body: licenseRequest,
      }
    );
    // console.log(axinomResponse.status);
    // console.log(axinomResponse.statusText);
    const license = await axinomResponse.arrayBuffer();
    res.set("Content-Type", "application/octet-stream");
    return res.send(Buffer.from(license));
  } catch (e) {
    console.error("License request failed:", {
      status: err.response?.status,
      headers: err.response?.headers,
      data: err.response?.data?.toString("utf8"),
      message: err.message,
    });
    res.status(500).json({ error: "License request failed" });
  }
}
