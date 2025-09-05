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
      subject: `📦 FedEx Task Delivery - ${taskName} [${taskData.specialId}]`,
      html: emailHtml
    };

    console.log('Sending email to:', recipientEmail);
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully!');

    res.json({ 
      success: true, 
      message: 'Task notification sent successfully!',
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


app.get('/authorize/:token', (req, res) => {
  const token = req.params.token;
  const tokenData = activeTokens.get(token);

  if (!tokenData) {
    return res.render('result', {
      success: false,
      title: 'Link Expired',
      message: 'This authorization link has expired or is invalid.',
      subMessage: 'Please request a new task notification.'
    });
  }

  if (new Date() > tokenData.expiryTime) {
    activeTokens.delete(token);
    return res.render('result', {
      success: false,
      title: 'Link Expired',
      message: 'This authorization link has expired (20 minutes limit exceeded).',
      subMessage: 'Please request a new task notification.'
    });
  }

  // Mark as authorized
  tokenData.authorized = true;
  activeTokens.set(token, tokenData);

  res.render('result', {
    success: true,
    title: 'Task Authorized Successfully!',
    message: `Task "${tokenData.taskName}" has been authorized and accepted.`,
    subMessage: 'You can now proceed with the assigned task.'
  });
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

// Generate email HTML
async function generateEmailHtml(data) {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FedEx Task Delivery</title>
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
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="logo">📦 FedEx Task Delivery</div>
            <div style="margin-top: 10px; font-size: 16px;">Task Assignment Notification</div>
        </div>

        <!-- Content -->
        <div class="content">
            <div class="tracking-info">
                <h2 style="margin: 0 0 10px 0; color: #4d148c;">Hello ${data.recipientName}!</h2>
                <p style="margin: 0; font-size: 16px;">You have received a new task assignment: <strong>${data.taskName}</strong></p>
                <p style="margin: 5px 0 0 0; color: #666;">Tracking ID: <strong>${data.specialId}</strong></p>
            </div>

            <!-- Task Image -->
            ${data.imageUrl ? `
            <div class="task-image">
                <h3 style="color: #4d148c;">Task Preview</h3>
                <img src="${data.imageUrl}" alt="Task Image" />
            </div>
            ` : ''}

            <!-- Basic Details -->
            <div class="section">
                <h3>📋 Basic Details</h3>
                <div class="details-grid">
                    <div class="detail-item">
                        <div class="detail-label">Task Name</div>
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
                        <div class="detail-label">Est. Time to Finish</div>
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
                        <div class="detail-label">Address 1</div>
                        <div class="detail-value">${data.address1}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Address 2</div>
                        <div class="detail-value">${data.address2}</div>
                    </div>
                </div>
            </div>

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
                <p>If this task was initiated by you or your friends, please authorize this message to confirm receipt and acceptance.</p>
                <a href="${data.authUrl}" class="auth-button">AUTHORIZE THIS TASK</a>
                <div class="warning">⚠️ This link will expire in 20 minutes</div>
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <p>This is an automated task notification from FedEx Task Delivery System</p>
            <p>For questions, please contact your task coordinator</p>
        </div>
    </div>
</body>
</html>
  `;
}

app.listen(PORT, () => {
  console.log(`🚀 FedEx Task System running on http://localhost:${PORT}`);
  console.log(`📧 Email configured for: ${process.env.EMAIL_USER || 'NOT SET'}`);
  console.log(`🔑 Email password: ${process.env.EMAIL_PASS ? 'SET ✅' : 'NOT SET ❌'}`);
  
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`\n⚠️  WARNING: Email credentials not properly configured!`);
    console.log(`   Please check your .env file has:`);
    console.log(`   EMAIL_USER=your-email@gmail.com`);
    console.log(`   EMAIL_PASS=your-app-password`);
  }
});