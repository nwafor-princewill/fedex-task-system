// server.js
require('dotenv').config();
const express = require('express');
const { Resend } = require('resend');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Translation helper function
const translations = {};

const loadTranslations = () => {
  try {
    translations.en = require('./translations/en.json');
    translations['pt-br'] = require('./translations/pt-br.json');
    translations.es = require('./translations/es.json');
    console.log('✅ Translations loaded successfully');
  } catch (error) {
    console.error('❌ Error loading translations:', error);
    translations.en = { email: {}, result: {} };
    translations['pt-br'] = { email: {}, result: {} };
    translations.es = { email: {}, result: {} };
  }
};

// Initialize translations
loadTranslations();

// Translation function with placeholder replacement
const t = (key, lang = 'en', replacements = {}) => {
  const keys = key.split('.');
  let value = translations[lang] || translations.en;
  
  for (const k of keys) {
    value = value?.[k];
    if (!value) {
      value = translations.en;
      for (const fallbackKey of keys) {
        value = value?.[fallbackKey];
        if (!value) break;
      }
      break;
    }
  }
  
  if (!value) return key;
  
  let translatedText = value;
  for (const [placeholder, replacement] of Object.entries(replacements)) {
    const regex = new RegExp(`{${placeholder}}`, 'g');
    translatedText = translatedText.replace(regex, replacement);
  }
  
  return translatedText;
};

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Configure multer for temporary file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './tmp';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Store active tokens
const activeTokens = new Map();

// Function to generate free map image URL
const generateMapImageUrl = (address, width = 600, height = 300) => {
  if (!address || address.trim() === '' || address === 'Not specified') {
    return null;
  }
  
  const encodedAddress = encodeURIComponent(address.trim());
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/pin-l-marker+ff0000(${encodedAddress})/${encodedAddress},12/${width}x${height}@2x?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw`;
};

// Function to generate Google Maps link
const generateGoogleMapsLink = (address) => {
  if (!address || address.trim() === '' || address === 'Not specified') {
    return null;
  }
  
  const encodedAddress = encodeURIComponent(address.trim());
  return `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
};

// Routes
app.get('/', (req, res) => {
  res.render('index');
});

