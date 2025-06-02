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
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: 3306
};

const tunnelConfig = {
    host: process.env.DB_SSH_HOST,
    port: 22,
    username: process.env.DB_SSH_USER,
    //privateKey: fs.readFileSync(process.env.SSH_PK_PATH),
    privateKey: process.env.SSH_PK
};

const forwardConfig = {
    srcHost: '127.0.0.1',
    srcPort: 3306,
    dstHost: dbConfig.host,
    dstPort: dbConfig.port
};

const SSHConnection = new Promise((resolve, reject) => {
    sshClient.on('ready', () => {
        console.log("SSH connection established.");
        
        sshClient.forwardOut(
            forwardConfig.srcHost,
            forwardConfig.srcPort,
            forwardConfig.dstHost,
            forwardConfig.dstPort,
            (err, stream) => {
                if (err) {
                    console.error("Error forwarding SSH tunnel:", err);
                    return reject(err);
                }

                const updatedDbConfig = {
                    ...dbConfig,
                    stream
                };

                const connection = mysql.createConnection(updatedDbConfig);
                connection.connect(error => {
                    if (error) {
                        console.error("Failed to connect to the database:", error);
                        return reject(error);
                    }

                    console.log("Successfully connected to the database through SSH tunnel.");
                    resolve(connection);
                });
            }
        );
    }).on('error', (err) => {
        console.error("SSH connection error:", err);
        reject(err);
    }).connect(tunnelConfig);
});

// Automatic mails
const transporter = nodemailer.createTransport({
	host: "smtp-auth.mailprotect.be",
	port: 465,
	secure: true,
	auth: {
		user: process.env.SMTP_USER,
		pass: process.env.SMTP_PASS,
	},
	logger: true,
});

const sendEmail = async (to, name) => {
	try {
		const info = await transporter.sendMail({
			from: '"Shift Festival" <info@shiftfestival.be>',
			to: to,
			subject: `Welkom bij Shift Festival, ${name}!`,
			text: `Hallo ${name}, bedankt voor je inschrijving bij Shift Festival! We kijken ernaar uit om je te verwelkomen.`,
			html: `<h1>Welkom bij Shift, ${name}!</h1> 
					<p>Hallo ${name},</p> 
					<p>Bedankt voor je inschrijving voor <strong>Shift</strong>! 
					We zijn enthousiast om je te verwelkomen op ons evenement.</p> 
					
					<h2>Waar en wanneer:</h2> 
					<p><strong>Vrijdag 20 juni 2025</strong> van 17:00 tot 21:00 uur (doorlopend expo en workshops)</p> 
					<p>Award-uitreiking om 20:00 uur</p> 
					<p><strong>Locatie:</strong> Erasmushogeschool Brussel, Nijverheidskaai 170, 1070 Anderlecht</p> 
					<p>Alle info vind je op de <a href="https://shiftfestival.be" target="_blank">website</a></p> 
					<p>Vergeet zeker niet om je in te schrijven voor de barbecue!</p> 
					<p>Nogmaals bedankt voor je inschrijving. Tot op <strong>Shift</strong>!</p> 
					<p>Met vriendelijke groet,</p> 
					<p>Het Promotieteam van Shift</p> 
					<p>Studenten Multimedia en Creatieve Technologie, Erasmushogeschool Brussel</p>`,
		});

		console.log("✅ E-mail succesvol verzonden naar:", to);
		console.log("📩 Bericht ID:", info.messageId);
	} catch (error) {
		console.error("❌ Fout bij verzenden e-mail:", error);
	}
};

// Test api call
app.get("/api", (req, res) => {
	res.json({ fruits: ["apple", "banana", "grape"] });
});

// // Form voor inschrijvingen
app.post("/api/submit-register-form", (req, res) => {
  SSHConnection.then(connection => {
    const { firstName, lastName, email, roles, amount, message, subscribeToUpdates } = req.body;

    if (!firstName || !lastName || !email || !roles || !amount) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const checkMailQuery = `SELECT COUNT(*) AS email_count FROM event_registrations WHERE email = ?`;
    connection.query(checkMailQuery, [email], (err, results) => {
      if (err) {
        console.error("Error querying database:", err);
        return res.status(500).json({ message: "Sorry something went wrong" });
      }

      if (results[0].email_count !== 0) {
        return res.status(409).json({ message: "Email is reeds gebruikt" });
      }

      const role = roles[0];
      const roleName = role.role;
      const companyName = role.companyName;
      const sponsor = role.sponsorship;

      const sql = "INSERT INTO event_registrations (first_name, last_name, email, num_attendees, message, wants_event_updates, role, company_name, wants_sponsorship) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
      connection.query(sql, [firstName, lastName, email, amount, message, [subscribeToUpdates ? 1 : 0], roleName, companyName, sponsor], (err, result) => {
        if (err) {
          console.error("Error inserting data:", err);
          return res.status(500).json({ message: "Sorry something went wrong" });
        }
        res.status(200).json({ message: "Data inserted successfully" });

        //sendmail function
        sendEmail(email, firstName);
      });
    });
  });
});

// Starten app
app.listen(3000, () => {
	console.log("Server started on port 3000");
});
