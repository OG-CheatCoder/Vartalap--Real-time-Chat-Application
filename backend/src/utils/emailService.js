import dns from "dns/promises";
import net from "net";
import nodemailer from "nodemailer";
import validator from "validator";

const BLOCKED_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "invalid.com",
  "localhost",
  "asdf.com",
  "asdfg.com",
  "asdfgh.com",
  "qwerty.com",
  "zxcv.com",
  "fake.com",
  "mailinator.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "guerrillamail.com",
  "10minutemail.com",
  "trashmail.com",
  "fakeinbox.com",
  "sharklasers.com",
]);

let cachedTransporter = null;

const getTransporter = () => {
  if (cachedTransporter) return cachedTransporter;

  const port = Number(process.env.SMTP_PORT) || 587;
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return cachedTransporter;
};

// Explicit public DNS resolver avoids Windows Node c-ares localhost ::1 ECONNREFUSED bug
const mxResolver = new dns.Resolver();
mxResolver.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);

const resolveMxWithTimeout = async (domain, timeoutMs = 4000) => {
  try {
    return await Promise.race([
      mxResolver.resolveMx(domain),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("DNS_TIMEOUT")), timeoutMs)
      ),
    ]);
  } catch (err) {
    if (err.code === "ENOTFOUND" || err.code === "ENODATA") throw err;
    await dns.lookup(domain);
    return [{ exchange: domain, priority: 10 }];
  }
};

const isMailboxRejectedMessage = (msg = "") =>
  /5\.1\.1|nosuchuser|user unknown|unknown user|no such user|does not exist|invalid mailbox|recipient address rejected.*unknown|mailbox unavailable/i.test(
    msg
  );

// Connects directly to target domain's MX server (port 25) to verify mailbox existence
// and detect catch-all sinkhole domains (without tripping over Spamhaus/rDNS IP blocks).
const verifyMailboxViaSmtp = (mxHost, targetEmail, domain, timeoutMs = 4500) =>
  new Promise((resolve) => {
    const senderProbe = process.env.SMTP_USER || "verify@gmail.com";
    const fakeProbe = `vartalap_probe_918273645@${domain}`;
    const socket = net.createConnection(25, mxHost);

    let step = 0; // 0:banner, 1:ehlo, 2:mailfrom, 3:rcpt target, 4:rcpt catch-all probe
    let buffer = "";
    let finished = false;

    const done = (result) => {
      if (finished) return;
      finished = true;
      try {
        socket.write("QUIT\r\n");
      } catch {}
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => done({ conclusive: false }));
    socket.on("error", () => done({ conclusive: false }));

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      if (!buffer.includes("\n")) return;
      const lines = buffer.trim().split(/\r?\n/);
      const lastLine = lines[lines.length - 1];
      // Multi-line SMTP responses have '-' after code (e.g. "250-PIPELINING")
      if (/^\d{3}-/.test(lastLine)) return;
      buffer = "";

      if (step === 0 && lastLine.startsWith("220")) {
        step = 1;
        socket.write("EHLO vartalap.local\r\n");
      } else if (step === 1 && lastLine.startsWith("250")) {
        step = 2;
        socket.write(`MAIL FROM:<${senderProbe}>\r\n`);
      } else if (step === 2 && lastLine.startsWith("250")) {
        step = 3;
        socket.write(`RCPT TO:<${targetEmail}>\r\n`);
      } else if (step === 3) {
        if (lastLine.startsWith("250")) {
          // Run catch-all probe to catch sinkhole domains (e.g., asdf.com)
          step = 4;
          socket.write(`RCPT TO:<${fakeProbe}>\r\n`);
        } else if (/^5\d\d/.test(lastLine) && isMailboxRejectedMessage(lastLine)) {
          done({ conclusive: true, exists: false, reason: "mailbox_not_found" });
        } else {
          // Non-user blocks like rDNS or Spamhaus on residential IP -> defer to OTP delivery
          done({ conclusive: false });
        }
      } else if (step === 4) {
        if (lastLine.startsWith("250")) {
          done({ conclusive: true, exists: false, reason: "catch_all_sinkhole" });
        } else {
          done({ conclusive: true, exists: true });
        }
      } else if (/^[45]\d\d/.test(lastLine)) {
        done({ conclusive: false });
      }
    });
  });