app.post('/send-task', upload.fields([
  { name: 'taskImage', maxCount: 1 },
  { name: 'pickupLocationImage', maxCount: 1 },
  { name: 'deliveryLocationImage', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('Received task request');
    
    const {
      recipientEmail,
      recipientName,
      taskName,
      specialId,
      priority,
      estimatedTime,
      weight,
      dimensions,
      value,
      address1,
      deliveryAddress,
      emailLanguage
    } = req.body;

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');
    const expiryTime = new Date(Date.now() + 20 * 60 * 1000);

    // Store token
    activeTokens.set(token, {
      recipientEmail,
      taskName,
      expiryTime,
      authorized: false,
      emailLanguage: emailLanguage || 'en'
    });

    // Set expiry timer
    setTimeout(() => {
      activeTokens.delete(token);
    }, 20 * 60 * 1000);

    let imageUrl = null;
    let pickupLocationImageUrl = null;
    let deliveryLocationImageUrl = null;
    
    // Upload task image to Cloudinary if exists
    if (req.files && req.files.taskImage && req.files.taskImage[0]) {
      console.log('Uploading task image to Cloudinary...');
      try {
        const result = await cloudinary.uploader.upload(req.files.taskImage[0].path, {
          folder: 'fedex-packages',
          quality: 'auto',
          fetch_format: 'auto'
        });
        imageUrl = result.secure_url;
        console.log('Task image uploaded to Cloudinary:', imageUrl);
        
        // Clean up temporary file
        fs.unlinkSync(req.files.taskImage[0].path);
      } catch (uploadError) {
        console.error('Cloudinary upload failed:', uploadError);
        if (fs.existsSync(req.files.taskImage[0].path)) {
          fs.unlinkSync(req.files.taskImage[0].path);
        }
        throw new Error('Failed to upload task image');
      }
    }

    // Upload pickup location image to Cloudinary if exists
    if (req.files && req.files.pickupLocationImage && req.files.pickupLocationImage[0]) {
      console.log('Uploading pickup location image to Cloudinary...');
      try {
        const result = await cloudinary.uploader.upload(req.files.pickupLocationImage[0].path, {
          folder: 'fedex-pickup-locations',
          quality: 'auto',
          fetch_format: 'auto'
        });
        pickupLocationImageUrl = result.secure_url;
        console.log('Pickup location image uploaded to Cloudinary:', pickupLocationImageUrl);
        
        // Clean up temporary file
        fs.unlinkSync(req.files.pickupLocationImage[0].path);
      } catch (uploadError) {
        console.error('Pickup location image upload failed:', uploadError);
        if (fs.existsSync(req.files.pickupLocationImage[0].path)) {
          fs.unlinkSync(req.files.pickupLocationImage[0].path);
        }
        throw new Error('Failed to upload pickup location image');
      }
    }

    // Upload delivery location image to Cloudinary if exists
    if (req.files && req.files.deliveryLocationImage && req.files.deliveryLocationImage[0]) {
      console.log('Uploading delivery location image to Cloudinary...');
      try {
        const result = await cloudinary.uploader.upload(req.files.deliveryLocationImage[0].path, {
          folder: 'fedex-delivery-locations',
          quality: 'auto',
          fetch_format: 'auto'
        });
        deliveryLocationImageUrl = result.secure_url;
        console.log('Delivery location image uploaded to Cloudinary:', deliveryLocationImageUrl);
        
        // Clean up temporary file
        fs.unlinkSync(req.files.deliveryLocationImage[0].path);
      } catch (uploadError) {
        console.error('Delivery location image upload failed:', uploadError);
        if (fs.existsSync(req.files.deliveryLocationImage[0].path)) {
          fs.unlinkSync(req.files.deliveryLocationImage[0].path);
        }
        throw new Error('Failed to upload delivery location image');
      }
    }

    const packageData = {
      recipientName,
      taskName,
      specialId: specialId || `FDX${Date.now().toString().slice(-6)}`,
      priority: priority || 'Standard',
      createdDate: new Date().toLocaleDateString(),
      estimatedTime: estimatedTime || '2-3 business days',
      weight: weight || 'N/A',
      dimensions: dimensions || 'N/A',
      value: value || 'N/A',
      address1: address1 || 'Not specified',
      address1GoogleLink: generateGoogleMapsLink(address1),
      address1MapImage: generateMapImageUrl(address1),
      deliveryAddress: deliveryAddress || 'Not specified',
      deliveryAddressGoogleLink: generateGoogleMapsLink(deliveryAddress),
      deliveryAddressMapImage: generateMapImageUrl(deliveryAddress),
      pickupLocationImageUrl: pickupLocationImageUrl,
      deliveryLocationImageUrl: deliveryLocationImageUrl,
      imageUrl: imageUrl,
      authUrl: `${req.protocol}://${req.get('host')}/authorize/${token}`,
      token,
      emailLanguage: emailLanguage || 'en'
    };

    const emailHtml = await generateEmailHtml(packageData);

    // Use translated subject
    const emailSubject = t('email.subject', packageData.emailLanguage, { 
      packageName: taskName, 
      specialId: packageData.specialId 
    });

    // Send email using Resend
    console.log('Sending email via Resend to:', recipientEmail, 'in language:', packageData.emailLanguage);
    
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'FedEx Delivery <noreply@zenatrust.com>',
      to: recipientEmail,
      subject: emailSubject,
      html: emailHtml
    });

    if (error) {
      console.error('Resend error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log('Email sent successfully via Resend!', data);

    res.json({ 
      success: true, 
      message: 'Package notification sent successfully!',
      specialId: packageData.specialId,
      token: token
    });

  } catch (error) {
    console.error('Error in /send-task:', error);
    
    // Clean up temporary files if they exist
    if (req.files) {
      if (req.files.taskImage && req.files.taskImage[0] && fs.existsSync(req.files.taskImage[0].path)) {
        fs.unlinkSync(req.files.taskImage[0].path);
      }
      if (req.files.pickupLocationImage && req.files.pickupLocationImage[0] && fs.existsSync(req.files.pickupLocationImage[0].path)) {
        fs.unlinkSync(req.files.pickupLocationImage[0].path);
      }
      if (req.files.deliveryLocationImage && req.files.deliveryLocationImage[0] && fs.existsSync(req.files.deliveryLocationImage[0].path)) {
        fs.unlinkSync(req.files.deliveryLocationImage[0].path);
      }
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send notification: ' + error.message
    });
  }
});

