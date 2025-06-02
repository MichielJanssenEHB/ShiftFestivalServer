const express = require("express");
const path = require('path');
const app = express();
const mysql = require("mysql2");
require("dotenv").config();
const cors = require("cors");
const nodemailer = require("nodemailer");
const { Client } = require('ssh2');
const fs = require('fs');

const sshClient = new Client();

const corsOptions = {
	origin: "*",
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors(corsOptions));

// // // CSP Headers (Momenteel fout?)
// // app.use((req, res, next) => {
// // 	res.setHeader("Content-Security-Policy",
// // 		"default-src 'none'; " +
// // 		"img-src 'self' data: https://shiftfestival.be; " +
// // 		"style-src 'self' 'unsafe-inline' fonts.googleapis.com use.typekit.net p.typekit.net;" +
// // 		"font-src fonts.gstatic.com use.typekit.net; " +
// // 		"script-src 'self' 'unsafe-inline'; " +
// // 		"connect-src 'self' https://api.shiftfestival.be;"
// // 	);
// // 	next();
// // });

// // Frontend
// // app.use(express.static(path.join(__dirname, '/client/dist')));

// // app.get('/*\w', (req, res) => {
// //     res.sendFile(path.join(__dirname, '/client/dist/index.html'));
// // });

// // app.use(express.static(path.join(__dirname, '/www')));

// // app.get('/*\w', (req, res) => {
// //     res.sendFile(path.join(__dirname, '/www/index.html'));
// // });

// Database volgens SSH
const dbConfig = {
  host: "127.0.0.1", // after SSH tunnel
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
};

const tunnelConfig = {
  host: process.env.DB_SSH_HOST,
  port: 22,
  username: process.env.DB_SSH_USER,
  privateKey: process.env.SSH_PK.replace(/\\n/g, '\n'),
};

const forwardConfig = {
  srcHost: "127.0.0.1",
  srcPort: 3306,
  dstHost: process.env.DB_HOST,
  dstPort: 3306,
};

// Globals
let dbPool;

// SSH Tunnel & DB Setup
const setupTunnelAndDB = async () => {
  return new Promise((resolve, reject) => {
    const ssh = new Client();

    ssh.on("ready", () => {
      console.log("🔐 SSH tunnel ready.");

      ssh.forwardOut(
        forwardConfig.srcHost,
        forwardConfig.srcPort,
        forwardConfig.dstHost,
        forwardConfig.dstPort,
        async (err, stream) => {
          if (err) {
            console.error("❌ SSH forward error:", err);
            return reject(err);
          }

          try {
            dbPool = mysql.createPool({ ...dbConfig, stream });
            const conn = await dbPool.getConnection();
            await conn.ping();
            conn.release();
            console.log("✅ DB connection pool established.");
            resolve();
          } catch (dbErr) {
            console.error("❌ DB pool error:", dbErr);
            reject(dbErr);
          }
        }
      );
    });

    ssh.on("error", (err) => {
      console.error("❌ SSH connection error:", err);
      reject(err);
    });

    ssh.connect(tunnelConfig);
  });
};

// Email setup
const transporter = nodemailer.createTransport({
  host: "smtp-auth.mailprotect.be",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendEmail = async (to, name) => {
  try {
    const info = await transporter.sendMail({
      from: '"Shift Festival" <info@shiftfestival.be>',
      to,
      subject: `Welkom bij Shift Festival, ${name}!`,
      html: `<h1>Welkom bij Shift, ${name}!</h1>
             <p>Hallo ${name},</p>
             <p>Bedankt voor je inschrijving voor <strong>Shift</strong>...</p>`,
    });
    console.log("📧 Mail verzonden naar:", to);
  } catch (error) {
    console.error("❌ E-mailfout:", error);
  }
};

// API test
app.get("/api", (req, res) => {
  res.json({ fruits: ["apple", "banana", "grape"] });
});

// Registration endpoint
app.post("/api/submit-register-form", async (req, res) => {
  try {
    const connection = await dbPool.getConnection();

    const { firstName, lastName, email, roles, amount, message, subscribeToUpdates } = req.body;
    if (!firstName || !lastName || !email || !roles || !amount) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const [existing] = await connection.query(
      "SELECT COUNT(*) AS email_count FROM event_registrations WHERE email = ?",
      [email]
    );

    if (existing[0].email_count > 0) {
      return res.status(409).json({ message: "Email is reeds gebruikt" });
    }

    const role = roles[0];
    const insertQuery = `
      INSERT INTO event_registrations 
      (first_name, last_name, email, num_attendees, message, wants_event_updates, role, company_name, wants_sponsorship)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    await connection.query(insertQuery, [
      firstName,
      lastName,
      email,
      amount,
      message,
      subscribeToUpdates ? 1 : 0,
      role.role,
      role.companyName,
      role.sponsorship,
    ]);

    connection.release();

    res.status(200).json({ message: "Inschrijving geslaagd!" });
    sendEmail(email, firstName);
  } catch (err) {
    console.error("❌ Query error:", err);
    res.status(500).json({ message: "Er ging iets mis bij registratie" });
  }
});

// Start server after tunnel + DB ready
setupTunnelAndDB()
  .then(() => {
    app.listen(3000, () => {
      console.log("🚀 Server draait op http://localhost:3000");
    });
  })
  .catch((err) => {
    console.error("❌ Startup failed:", err);
    process.exit(1);
  });