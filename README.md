📦 FedEx Package Delivery System
A web-based application that automates package delivery and suspended package notifications, replicating FedEx's professional notification system. Users can send emails with package details, upload images, and include map links for pickup and delivery locations. The system supports multilingual emails and integrates with Cloudinary for image storage, providing a seamless experience for package tracking and authorization.
📋 Table of Contents

Features
Tech Stack
System Architecture
Installation
Usage
Screenshots
Contributing
License
Contact
Acknowledgments

✨ Features

📧 Automated Email Notifications: Send professional package delivery and suspended package notifications with authorization links.
🌐 Multilingual Support: Emails in English, Portuguese (Brazil), and Spanish using JSON-based translations.
🗺️ Map Integration: Embed Google Maps links and Mapbox static images for pickup and delivery addresses.
🖼️ Image Uploads: Upload package and location images to Cloudinary for inclusion in emails.
🔗 Authorization System: Generate time-limited (20-minute) tokens for recipients to authorize package processing.
📝 Template Management: Customizable email templates with dynamic variables (e.g., recipient name, tracking ID).
🔒 Secure File Handling: Secure image uploads with Multer and temporary file cleanup.
📱 Responsive UI: User-friendly interface with EJS templates and custom CSS.

🛠️ Tech Stack

  
  
  
  
  


Backend:

Node.js
Express.js

Frontend:

EJS (Embedded JavaScript) templates
HTML/CSS for styling

Email Service:

Nodemailer with Gmail SMTP

Image Storage:

Cloudinary for hosting uploaded images

File Uploads:

Multer for handling multipart form data

Other Libraries:

dotenv for environment variable management
crypto for secure token generation
Custom translation system for multilingual emails

Development Tools:

Nodemon for automatic server restarts

🏗️ System Architecture
fedex-task-system/
├── public/                  # Static assets (CSS, JS, images)
├── tmp/                     # Temporary folder for file uploads
├── translations/            # JSON files for email translations
│   ├── en.json              # English translations
│   ├── pt-br.json           # Portuguese (Brazil) translations
│   ├── es.json              # Spanish translations
├── views/                   # EJS templates
│   ├── index.ejs            # Main form page
│   ├── result.ejs           # Authorization result page
├── .env                     # Environment variables (not committed)
├── package.json             # Project dependencies and scripts
├── server.js                # Main server logic
└── README.md                # Project documentation

📦 Installation
Prerequisites

Node.js: v14 or higher
npm: v6 or higher
Gmail Account: For Nodemailer (requires an App Password if 2FA is enabled)
Cloudinary Account: For image uploads
Git: For cloning the repository

Setup

Clone the Repository:
git clone https://github.com/nwafor-princewill/fedex-task-system.git
cd fedex-task-system


Install Dependencies:
npm install


Create .env File:Create a .env file in the project root with the following content:
PORT=3000
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret


Replace your-email@gmail.com with your Gmail address.
Replace your-gmail-app-password with a Gmail App Password (generate from Google Account Security).
Obtain Cloudinary credentials from your Cloudinary Dashboard.


Set Up Translation Files:Ensure the ./translations directory contains:

en.json (English)
pt-br.json (Portuguese - Brazil)
es.json (Spanish)Example structure for en.json:

{
  "email": {
    "subject": "Package Notification: {packageName} ({specialId})",
    "greeting": "Hello {recipientName},",
    "packageReceived": "We have received your package: {packageName}.",
    ...
  },
  "result": {
    "linkExpired": "Link Expired",
    "linkExpiredMessage": "This authorization link is no longer valid.",
    ...
  }
}


Run the Application:

For development (with auto-restart):npx nodemon server.js


For production:node server.js




Access the Application:Open your browser and navigate to http://localhost:3000.


🚀 Usage
Sending a Package Notification

Navigate to the homepage (http://localhost:3000).
Fill out the "Package Delivery" form with:
Recipient email and name
Package details (name, weight, dimensions, value)
Pickup and delivery addresses
Optional images (package, pickup/delivery locations)
Email language (English, Portuguese, Spanish)


Submit to send a notification email with an authorization link (valid for 20 minutes).

Sending a Suspended Package Notification

Use the "Suspended Package Notification" form to alert recipients about packages held at customs.
Include:
Recipient details
Package name and special ID
Clearance fee and customs reason
Optional package image


Submit to send a notification with contact details (WhatsApp, Telegram) and an authorization link.

Authorizing a Package

Recipients receive an email with an authorization link (/authorize/:token).
Clicking the link authorizes the package and sends a notification to the admin email (EMAIL_USER).
Links expire after 20 minutes.

Checking Token Status

Use the /status/:token endpoint to check if a token is valid, authorized, or expired:GET /status/:token

Response example:{
  "exists": true,
  "authorized": false,
  "expired": false,
  "taskName": "Package Name",
  "timeRemaining": 1199999
}



📸 Screenshots
Coming soon! Planned screenshots:

Homepage with package delivery form
Suspended package notification form
Sample email notification
Authorization result page
Map integration with pickup/delivery locations

🤝 Contributing
Contributions are welcome! To contribute:

Fork the repository: https://github.com/nwafor-princewill/fedex-task-system
Create a feature branch:git checkout -b feature/YourFeature


Commit your changes:git commit -m 'Add YourFeature'


Push to the branch:git push origin feature/YourFeature


Open a Pull Request on GitHub.

📄 License
This project is licensed under the MIT License.
👤 Contact
Nwafor Princewill

Email: nwaforprincewill21@gmail.com
GitHub: @nwafor-princewill

🙏 Acknowledgments

Inspired by FedEx's professional notification system
Built with best practices for web applications and email delivery
Thanks to Cloudinary for reliable image hosting
Mapbox and Google Maps for free map integration

⭐ Show Your Support
If you find this project helpful, please give it a star on GitHub! ⭐


  Made with ❤️ by Nwafor Princewill