app.get('/authorize/:token', async (req, res) => {
  const token = req.params.token;
  const tokenData = activeTokens.get(token);

  if (!tokenData) {
    const lang = 'en';
    return res.render('result', {
      success: false,
      title: t('result.linkExpired', lang),
      message: t('result.linkExpiredMessage', lang),
      subMessage: t('result.linkExpiredSub', lang)
    });
  }

  const lang = tokenData.emailLanguage || 'en';

  if (new Date() > tokenData.expiryTime) {
    activeTokens.delete(token);
    return res.render('result', {
      success: false,
      title: t('result.linkExpired', lang),
      message: t('result.linkExpiredTime', lang),
      subMessage: t('result.linkExpiredSub', lang)
    });
  }

  // Mark as authorized
  tokenData.authorized = true;
  activeTokens.set(token, tokenData);

  // Send notification to admin using Resend
  try {
    const notificationHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background: linear-gradient(135deg, #4d148c, #6c63ff); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">FedEx Authorization Alert</h1>
        </div>
        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
          <h2 style="color: #28a745; margin-bottom: 20px;">✅ Package Authorized Successfully!</h2>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 10px 0;"><strong>Package:</strong> ${tokenData.taskName || tokenData.packageName}</p>
            <p style="margin: 10px 0;"><strong>Recipient:</strong> ${tokenData.recipientEmail}</p>
            <p style="margin: 10px 0;"><strong>Language:</strong> ${lang.toUpperCase()}</p>
            <p style="margin: 10px 0;"><strong>Authorization Time:</strong> ${new Date().toLocaleString()}</p>
            <p style="margin: 10px 0;"><strong>Token:</strong> ${token}</p>
          </div>
          <p style="color: #666;">This package has been authorized by the recipient and is ready for processing.</p>
        </div>
      </div>
    `;

    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'FedEx Delivery <noreply@zenatrust.com>',
      to: process.env.EMAIL_USER || 'fedexcompany81060@gmail.com',
      subject: `🔓 Package Authorization Notification - ${tokenData.taskName || tokenData.packageName}`,
      html: notificationHtml
    });

    console.log('Authorization notification sent to admin via Resend');
  } catch (error) {
    console.error('Failed to send authorization notification:', error);
  }

  if (tokenData.type === 'suspended') {
    res.render('result', {
      success: true,
      title: t('result.authSuccessful', lang),
      message: t('result.suspendedAuthMessage', lang, { packageName: tokenData.packageName }),
      subMessage: t('result.suspendedAuthSub', lang)
    });
  } else {
    res.render('result', {
      success: true,
      title: t('result.authSuccessful', lang),
      message: t('result.authSuccessfulMessage', lang, { taskName: tokenData.taskName }),
      subMessage: t('result.authSuccessfulSub', lang)
    });
  }
});

app.get('/status/:token', (req, res) => {
  const token = req.params.token;
  const tokenData = activeTokens.get(token);

  if (!tokenData) {
    return res.json({ exists: false, message: 'Token not found' });
  }

  res.json({
    exists: true,
    authorized: tokenData.authorized,
    expired: new Date() > tokenData.expiryTime,
    taskName: tokenData.taskName,
    timeRemaining: Math.max(0, tokenData.expiryTime - new Date())
  });
});

async function generateEmailHtml(data) {
  const lang = data.emailLanguage || 'en';
  
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FedEx Package Delivery</title>
    <style>
        body { margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; }
        .header { background: #4d148c; color: white; padding: 20px; text-align: center; }
        .logo { font-size: 24px; font-weight: bold; }
        .content { padding: 20px; }
        .tracking-info { background: #f8f9fa; padding: 15px; border-left: 4px solid #4d148c; margin: 20px 0; }
        .section { margin: 20px 0; }
        .section h3 { color: #4d148c; border-bottom: 2px solid #eee; padding-bottom: 5px; }
        .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; }
        .detail-item { padding: 8px; background: #f8f9fa; border-radius: 4px; }
        .detail-label { font-weight: bold; color: #333; }
        .detail-value { color: #666; }
        .task-image { text-align: center; margin: 20px 0; }
        .task-image img { max-width: 100%; height: auto; border-radius: 8px; border: 2px solid #ddd; }
        .auth-section { background: #fff3cd; padding: 20px; border: 1px solid #ffeaa7; border-radius: 8px; text-align: center; margin: 20px 0; }
        .auth-button { display: inline-block; padding: 12px 30px; background: #4d148c; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 0; }
        .auth-button:hover { background: #3d0f73; }
        .warning { color: #856404; font-size: 14px; margin-top: 10px; }
        .footer { background: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; }
        .priority-high { color: #dc3545; font-weight: bold; }
        .priority-standard { color: #28a745; }
        .priority-low { color: #6c757d; }
        .map-container { margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; text-align: center; }
        .map-title { color: #4d148c; font-weight: bold; margin-bottom: 10px; text-align: left; }
        .map-image { max-width: 100%; height: auto; border-radius: 8px; border: 2px solid #ddd; margin: 10px 0; }
        .map-button { display: inline-block; padding: 8px 16px; background: #4285f4; color: white; text-decoration: none; border-radius: 4px; font-size: 14px; margin: 5px 0; }
        .map-button:hover { background: #3367d6; }
        .map-instruction { color: #666; font-size: 12px; margin-top: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header" style="background: linear-gradient(135deg, #4d148c, #6c63ff); padding: 25px; text-align: center; border-bottom: 4px solid #ff6600;">
            <div style="font-size: 32px; font-weight: bold; margin-bottom: 10px;">
                <span style="color: white;">Fed</span>
                <span style="color: #FF6600;">Ex</span>
                <span style="color: white; font-size: 24px; vertical-align: super;">®</span>
            </div>
            <div style="color: white; font-size: 18px; opacity: 0.9; letter-spacing: 1px;">
                PACKAGE DELIVERY NOTIFICATION
            </div>
        </div>
        <!-- Content -->
        <div class="content">
            <div class="tracking-info">
                <h2 style="margin: 0 0 10px 0; color: #4d148c;">${t('email.greeting', lang, { recipientName: data.recipientName })}</h2>
                <p style="margin: 0; font-size: 16px;">${t('email.packageReceived', lang, { packageName: data.taskName })}</p>
                <p style="margin: 5px 0 0 0; color: #666;">${t('email.trackingId', lang, { specialId: data.specialId })}</p>
            </div>

            <!-- Package Image -->
            ${data.imageUrl ? `
            <div class="task-image">
                <h3 style="color: #4d148c;">${t('email.packagePreview', lang)}</h3>
                <img src="${data.imageUrl}" alt="Package Image" />
            </div>
            ` : ''}

            <!-- Basic Details -->
            <div class="section">
                <h3>${t('email.basicDetails', lang)}</h3>
                <div class="details-grid">
                    <div class="detail-item">
                        <div class="detail-label">${t('email.packageName', lang)}</div>
                        <div class="detail-value">${data.taskName}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">${t('email.specialId', lang)}</div>
                        <div class="detail-value">${data.specialId}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">${t('email.priority', lang)}</div>
                        <div class="detail-value priority-${data.priority.toLowerCase()}">${data.priority}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">${t('email.assignedTo', lang)}</div>
                        <div class="detail-value">${data.recipientName}</div>
                    </div>
                </div>
            </div>

            <!-- Timeline -->
            <div class="section">
                <h3>${t('email.timeline', lang)}</h3>
                <div class="details-grid">
                    <div class="detail-item">
                        <div class="detail-label">${t('email.created', lang)}</div>
                        <div class="detail-value">${data.createdDate}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">${t('email.estimatedDelivery', lang)}</div>
                        <div class="detail-value">${data.estimatedTime}</div>
                    </div>
                </div>
            </div>

            <!-- Specifications -->
            <div class="section">
                <h3>${t('email.specifications', lang)}</h3>
                <div class="details-grid">
                    <div class="detail-item">
                        <div class="detail-label">${t('email.weight', lang)}</div>
                        <div class="detail-value">${data.weight}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">${t('email.dimensions', lang)}</div>
                        <div class="detail-value">${data.dimensions}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">${t('email.value', lang)}</div>
                        <div class="detail-value">${data.value}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">${t('email.pickupAddress', lang)}</div>
                        <div class="detail-value">${data.address1}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">${t('email.deliveryAddress', lang)}</div>
                        <div class="detail-value">${data.deliveryAddress}</div>
                    </div>
                </div>
            </div>

            <!-- Embedded Maps -->
            ${(data.address1MapImage || data.pickupLocationImageUrl || data.deliveryAddressMapImage || data.deliveryLocationImageUrl) ? `
            <div class="section">
                <h3>${t('email.pickupLocation', lang)}</h3>
                
                ${data.address1 !== 'Not specified' && data.address1MapImage ? `
                <div class="map-container">
                    <div class="map-title">📍 ${t('email.pickupLocation', lang)}: ${data.address1}</div>
                    ${data.address1GoogleLink ? `
                    <div>
                        <a href="${data.address1GoogleLink}" target="_blank" class="map-button">
                            ${t('email.openGoogleMaps', lang)}
                        </a>
                        <p class="map-instruction">${t('email.mapInstruction', lang)}</p>
                    </div>
                    ` : ''}
                </div>
                ` : ''}
                
                ${data.pickupLocationImageUrl ? `
                <div class="map-container">
                    <div class="map-title">${t('email.pickupLocationPicture', lang)}</div>
                    <img src="${data.pickupLocationImageUrl}" alt="Pickup Location" class="map-image" />
                    <p class="map-instruction">${t('email.pickupAddressCaption', lang)}</p>
                </div>
                ` : ''}

                ${data.deliveryAddress !== 'Not specified' && data.deliveryAddressMapImage ? `
                <div class="map-container">
                    <div class="map-title">📍 ${t('email.deliveryLocation', lang)}: ${data.deliveryAddress}</div>
                    ${data.deliveryAddressGoogleLink ? `
                    <div>
                        <a href="${data.deliveryAddressGoogleLink}" target="_blank" class="map-button">
                            ${t('email.openGoogleMaps', lang)}
                        </a>
                        <p class="map-instruction">${t('email.mapInstruction', lang)}</p>
                    </div>
                    ` : ''}
                </div>
                ` : ''}
                
                ${data.deliveryLocationImageUrl ? `
                <div class="map-container">
                    <div class="map-title">${t('email.deliveryLocationPicture', lang)}</div>
                    <img src="${data.deliveryLocationImageUrl}" alt="Delivery Location" class="map-image" />
                    <p class="map-instruction">${t('email.deliveryAddressCaption', lang)}</p>
                </div>
                ` : ''}
            </div>
            ` : ''}

            <!-- Authorization Section -->
            <div class="auth-section">
                <h3 style="margin-top: 0; color: #856404;">${t('email.authorizationRequired', lang)}</h3>
                <p>${t('email.authMessage', lang)}</p>
                <a href="${data.authUrl}" class="auth-button">${t('email.authorizeButton', lang)}</a>
                <div class="warning">${t('email.linkExpiry', lang)}</div>
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <p>${t('email.footerText', lang)}</p>
            <p>${t('email.footerContact', lang)}</p>
        </div>
    </div>
</body>
</html>
  `;
}

app.post('/send-suspended-package', upload.single('packageImage'), async (req, res) => {
  try {
    console.log('Received suspended package request');
    
    const {
      recipientEmail,
      recipientName,
      packageName,
      specialId,
      clearanceFee,
      customsReason,
      distributionHub,
      contactMessage,
      emailLanguage
    } = req.body;

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');
    const expiryTime = new Date(Date.now() + 20 * 60 * 1000);

    // Store token
    activeTokens.set(token, {
      recipientEmail,
      packageName,
      expiryTime,
      authorized: false,
      type: 'suspended',
      emailLanguage: emailLanguage || 'en'
    });

    // Set expiry timer
    setTimeout(() => {
      activeTokens.delete(token);
    }, 20 * 60 * 1000);

    let imageUrl = null;
    
    // Upload to Cloudinary if image exists
    if (req.file) {
      console.log('Uploading package image to Cloudinary...');
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'fedex-suspended-packages',
          quality: 'auto',
          fetch_format: 'auto'
        });
        imageUrl = result.secure_url;
        console.log('Package image uploaded to Cloudinary:', imageUrl);
        
        // Clean up temporary file
        fs.unlinkSync(req.file.path);
      } catch (uploadError) {
        console.error('Cloudinary upload failed:', uploadError);
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        throw new Error('Failed to upload package image');
      }
    }

    const packageData = {
      recipientName,
      packageName,
      specialId: specialId || `SPD${Date.now().toString().slice(-6)}`,
      clearanceFee: clearanceFee || 'Not specified',
      customsReason: customsReason || 'Outstanding customs charge',
      distributionHub: distributionHub || 'Main distribution hub',
      contactMessage: contactMessage || 'You need to pay the clearance fee before your package can be distributed. For more information contact our customer service.',
      imageUrl: imageUrl,
      authUrl: `${req.protocol}://${req.get('host')}/authorize/${token}`,
      token,
      whatsappNumber: '+2348076658330',
      telegramLink: 'https://t.me/FedEx_Customer_Service0',
      emailLanguage: emailLanguage || 'en'
    };

    const emailHtml = generateSuspendedPackageEmail(packageData);

    // Use translated subject
    const emailSubject = t('email.suspendedSubject', packageData.emailLanguage, { 
      packageName: packageName, 
      specialId: packageData.specialId 
    });

    // Send email using Resend
    console.log('Sending suspended package email via Resend to:', recipientEmail, 'in language:', packageData.emailLanguage);
    
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'FedEx Delivery <noreply@zenatrust.com>',
      to: recipientEmail,
      subject: emailSubject,
      html: emailHtml
    });

    if (error) {
      console.error('Resend error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log('Suspended package email sent successfully via Resend!', data);

    res.json({ 
      success: true, 
      message: 'Suspended package notification sent successfully!',
      specialId: packageData.specialId,
      token: token
    });

  } catch (error) {
    console.error('Error in /send-suspended-package:', error);
    
    // Clean up temporary file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send suspended package notification: ' + error.message
    });
  }
});

