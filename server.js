// server.js
require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

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

// Configure email transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Function to generate free map image URL (NO API KEY OR BILLING REQUIRED)
const generateMapImageUrl = (address, width = 600, height = 300) => {
  if (!address || address.trim() === '' || address === 'Not specified') {
    return null;
  }
  
  const encodedAddress = encodeURIComponent(address.trim());
  
  // Using MapBox's free public token - completely free, no API key required
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/pin-l-marker+ff0000(${encodedAddress})/${encodedAddress},12/${width}x${height}@2x?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw`;
};

// Function to generate Google Maps link (clickable)
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

app.post('/send-task', upload.single('taskImage'), async (req, res) => {
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
      address2,
      message
    } = req.body;

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');
    const expiryTime = new Date(Date.now() + 20 * 60 * 1000);

    // Store token
    activeTokens.set(token, {
      recipientEmail,
      taskName,
      expiryTime,
      authorized: false
    });

    // Set expiry timer
    setTimeout(() => {
      activeTokens.delete(token);
    }, 20 * 60 * 1000);

    let imageUrl = null;
    
    // Upload to Cloudinary if image exists
    if (req.file) {
      console.log('Uploading image to Cloudinary...');
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'fedex-tasks',
          quality: 'auto',
          fetch_format: 'auto'
        });
        imageUrl = result.secure_url;
        console.log('Image uploaded to Cloudinary:', imageUrl);
        
        // Clean up temporary file
        fs.unlinkSync(req.file.path);
      } catch (uploadError) {
        console.error('Cloudinary upload failed:', uploadError);
        // Clean up temporary file even if upload fails
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        throw new Error('Failed to upload image');
      }
    }

    const taskData = {
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
      address2: address2 || 'Not specified',
      address1GoogleLink: generateGoogleMapsLink(address1),
      address2GoogleLink: generateGoogleMapsLink(address2),
      address1MapImage: generateMapImageUrl(address1),
      address2MapImage: generateMapImageUrl(address2),
      message: message || 'A new task has been assigned to you.',
      imageUrl: imageUrl,
      authUrl: `${req.protocol}://${req.get('host')}/authorize/${token}`,
      token
    };

    const transporter = createTransporter();
    const emailHtml = await generateEmailHtml(taskData);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: recipientEmail,
      subject: `📦 FedEx Product Delivery - ${taskName} [${taskData.specialId}]`,
      html: emailHtml
    };

    console.log('Sending email to:', recipientEmail);
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully!');

    res.json({ 
      success: true, 
      message: 'Product notification sent successfully!',
      specialId: taskData.specialId,
      token: token
    });

  } catch (error) {
    console.error('Error in /send-task:', error);
    
    // Clean up temporary file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send notification: ' + error.message
    });
  }
});

