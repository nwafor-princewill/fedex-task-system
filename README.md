# 📦 FedEx Message Clone System

An automated messaging service that replicates FedEx's professional notification system architecture. Features template management, delivery tracking integration, and user communication workflows for seamless package tracking notifications.

## 📋 Table of Contents
- [Features](#features)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Installation](#installation)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Message Templates](#message-templates)
- [Screenshots](#screenshots)
- [Contributing](#contributing)
- [Contact](#contact)

## ✨ Features

- **📧 Automated Email Notifications**: Send professional tracking updates automatically
- **📱 SMS Integration**: Multi-channel notification system
- **📝 Template Management**: Customizable email and SMS templates
- **📊 Delivery Tracking**: Real-time package tracking integration
- **🔔 Event-Based Triggers**: Automatic notifications for package events
- **👥 User Management**: Manage recipients and preferences
- **📈 Analytics Dashboard**: Track delivery rates and user engagement
- **🎨 Professional Templates**: FedEx-style branded message templates
- **⚙️ Workflow Automation**: Configurable notification workflows
- **🔒 Secure Communication**: Encrypted message delivery

## 🛠️ Tech Stack

<p>
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express.js"/>
  <img src="https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB"/>
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript"/>
</p>

**Backend:**
- Node.js
- Express.js
- MongoDB
- Mongoose ODM

**Email Services:**
- Nodemailer
- SendGrid API
- Mailgun (optional)

**SMS Services:**
- Twilio API
- Africa's Talking (optional)

**Template Engine:**
- EJS / Handlebars
- HTML/CSS for email styling

## 🏗️ System Architecture

```
fedex-clone/
├── server/
│   ├── models/
│   │   ├── User.js
│   │   ├── Message.js
│   │   ├── Template.js
│   │   └── Tracking.js
│   ├── routes/
│   │   ├── messages.js
│   │   ├── templates.js
│   │   ├── tracking.js
│   │   └── users.js
│   ├── controllers/
│   │   ├── messageController.js
│   │   ├── templateController.js
│   │   └── trackingController.js
│   ├── services/
│   │   ├── emailService.js
│   │   ├── smsService.js
│   │   └── trackingService.js
│   ├── templates/
│   │   ├── email/
│   │   └── sms/
│   ├── middleware/
│   └── config/
└── README.md
```

## 📦 Installation

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- Email API credentials (SendGrid/Mailgun)
- SMS API credentials (Twilio - optional)

### Setup

1. Clone the repository
```bash
git clone https://github.com/nwafor-princewill/fedex-message-clone.git
cd fedex-message-clone
```

2. Install dependencies
```bash
npm install
```

3. Create `.env` file
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/fedex-clone
NODE_ENV=development

# Email Service
SENDGRID_API_KEY=your_sendgrid_api_key
EMAIL_FROM=notifications@yourcompany.com
EMAIL_FROM_NAME=Your Company

# SMS Service (Optional)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_phone

# Security
JWT_SECRET=your_jwt_secret_key
```

4. Start MongoDB
```bash
# Windows
net start MongoDB

# Mac/Linux
sudo service mongod start
```

5. Run the application
```bash
# Development
npm run dev

# Production
npm start
```

## 🚀 Usage

### Sending a Tracking Notification

```javascript
// Example: Send package shipped notification
const notification = {
  recipient: 'customer@example.com',
  trackingNumber: 'FX123456789NG',
  event: 'shipped',
  packageDetails: {
    destination: 'Lagos, Nigeria',
    estimatedDelivery: '2025-10-05',
    weight: '2.5kg'
  }
};

await sendTrackingNotification(notification);
```

### Creating Custom Template

```javascript
// Example: Create new email template
const template = {
  name: 'delivery_confirmation',
  subject: 'Your Package Has Been Delivered',
  body: `
    <h2>Delivery Confirmation</h2>
    <p>Dear {{customerName}},</p>
    <p>Your package ({{trackingNumber}}) has been successfully delivered.</p>
    <p>Delivery Time: {{deliveryTime}}</p>
    <p>Signed by: {{signature}}</p>
  `,
  type: 'email'
};

await createTemplate(template);
```

## 🔌 API Documentation

### Messages

#### Send Email Notification
```http
POST /api/messages/email
Content-Type: application/json

{
  "to": "customer@example.com",
  "template": "tracking_update",
  "data": {
    "trackingNumber": "FX123456789NG",
    "status": "In Transit",
    "location": "Lagos Distribution Center"
  }
}
```

#### Send SMS Notification
```http
POST /api/messages/sms
Content-Type: application/json

{
  "to": "+2349012345678",
  "template": "delivery_alert",
  "data": {
    "trackingNumber": "FX123456789NG"
  }
}
```

### Templates

#### Get All Templates
```http
GET /api/templates
```

#### Create Template
```http
POST /api/templates
Content-Type: application/json

{
  "name": "template_name",
  "type": "email",
  "subject": "Subject Line",
  "body": "Template body with {{variables}}"
}
```

### Tracking

#### Update Tracking Status
```http
PUT /api/tracking/:trackingNumber
Content-Type: application/json

{
  "status": "delivered",
  "location": "Customer Address",
  "timestamp": "2025-09-30T10:30:00Z"
}
```

## 📝 Message Templates

### Available Templates

1. **Package Shipped**
   - Subject: "Your Package is On the Way!"
   - Trigger: Package leaves origin facility

2. **In Transit Update**
   - Subject: "Tracking Update for Your Package"
   - Trigger: Package reaches new location

3. **Out for Delivery**
   - Subject: "Your Package Will Arrive Today"
   - Trigger: Package out for final delivery

4. **Delivered**
   - Subject: "Your Package Has Been Delivered"
   - Trigger: Successful delivery confirmation

5. **Delivery Exception**
   - Subject: "Delivery Attempt - Action Required"
   - Trigger: Delivery issue encountered

6. **Delayed**
   - Subject: "Update on Your Package Delivery"
   - Trigger: Delivery delay detected

### Template Variables

Common variables available in all templates:
- `{{customerName}}` - Recipient name
- `{{trackingNumber}}` - Package tracking number
- `{{status}}` - Current package status
- `{{location}}` - Current/destination location
- `{{estimatedDelivery}}` - Estimated delivery date
- `{{packageWeight}}` - Package weight
- `{{trackingUrl}}` - Full tracking URL

## 📸 Screenshots

<!-- Add your screenshots here -->
```
Coming soon! Add screenshots of:
- Email templates
- Dashboard interface
- Template editor
- Analytics page
- Notification logs
```

## 🎯 Notification Workflow

```
Package Event → Event Detection → Template Selection → 
Data Population → Delivery Channel Selection → 
Send Notification → Log Result → Update Analytics
```

## 🔒 Security Features

- **API Authentication**: Secure API endpoints with JWT
- **Rate Limiting**: Prevent spam and abuse
- **Email Validation**: Verify recipient addresses
- **Template Sanitization**: Prevent XSS in templates
- **Encryption**: Secure sensitive data storage
- **Audit Logging**: Track all notification activities

## 🚀 Future Enhancements

- [ ] WhatsApp integration
- [ ] Push notifications
- [ ] Multi-language support
- [ ] Advanced analytics and reporting
- [ ] A/B testing for templates
- [ ] Scheduled notifications
- [ ] Webhook integrations
- [ ] Mobile app for management
- [ ] Real-time tracking dashboard

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 👤 Contact

**Nwafor Princewill**

- Email: nwaforprincewill21@gmail.com
- GitHub: [@nwafor-princewill](https://github.com/nwafor-princewill)
- LinkedIn: [Your LinkedIn Profile]

## 🙏 Acknowledgments

- Inspired by FedEx tracking notification system
- Email templates designed for professional communication
- Built with best practices for notification systems

## ⭐ Show Your Support

If you find this project helpful, please give it a star! ⭐

---

<div align="center">
  Made with ❤️ by Nwafor Princewill
</div>