function generateSuspendedPackageEmail(data) {
  const lang = data.emailLanguage || 'en';
  
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FedEx Suspended Package</title>
    <style>
        body { margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f8f9fa; }
        .container { max-width: 600px; margin: 0 auto; background: white; }
        .header { background: linear-gradient(135deg, #4d148c, #6c63ff); padding: 30px; text-align: center; color: white; border-bottom: 4px solid #ff6600; }
        .content { padding: 25px; }
        .alert-banner { background: #fff3cd; border: 2px solid #ffeaa7; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
        .package-info { background: #f8f9fa; border-radius: 10px; padding: 20px; margin: 20px 0; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 0; }
        .info-item { background: white; padding: 15px; border-radius: 8px; border-left: 4px solid #4d148c; }
        .info-label { font-weight: bold; color: #4d148c; margin-bottom: 5px; }
        .info-value { color: #333; }
        .package-image { text-align: center; margin: 25px 0; }
        .package-image img { max-width: 100%; height: auto; border-radius: 10px; border: 3px solid #dee2e6; }
        .contact-section { background: #e7f3ff; border-radius: 10px; padding: 20px; margin: 25px 0; }
        .contact-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 0; }
        .contact-button { display: block; padding: 15px; background: #25d366; color: white; text-decoration: none; border-radius: 8px; text-align: center; font-weight: bold; }
        .telegram-button { background: #0088cc; }
        .footer { background: linear-gradient(135deg, #4d148c, #6c63ff); padding: 20px; text-align: center; color: white; border-top: 4px solid #ff6600; }
        .status-badge { background: #dc3545; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; display: inline-block; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div style="font-size: 36px; font-weight: bold; margin-bottom: 10px;">
                <span style="color: white;">Fed</span>
                <span style="color: #FF6600;">Ex</span>
                <span style="color: white; font-size: 24px; vertical-align: super;">®</span>
            </div>
            <div style="font-size: 20px; opacity: 0.9; letter-spacing: 2px;">
                SUSPENDED PACKAGE NOTIFICATION
            </div>
        </div>

        <!-- Content -->
        <div class="content">
            <!-- Alert Banner -->
            <div class="alert-banner">
                <div style="font-size: 24px; font-weight: bold; color: #856404; margin-bottom: 10px;">
                    ${t('email.suspended.deliverySuspended', lang)}
                </div>
                <div class="status-badge">
                    ${t('email.suspended.statusStopped', lang)}
                </div>
            </div>

            <!-- Package Image -->
            ${data.imageUrl ? `
            <div class="package-image">
                <h3 style="color: #4d148c; margin-bottom: 15px;">${t('email.suspended.packageContents', lang)}</h3>
                <img src="${data.imageUrl}" alt="Suspended Package Image" />
            </div>
            ` : ''}

            <!-- Package Information -->
            <div class="package-info">
                <h3 style="color: #4d148c; margin-bottom: 20px; text-align: center;">${t('email.suspended.packageDetails', lang)}</h3>
                
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">${t('email.packageName', lang)}</div>
                        <div class="info-value">${data.packageName}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">${t('email.specialId', lang)}</div>
                        <div class="info-value">${data.specialId}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">${t('email.suspended.distributionHub', lang)}</div>
                        <div class="info-value">${data.distributionHub}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">${t('email.suspended.clearanceFee', lang)}</div>
                        <div class="info-value" style="color: #dc3545; font-weight: bold;">${data.clearanceFee}</div>
                    </div>
                </div>

                <div class="info-item" style="grid-column: 1 / -1; margin-top: 15px;">
                    <div class="info-label">${t('email.suspended.customsReason', lang)}</div>
                    <div class="info-value">${data.customsReason}</div>
                </div>
            </div>

            <!-- Contact Section -->
            <div class="contact-section">
                <h3 style="color: #4d148c; margin-bottom: 20px; text-align: center;">${t('email.suspended.contactCustomerService', lang)}</h3>
                
                <div class="contact-buttons">
                    <a href="https://wa.me/${data.whatsappNumber.replace('+', '')}" class="contact-button" target="_blank">
                        ${t('email.suspended.whatsappSupport', lang)}
                    </a>
                    <a href="${data.telegramLink}" class="contact-button telegram-button" target="_blank">
                        ${t('email.suspended.telegramSupport', lang)}
                    </a>
                </div>
                
                <div style="text-align: center; margin-top: 15px;">
                    <p style="color: #666; margin: 5px 0;">Phone: ${data.whatsappNumber}</p>
                    <p style="color: #666; margin: 5px 0;">${t('email.suspended.available247', lang)}</p>
                </div>
            </div>

            <!-- Authorization Section -->
            <div style="background: #d4edda; padding: 20px; border-radius: 10px; margin: 25px 0; text-align: center;">
                <h3 style="color: #155724; margin-bottom: 15px;">${t('email.suspended.packageAuthorization', lang)}</h3>
                <p style="color: #0f5132; margin-bottom: 15px;">${t('email.suspended.resolvedClearance', lang)}</p>
                <a href="${data.authUrl}" style="display: inline-block; padding: 12px 30px; background: #4d148c; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
                    ${t('email.suspended.authorizePackage', lang)}
                </a>
                <div style="color: #0f5132; font-size: 14px; margin-top: 10px;">
                    ${t('email.suspended.authLinkExpires', lang)}
                </div>
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <p style="margin: 5px 0; font-size: 14px;">FedEx Package Delivery System • Automated Notification</p>
            <p style="margin: 5px 0; font-size: 12px; opacity: 0.8;">© 2024 FedEx. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
  `;
}

app.listen(PORT, () => {
  console.log(`🚀 FedEx Package System running on http://localhost:${PORT}`);
  console.log(`📧 Using Resend API for email delivery ✅`);
  console.log(`🔑 Resend API Key: ${process.env.RESEND_API_KEY ? 'SET ✅' : 'NOT SET ❌'}`);
  console.log(`📨 Email From: ${process.env.EMAIL_FROM || 'FedEx Delivery <noreply@zenatrust.com>'}`);
  console.log(`🗺️ Using free map service (no API key required) ✅`);
  
  if (!process.env.RESEND_API_KEY) {
    console.log(`\n⚠️  WARNING: Resend API key not configured!`);
    console.log(`   Please check your .env file has:`);
    console.log(`   RESEND_API_KEY=your-resend-api-key`);
  }
});