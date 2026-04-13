import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

const getGmailClient = () => {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground",
  );
  oAuth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });
  return google.gmail({ version: "v1", auth: oAuth2Client });
};

const APP_NAME = process.env.APP_NAME || "التطبيق";
const APP_COLOR = process.env.APP_COLOR || "#007a3d";

const encodeUtf8 = (str) =>
  `=?UTF-8?B?${Buffer.from(str, "utf-8").toString("base64")}?=`;

const buildRawEmail = (to, subject, html, replyTo = null) => {
  const headers = [
    `From: ${encodeUtf8(APP_NAME)} <${process.env.MAIL}>`,
    `To: ${to}`,
    `Subject: ${encodeUtf8(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
  ];
  if (replyTo) headers.push(`Reply-To: ${replyTo}`);
  const email =
    headers.join("\r\n") +
    "\r\n\r\n" +
    Buffer.from(html, "utf-8").toString("base64");
  return Buffer.from(email)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const sendRaw = async (to, subject, html, replyTo = null) => {
  const gmail = getGmailClient();
  const raw = buildRawEmail(to, subject, html, replyTo);
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
};

// ─── Shared base template ────────────────────────────────────────────────────
const baseTemplate = (bodyContent) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;
              padding: 20px; background-color: #f4f6f9; border-radius: 10px; direction: rtl;">
    <div style="background-color: #fff; padding: 30px; border-radius: 8px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      ${bodyContent}
    </div>
    <div style="text-align: center; margin-top: 20px; color: #95a5a6; font-size: 14px;">
      © ${new Date().getFullYear()} ${APP_NAME}. جميع الحقوق محفوظة.
    </div>
  </div>
`;

const otpBlock = (otp, color) => `
  <div style="background-color: ${color}; color: #fff; font-size: 32px; font-weight: bold;
              text-align: center; padding: 20px; border-radius: 8px; margin: 25px 0;
              letter-spacing: 10px;">
    ${otp}
  </div>
`;

// ─── Email Verification OTP ──────────────────────────────────────────────────
const sendVerificationEmail = async (email, otp) => {
  const html = baseTemplate(`
    <h2 style="color: #333; text-align: center; margin-bottom: 20px;">تأكيد البريد الإلكتروني</h2>
    <p style="color: #555; font-size: 16px; text-align: center; line-height: 1.6;">
      أدخل الكود التالي لتأكيد بريدك الإلكتروني.<br/>
      <span style="color: #999; font-size: 13px;">صالح لمدة 10 دقائق فقط.</span>
    </p>
    ${otpBlock(otp, APP_COLOR)}
    <p style="color: #999; font-size: 13px; text-align: center;">
      إذا لم تطلب هذا الكود، تجاهل هذا البريد.
    </p>
  `);
  await sendRaw(email, "كود تأكيد البريد الإلكتروني", html);
  console.log("✅ تم إرسال كود التحقق إلى:", email);
};

// ─── General mail (codes / notifications) ───────────────────────────────────
const sendMail = async (email, code, title, message) => {
  try {
    const html = baseTemplate(`
      <h2 style="color: #333; text-align: center; margin-bottom: 20px;">${title}</h2>
      <p style="color: #555; font-size: 16px; line-height: 1.6; text-align: center;">${message}</p>
      <div style="background-color: ${APP_COLOR}; color: #fff; font-size: 22px; font-weight: bold;
                  text-align: center; padding: 15px; border-radius: 5px; margin: 25px 0;">
        ${code}
      </div>
    `);
    await sendRaw(email, title, html);
    console.log("✅ تم إرسال البريد إلى:", email);
    return true;
  } catch (error) {
    console.error("❌ خطأ أثناء إرسال البريد:", error);
    throw error;
  }
};
const sendPasswordResetEmail = async (email, otp) => {
  const html = baseTemplate(`
    <h2 style="color: #333; text-align: center; margin-bottom: 20px;">إعادة تعيين كلمة المرور</h2>
    <p style="color: #555; font-size: 16px; text-align: center; line-height: 1.6;">
      استخدم الكود التالي لإعادة تعيين كلمة المرور.<br/>
      <span style="color: #999; font-size: 13px;">صالح لمدة 10 دقائق فقط.</span>
    </p>
    ${otpBlock(otp, "#e74c3c")}
    <p style="color: #999; font-size: 13px; text-align: center;">
      إذا لم تطلب إعادة تعيين كلمة المرور، تجاهل هذا البريد وحسابك بأمان.
    </p>
  `);
  await sendRaw(email, "إعادة تعيين كلمة المرور", html);
  console.log("✅ تم إرسال كود إعادة التعيين إلى:", email);
};

// ─── User → Team contact message ─────────────────────────────────────────────
const sendMailFromUserToTeam = async (message) => {
  try {
    const subject = `رسالة من ${message.name} عبر موقع ${APP_NAME}`;
    const html = baseTemplate(`
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 15px;">
        <strong style="color: ${APP_COLOR}; font-size: 18px;">الاسم:</strong>
        <span style="color: #2c3e50; font-size: 16px; display: block; margin-top: 5px;">${message.name}</span>
      </div>
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 15px;">
        <strong style="color: ${APP_COLOR}; font-size: 18px;">البريد الإلكتروني:</strong>
        <a href="mailto:${message.email}" style="color: #2c3e50; font-size: 16px; display: block; margin-top: 5px;">${message.email}</a>
      </div>
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 15px;">
        <strong style="color: ${APP_COLOR}; font-size: 18px;">رقم الهاتف:</strong>
        <a href="tel:${message.phone}" style="color: #2c3e50; font-size: 16px; display: block; margin-top: 5px;">${message.phone}</a>
      </div>
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
        <strong style="color: ${APP_COLOR}; font-size: 18px;">الرسالة:</strong>
        <p style="color: #2c3e50; font-size: 16px; line-height: 1.6; margin-top: 10px;">${message.message}</p>
      </div>
    `);
    await sendRaw(process.env.MAIL, subject, html, message.email);
    console.log("✅ تم إرسال رسالة المستخدم إلى الفريق");
    return true;
  } catch (error) {
    console.error("❌ خطأ أثناء إرسال البريد:", error);
    return false;
  }
};

// ─── Welcome email ───────────────────────────────────────────────────────────
const sendWelcomeEmail = (email, username) => {
  const title = `مرحبًا بك في ${APP_NAME} 👋`;
  const message = `
    <p style="font-size: 16px; color: #2c3e50; line-height: 1.6; text-align:center;">مرحبًا ${username} 👋</p>
    <p style="font-size: 16px; color: #2c3e50; line-height: 1.6; text-align:center;">يسعدنا انضمامك إلينا.</p>
  `;
  const code = `<a href='${process.env.FRONTEND_URL || "#"}' style="display:inline-block; background-color:${APP_COLOR};
    color:white; padding:12px 20px; border-radius:5px; text-decoration:none; font-size:16px; margin-top:10px;">
    ابدأ الآن
  </a>`;
  sendMail(email, code, title, message);
};

// ─── Bulk email ──────────────────────────────────────────────────────────────
const sendBulkEmail = async (users, subject, message) => {
  try {
    const results = { successful: [], failed: [] };
    for (const user of users) {
      try {
        const html = baseTemplate(`
          <h2 style="color: #333; text-align: center; margin-bottom: 20px;">${subject}</h2>
          <div style="color: #555; font-size: 16px; line-height: 1.6; text-align: center;">${message}</div>
          ${
            user.name
              ? `<div style="margin-top:20px; padding:15px; background-color:#f8f9fa; border-radius:8px; text-align:center;">
            <p style="margin:0; color:${APP_COLOR}; font-weight:bold;">مرحبًا ${user.name} 👋</p>
          </div>`
              : ""
          }
        `);
        await sendRaw(user.email, subject, html);
        results.successful.push({
          name: user.name,
          email: user.email,
          userId: user._id,
        });
      } catch (error) {
        results.failed.push({
          name: user.name,
          email: user.email,
          userId: user._id,
          error: error.message,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return {
      success: true,
      message: `تم إرسال البريد إلى ${results.successful.length} من ${users.length} مستخدم`,
      results,
    };
  } catch (error) {
    return {
      success: false,
      message: "حدث خطأ أثناء إرسال البريد",
      error: error.message,
    };
  }
};

// ─── Blog notification ───────────────────────────────────────────────────────
const sendBlogNotification = async (users, blog) => {
  try {
    const results = { successful: [], failed: [] };
    const stripHtml = (html) =>
      html
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const preview = stripHtml(blog.text);
    const emailPreview =
      preview.length > 150 ? preview.substring(0, 150) + "..." : preview;

    for (const user of users) {
      try {
        const subject = `مدونة جديدة في ${APP_NAME}: ${blog.title}`;
        const html = baseTemplate(`
          <h2 style="color: #333; text-align: center; margin-bottom: 20px;">📚 مدونة جديدة متاحة!</h2>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="color: #333; margin-bottom: 10px; text-align: center;">${blog.title}</h3>
            ${blog.type ? `<p style="color:#666; text-align:center;"><strong>التصنيف:</strong> ${blog.type}</p>` : ""}
            <p style="color: #555; line-height: 1.6; text-align: center; font-size: 14px;">${emailPreview}</p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
          </div>
          ${
            user.name
              ? `<div style="margin-top:20px; padding:15px; background:#f8f9fa; border-radius:8px; text-align:center;">
            <p style="margin:0; color:${APP_COLOR}; font-weight:bold;">مرحبًا ${user.name} 👋</p>
          </div>`
              : ""
          }
        `);
        await sendRaw(user.email, subject, html);
        results.successful.push({
          name: user.name,
          email: user.email,
          userId: user._id,
        });
      } catch (error) {
        results.failed.push({
          name: user.name,
          email: user.email,
          userId: user._id,
          error: error.message,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return {
      success: true,
      message: `تم إرسال إشعار المدونة إلى ${results.successful.length} من ${users.length} مستخدم`,
      results,
    };
  } catch (error) {
    return {
      success: false,
      message: "حدث خطأ أثناء إرسال إشعارات المدونة",
      error: error.message,
    };
  }
};

export {
  sendMail,
  sendMailFromUserToTeam,
  sendWelcomeEmail,
  sendBulkEmail,
  sendBlogNotification,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
