import jwt from "jsonwebtoken";
import { keyId2UUId } from "../utils.js";
import dotenv from "dotenv";
dotenv.config();

const tenantId = process.env.TENANT_ID;
const managementKey = process.env.MANAGEMENT_KEY;
const communicationKeyId = process.env.COMMUNICATION_KEY_ID;
const communicationKeyBase64 = process.env.COMMUNICATION_KEY;
const communicationKey = Buffer.from(communicationKeyBase64, "base64");

// DRM-specific URLs
const widevineUrl = process.env.WIDEVINE_LICENSE_URL || "https://a684b6fc.drm-widevine-licensing.axprod.net/AcquireLicense";
const fairplayUrl = process.env.FAIRPLAY_LICENSE_URL || "https://a684b6fc.drm-fairplay-licensing.axprod.net/AcquireLicense";
const playreadyUrl = process.env.PLAYREADY_LICENSE_URL || "https://a684b6fc.drm-playready-licensing.axprod.net/AcquireLicense";

// Widevine License Handler
export async function getWidevineLicense(req, res) {
  console.log("Received Widevine license request");
  if (!req.body) return res.status(400).send("Empty license request body");

  // const securityLevel = req.headers['x-security-level'];
  // console.log("Security Level:", securityLevel);
  // if (securityLevel === 'L3' || !securityLevel) {
  //   return res.status(403).json({ 
  //     error: 'Hardware-level DRM (L1) required' 
  //   });
  // }
  
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
    const axinomResponse = await fetch(widevineUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-AxDRM-Message": jwtToken,
      },
      body: licenseRequest,
    });
    
    if (!axinomResponse.ok) {
      throw new Error(`Axinom responded with status: ${axinomResponse.status}`);
    }
    
    const license = await axinomResponse.arrayBuffer();
    res.set("Content-Type", "application/octet-stream");
    return res.send(Buffer.from(license));
  } catch (err) {
    console.error("Widevine license request failed:", {
      status: err.response?.status,
      headers: err.response?.headers,
      data: err.response?.data?.toString("utf8"),
      message: err.message,
    });
    res.status(500).json({ error: "Widevine license request failed" });
  }
}

// FairPlay License Handler
export async function getFairplayLicense(req, res) {
  console.log("FairPlay license request received");
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
    
    // FairPlay expects SPC (Server Playback Context) in the body
    const licenseRequest = req.body;
    const axinomResponse = await fetch(fairplayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-AxDRM-Message": jwtToken,
      },
      body: licenseRequest,
    });
    
    if (!axinomResponse.ok) {
      throw new Error(`Axinom responded with status: ${axinomResponse.status}`);
    }
    
    // FairPlay returns CKC (Content Key Context)
    const license = await axinomResponse.arrayBuffer();
    res.set("Content-Type", "application/octet-stream");
    return res.send(Buffer.from(license));
  } catch (err) {
    console.error("FairPlay license request failed:", {
      status: err.response?.status,
      headers: err.response?.headers,
      data: err.response?.data?.toString("utf8"),
      message: err.message,
    });
    res.status(500).json({ error: "FairPlay license request failed" });
  }
}

// PlayReady License Handler
export async function getPlayReadyLicense(req, res) {
  console.log("PlayReady license request received");
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
    const axinomResponse = await fetch(playreadyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "X-AxDRM-Message": jwtToken,
      },
      body: licenseRequest,
    });
    
    if (!axinomResponse.ok) {
      throw new Error(`Axinom responded with status: ${axinomResponse.status}`);
    }
    
    const license = await axinomResponse.arrayBuffer();
    res.set("Content-Type", "text/xml");
    return res.send(Buffer.from(license));
  } catch (err) {
    console.error("PlayReady license request failed:", {
      status: err.response?.status,
      headers: err.response?.headers,
      data: err.response?.data?.toString("utf8"),
      message: err.message,
    });
    res.status(500).json({ error: "PlayReady license request failed" });
  }
}

// Universal License Handler (detects DRM type)
export async function getLicense(req, res) {
  const drmType = req.headers["x-drm-type"] || detectDrmType(req);
  
  switch (drmType?.toLowerCase()) {
    case "widevine":
      return getWidevineLicense(req, res);
    case "fairplay":
      return getFairplayLicense(req, res);
    case "playready":
      return getPlayReadyLicense(req, res);
    default:
      // Default to Widevine for backward compatibility
      return getWidevineLicense(req, res);
  }
}

// Helper function to detect DRM type from request
export function detectDrmType(req) {
  const contentType = req.headers["content-type"];
  const userAgent = req.headers["user-agent"]?.toLowerCase() || "";
  console.log("Detecting DRM type from request headers:", { contentType, userAgent });
  // PlayReady typically sends XML
  if (contentType?.includes("xml")) {
    return "playready";
  }
  
  // FairPlay detection (Safari/iOS)
  if (userAgent.includes("safari") && !userAgent.includes("chrome")) {
    return "fairplay";
  }
  
  // Default to Widevine
  return "widevine";
}

// FairPlay Certificate Handler
export async function getFairplayCertificate(req, res) {
  console.log("FairPlay certificate request received");
  try {
    const certUrl = process.env.FAIRPLAY_CERT_URL || 
      `https://a684b6fc.drm-fairplay-licensing.axprod.net/GetCertificate`;
    
    const certResponse = await fetch(certUrl, {
      method: "GET",
      headers: {
        "X-AxDRM-Message": jwt.sign(
          { version: 1, com_key_id: communicationKeyId },
          communicationKey,
          { algorithm: "HS256", noTimestamp: true }
        ),
      },
    });
    
    if (!certResponse.ok) {
      throw new Error(`Certificate request failed: ${certResponse.status}`);
    }
    
    const certificate = await certResponse.arrayBuffer();
    res.set("Content-Type", "application/octet-stream");
    return res.send(Buffer.from(certificate));
  } catch (err) {
    console.error("FairPlay certificate request failed:", err.message);
    res.status(500).json({ error: "Certificate request failed" });
  }
}