/**
 * Validates syntax, blocks known fake/disposable domains, checks DNS MX records,
 * and probes MX SMTP mailbox existence + catch-all status.
 */
export const validateRealEmail = async (rawEmail) => {
  const email = (rawEmail || "").toLowerCase().trim();

  if (!validator.isEmail(email, { allow_utf8_local_part: false })) {
    return { valid: false, reason: "Please enter a valid email address format." };
  }

  const [, domain] = email.split("@");
  if (!domain || !domain.includes(".")) {
    return { valid: false, reason: "Email domain is invalid." };
  }

  const tld = domain.split(".").pop();
  if (!tld || !/^[a-z]{2,}$/.test(tld) || BLOCKED_DOMAINS.has(domain)) {
    return {
      valid: false,
      reason: "Please use a real, active email address (placeholder/disposable domains are not allowed).",
    };
  }

  let mxRecords;
  try {
    mxRecords = await resolveMxWithTimeout(domain);
  } catch (err) {
    if (err.code === "DNS_TIMEOUT" || err.message === "DNS_TIMEOUT") {
      return {
        valid: false,
        reason: `Could not verify mail server for "${domain}". Please check your email address.`,
      };
    }
    return {
      valid: false,
      reason: `Email domain "${domain}" does not exist or cannot receive mail.`,
    };
  }

  const validMx = (mxRecords || [])
    .filter((r) => r.exchange && r.exchange !== "." && r.exchange !== "localhost")
    .sort((a, b) => a.priority - b.priority);

  if (validMx.length === 0) {
    return {
      valid: false,
      reason: `The domain "${domain}" is not configured to receive emails.`,
    };
  }

  const probe = await verifyMailboxViaSmtp(validMx[0].exchange, email, domain);
  if (probe.conclusive && !probe.exists) {
    if (probe.reason === "catch_all_sinkhole") {
      return {
        valid: false,
        reason: `Cannot verify "${email}" because "${domain}" accepts unverified catch-all addresses. Use a real personal/institutional email.`,
      };
    }
    return {
      valid: false,
      reason: `The email "${email}" does not exist on ${domain}. Please check for typos.`,
    };
  }

  return { valid: true };
};

/**
 * Sends a real 6-digit OTP verification email via Nodemailer SMTP.
 */
export const sendOtpEmail = async (toEmail, otpCode, fullName = "User") => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP credentials are not configured on the server.");
  }

  const transporter = getTransporter();
  const safeName = validator.escape(fullName.trim() || "User");

  await transporter.sendMail({
    from: `"Vartalap Messenger" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: `${otpCode} is your Vartalap verification code`,
    text: `Hi ${safeName},\n\nYour Vartalap verification OTP is: ${otpCode}\nThis code expires in 5 minutes.\n\nIf you did not request this, please ignore this email.`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0f172a; color: #e2e8f0; border-radius: 16px; padding: 32px; border: 1px solid #1e293b;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; width: 44px; height: 44px; line-height: 44px; border-radius: 12px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #ffffff; font-weight: bold; font-size: 20px;">V</div>
          <h2 style="margin: 12px 0 4px; color: #f8fafc; font-size: 20px;">Verify Your Email</h2>
          <p style="margin: 0; color: #94a3b8; font-size: 13px;">Hi ${safeName}, welcome to Vartalap!</p>
        </div>
        <div style="background: #020617; border: 1px solid #334155; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 20px;">
          <p style="margin: 0 0 8px; font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">Your 6-Digit Verification OTP</p>
          <div style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #818cf8;">${otpCode}</div>
        </div>
        <p style="margin: 0; font-size: 12px; color: #64748b; text-align: center;">
          This code expires in <strong>5 minutes</strong>. Do not share this code with anyone.
        </p>
      </div>
    `,
  });
};