// Update your app.get('/authorize/:token') route
app.get('/authorize/:token', (req, res) => {
  const token = req.params.token;
  const tokenData = activeTokens.get(token);

  if (!tokenData) {
    return res.render('result', {
      success: false,
      title: 'Link Expired',
      message: 'This authorization link has expired or is invalid.',
      subMessage: 'Please request a new notification.'
    });
  }

  if (new Date() > tokenData.expiryTime) {
    activeTokens.delete(token);
    return res.render('result', {
      success: false,
      title: 'Link Expired',
      message: 'This authorization link has expired (20 minutes limit exceeded).',
      subMessage: 'Please request a new notification.'
    });
  }

  // Mark as authorized
  tokenData.authorized = true;
  activeTokens.set(token, tokenData);

  if (tokenData.type === 'suspended') {
    res.render('result', {
      success: true,
      title: 'Package Authorization Successful!',
      message: `Suspended package "${tokenData.packageName}" has been authorized for delivery.`,
      subMessage: 'Your package will be processed for delivery after clearance verification.'
    });
  } else {
    res.render('result', {
      success: true,
      title: 'Product Authorized Successfully!',
      message: `Product "${tokenData.taskName}" has been authorized and accepted.`,
      subMessage: 'Your product will arrive within the designated period.'
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

// Generate email HTML with embedded maps
async function generateEmailHtml(data) {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FedEx Product Delivery</title>
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
        <!-- Replace the header section in your generateEmailHtml function with this: -->
        <div class="header" style="background: linear-gradient(135deg, #4d148c, #6c63ff); padding: 25px; text-align: center; border-bottom: 4px solid #ff6600;">
            <div style="font-size: 32px; font-weight: bold; margin-bottom: 10px;">
                <span style="color: white;">Fed</span>
                <span style="color: #FF6600;">Ex</span>
                <span style="color: white; font-size: 24px; vertical-align: super;">®</span>
            </div>
            <div style="color: white; font-size: 18px; opacity: 0.9; letter-spacing: 1px;">
                PRODUCT DELIVERY NOTIFICATION
            </div>
        </div>
        <!-- Content -->
        <div class="content">
            <div class="tracking-info">
                <h2 style="margin: 0 0 10px 0; color: #4d148c;">Hello ${data.recipientName}!</h2>
                <p style="margin: 0; font-size: 16px;">You have received a new product delivery: <strong>${data.taskName}</strong></p>
                <p style="margin: 5px 0 0 0; color: #666;">Tracking ID: <strong>${data.specialId}</strong></p>
            </div>

            <!-- Product Image -->
            ${data.imageUrl ? `
            <div class="task-image">
                <h3 style="color: #4d148c;">Product Preview</h3>
                <img src="${data.imageUrl}" alt="Product Image" />
            </div>
            ` : ''}

            <!-- Basic Details -->
            <div class="section">
                <h3>📋 Basic Details</h3>
                <div class="details-grid">
                    <div class="detail-item">
                        <div class="detail-label">Product Name</div>
                        <div class="detail-value">${data.taskName}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Special ID</div>
                        <div class="detail-value">${data.specialId}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Priority</div>
                        <div class="detail-value priority-${data.priority.toLowerCase()}">${data.priority}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Assigned To</div>
                        <div class="detail-value">${data.recipientName}</div>
                    </div>
                </div>
            </div>

            <!-- Timeline -->
            <div class="section">
                <h3>⏰ Timeline</h3>
                <div class="details-grid">
                    <div class="detail-item">
                        <div class="detail-label">Created</div>
                        <div class="detail-value">${data.createdDate}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Est. Delivery Time</div>
                        <div class="detail-value">${data.estimatedTime}</div>
                    </div>
                </div>
            </div>

            <!-- Specifications -->
            <div class="section">
                <h3>📊 Specifications</h3>
                <div class="details-grid">
                    <div class="detail-item">
                        <div class="detail-label">Weight</div>
                        <div class="detail-value">${data.weight}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Dimensions</div>
                        <div class="detail-value">${data.dimensions}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Value</div>
                        <div class="detail-value">${data.value}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Pickup Address</div>
                        <div class="detail-value">${data.address1}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Delivery Address</div>
                        <div class="detail-value">${data.address2}</div>
                    </div>
                </div>
            </div>

            <!-- Embedded Maps -->
            ${(data.address1MapImage || data.address2MapImage) ? `
            <div class="section">
                <h3>📍 Delivery Locations</h3>
                
                ${data.address1 !== 'Not specified' && data.address1MapImage ? `
                <div class="map-container">
                    <div class="map-title">📍 Pickup Location: ${data.address1}</div>
                    <img src="${data.address1MapImage}" alt="Pickup Location Map" class="map-image" />
                    ${data.address1GoogleLink ? `
                    <div>
                        <a href="${data.address1GoogleLink}" target="_blank" class="map-button">
                            🗺️ Open in Google Maps
                        </a>
                        <p class="map-instruction">Click to open this location in Google Maps for directions</p>
                    </div>
                    ` : ''}
                </div>
                ` : ''}
                
                ${data.address2 !== 'Not specified' && data.address2MapImage ? `
                <div class="map-container">
                    <div class="map-title">📍 Delivery Location: ${data.address2}</div>
                    <img src="${data.address2MapImage}" alt="Delivery Location Map" class="map-image" />
                    ${data.address2GoogleLink ? `
                    <div>
                        <a href="${data.address2GoogleLink}" target="_blank" class="map-button">
                            🗺️ Open in Google Maps
                        </a>
                        <p class="map-instruction">Click to open this location in Google Maps for directions</p>
                    </div>
                    ` : ''}
                </div>
                ` : ''}
            </div>
            ` : ''}

            <!-- Message -->
            <div class="section">
                <h3>💬 Message</h3>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; color: #495057;">
                    ${data.message}
                </div>
            </div>

            <!-- Authorization Section -->
            <div class="auth-section">
                <h3 style="margin-top: 0; color: #856404;">🔐 Authorization Required</h3>
                <p>If this delivery was initiated by FedEx delivery team, please authorize this message to confirm receipt and acceptance.</p>
                <a href="${data.authUrl}" class="auth-button">AUTHORIZE THIS DELIVERY</a>
                <div class="warning">⚠️ This link will expire in 20 minutes</div>
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <p>This is an automated delivery notification from FedEx Product Delivery System</p>
            <p>For questions, please contact your delivery coordinator</p>
        </div>
    </div>
</body>
</html>
  `;
}

// Add this new route after your existing routes in server.js

// Suspended Package Route
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
      contactMessage
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
      type: 'suspended' // Mark as suspended package
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
        // Clean up temporary file even if upload fails
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
      whatsappNumber: '+2349032650856',
      telegramLink: 'https://t.me/fedex_customer_service'
    };

    const transporter = createTransporter();
    const emailHtml = generateSuspendedPackageEmail(packageData);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: recipientEmail,
      subject: `🚨 FedEx Suspended Package - ${packageName} [${packageData.specialId}]`,
      html: emailHtml
    };

    console.log('Sending suspended package email to:', recipientEmail);
    await transporter.sendMail(mailOptions);
    console.log('Suspended package email sent successfully!');

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

// Add this function to generate suspended package email HTML
function generateSuspendedPackageEmail(data) {
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
                    ⚠️ DELIVERY OF THE SUSPENDED PACKAGE!
                </div>
                <div class="status-badge">
                    Status: Stopped at distribution hub
                </div>
            </div>

            <!-- Package Image -->
            ${data.imageUrl ? `
            <div class="package-image">
                <h3 style="color: #4d148c; margin-bottom: 15px;">Package Contents</h3>
                <img src="${data.imageUrl}" alt="Suspended Package Image" />
            </div>
            ` : ''}

            <!-- Package Information -->
            <div class="package-info">
                <h3 style="color: #4d148c; margin-bottom: 20px; text-align: center;">Package Details</h3>
                
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">Package Name</div>
                        <div class="info-value">${data.packageName}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Special ID</div>
                        <div class="info-value">${data.specialId}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Distribution Hub</div>
                        <div class="info-value">${data.distributionHub}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Clearance Fee</div>
                        <div class="info-value" style="color: #dc3545; font-weight: bold;">${data.clearanceFee}</div>
                    </div>
                </div>

                <div class="info-item" style="grid-column: 1 / -1; margin-top: 15px;">
                    <div class="info-label">Customs Reason</div>
                    <div class="info-value">${data.customsReason}</div>
                </div>
            </div>

            <!-- Message Section -->
            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 25px 0;">
                <h3 style="color: #4d148c; margin-bottom: 15px;">Important Message</h3>
                <div style="color: #495057; line-height: 1.6; font-size: 16px;">
                    ${data.contactMessage}
                </div>
            </div>

            <!-- Contact Section -->
            <div class="contact-section">
                <h3 style="color: #4d148c; margin-bottom: 20px; text-align: center;">Contact Customer Service</h3>
                
                <div class="contact-buttons">
                    <a href="https://wa.me/${data.whatsappNumber.replace('+', '')}" class="contact-button" target="_blank">
                        📞 WhatsApp Support
                    </a>
                    <a href="${data.telegramLink}" class="contact-button telegram-button" target="_blank">
                        ✈️ Telegram Support
                    </a>
                </div>
                
                <div style="text-align: center; margin-top: 15px;">
                    <p style="color: #666; margin: 5px 0;">Phone: ${data.whatsappNumber}</p>
                    <p style="color: #666; margin: 5px 0;">Available 24/7 for assistance</p>
                </div>
            </div>

            <!-- Authorization Section -->
            <div style="background: #d4edda; padding: 20px; border-radius: 10px; margin: 25px 0; text-align: center;">
                <h3 style="color: #155724; margin-bottom: 15px;">Package Authorization</h3>
                <p style="color: #0f5132; margin-bottom: 15px;">If you have resolved the clearance issue, please authorize this package for delivery</p>
                <a href="${data.authUrl}" style="display: inline-block; padding: 12px 30px; background: #4d148c; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
                    ✅ AUTHORIZE PACKAGE
                </a>
                <div style="color: #0f5132; font-size: 14px; margin-top: 10px;">
                    ⚠️ This authorization link expires in 20 minutes
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
  console.log(`🚀 FedEx Product System running on http://localhost:${PORT}`);
  console.log(`📧 Email configured for: ${process.env.EMAIL_USER || 'NOT SET'}`);
  console.log(`🔑 Email password: ${process.env.EMAIL_PASS ? 'SET ✅' : 'NOT SET ❌'}`);
  console.log(`🗺️ Using free map service (no API key required) ✅`);
  
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`\n⚠️  WARNING: Email credentials not properly configured!`);
    console.log(`   Please check your .env file has:`);
    console.log(`   EMAIL_USER=your-email@gmail.com`);
    console.log(`   EMAIL_PASS=your-app-password`);
  }
});