const express = require("express");
const path = require('path');
const app = express();
const mysql = require("mysql2");
require("dotenv").config();
const cors = require("cors");
const nodemailer = require("nodemailer");
const { Client } = require('ssh2');
const fs = require('fs');
const crypto = require("crypto");

const corsOptions = {
	origin: "*",
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors(corsOptions));

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; font-src 'self' https://fonts.gstatic.com; style-src 'self' https://fonts.googleapis.com;"
  );
  next();
});

// MySQL & SSH Config
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
	//privateKey: process.env.SSH_PK.replace(/\\n/g, '\n'),
	privateKey: fs.readFileSync(process.env.SSH_PK_PATH)
};

const forwardConfig = {
	srcHost: '127.0.0.1',
	srcPort: 3306,
	dstHost: dbConfig.host,
	dstPort: dbConfig.port
};

// Dynamic SSH Tunnel and MySQL Connection (per request)
function createSshTunnelAndConnection(callback) {
	const ssh = new Client();

	ssh.on('ready', () => {
		ssh.forwardOut(
			forwardConfig.srcHost,
			forwardConfig.srcPort,
			forwardConfig.dstHost,
			forwardConfig.dstPort,
			(err, stream) => {
				if (err) {
					ssh.end();
					return callback(err);
				}

				const connection = mysql.createConnection({
					...dbConfig,
					stream
				});

				connection.connect(error => {
					if (error) {
						stream.destroy();
						ssh.end();
						return callback(error);
					}

					connection.on('end', () => ssh.end());
					connection.on('error', () => ssh.end());

					callback(null, connection);
				});
			}
		);
	}).connect(tunnelConfig);

	ssh.on('error', err => {
		callback(err);
	});
}

// Email Transport
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
			to,
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
					<p>Studenten Multimedia en Creatieve Technologie, Erasmushogeschool Brussel</p>`
		});

		console.log("✅ E-mail succesvol verzonden naar:", to);
		console.log("📩 Bericht ID:", info.messageId);
	} catch (error) {
		console.error("❌ Fout bij verzenden e-mail:", error);
	}
};

const sendEmailWithToken = async (to, token) => {
	try {
		const info = await transporter.sendMail({
			from: '"Shift Festival" <info@shiftfestival.be>',
			to,
			subject: "Je stem-token voor Shift Festival",
			text: `Bedankt voor je deelname! Gebruik deze unieke token om te stemmen: ${token}`,
			html: `
				<h2>Bedankt voor je deelname aan Shift Festival!</h2>
				<p>Gebruik deze unieke stem-token om jouw stem uit te brengen:</p>
				<p style="font-size: 20px; font-weight: bold; background: #f1f1f1; padding: 10px;">${token}</p>
				<p>Stem via de stempagina of op het event zelf.</p>
				<p>Tot binnenkort!</p>
				<p>Team Shift Festival</p>
			`
		});
		console.log("📧 Token verstuurd naar:", to);
		console.log("📩 Bericht ID:", info.messageId);
	} catch (error) {
		console.error("❌ Fout bij verzenden token e-mail:", error);
	}
};

// Test API route
app.get("/api", (req, res) => {
	res.json({ fruits: ["apple", "banana", "grape"] });
});

// Form submission route
app.post("/api/submit-register-form", (req, res) => {
	createSshTunnelAndConnection((err, connection) => {
		if (err) {
			console.error("SSH/DB connection failed:", err);
			return res.status(500).json({ message: "Database connection error" });
		}

		const { firstName, lastName, email, roles, amount, message, subscribeToUpdates } = req.body;

		if (!firstName || !lastName || !email || !roles || !amount) {
			connection.end();
			return res.status(400).json({ message: "All fields are required" });
		}

		const checkMailQuery = `SELECT COUNT(*) AS email_count FROM event_registrations WHERE email = ?`;
		connection.query(checkMailQuery, [email], (err, results) => {
			if (err) {
				console.error("Query error:", err);
				connection.end();
				return res.status(500).json({ message: "Database query error" });
			}

			if (results[0].email_count !== 0) {
				connection.end();
				return res.status(409).json({ message: "Email is reeds gebruikt" });
			}

			const role = roles[0];
			const roleName = role.role;
			const companyName = role.companyName;
			const sponsor = role.sponsorship;

			const sql = `
				INSERT INTO event_registrations 
				(first_name, last_name, email, num_attendees, message, wants_event_updates, role, company_name, wants_sponsorship)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

			const values = [
				firstName,
				lastName,
				email,
				amount,
				message,
				subscribeToUpdates ? 1 : 0,
				roleName,
				companyName,
				sponsor
			];

			connection.query(sql, values, (err, result) => {
				connection.end();

				if (err) {
					console.error("Insert error:", err);
					return res.status(500).json({ message: "Database insert error" });
				}

				res.status(200).json({ message: "Data inserted successfully" });
				sendEmail(email, firstName);
			});
		});
	});
});

// Register voter
app.post("/api/register-voter", (req, res) => {
	createSshTunnelAndConnection((err, connection) => {
		if (err) {
			console.error("SSH/DB connection failed:", err);
			return res.status(500).json({ message: "Database connection error" });
		}

		const { email } = req.body;

		if (!email) {
			connection.end();
			return res.status(400).json({ message: "Email is required" });
		}

		const checkQuery = `SELECT token FROM voters WHERE email = ?`;

		connection.query(checkQuery, [email], (err, results) => {
			if (err) {
				console.error("Query error:", err);
				connection.end();
				return res.status(500).json({ message: "Database query error" });
			}

			if (results.length > 0) {
				connection.end();
				sendEmailWithToken(email, results[0].token);
				return res.status(200).json({
					message: "Je was al geregistreerd, token opnieuw verzonden",
					token: results[0].token
				});
			}

			const token = crypto.randomBytes(16).toString("hex");
			const insertQuery = `INSERT INTO voters (email, token) VALUES (?, ?)`;

			connection.query(insertQuery, [email, token], async (err) => {
				connection.end();

				if (err) {
					console.error("Insert error:", err);
					return res.status(500).json({ message: "Database insert error" });
				}

				await sendEmailWithToken(email, token);

				return res.status(201).json({
					message: "Voter registered and token sent",
					token
				});
			});
		});
	});
});

// Vote
app.post("/api/vote", (req, res) => {
	createSshTunnelAndConnection((err, connection) => {
		if (err) {
			console.error("SSH/DB connection failed:", err);
			return res.status(500).json({ message: "Database connection error" });
		}

		const { token, award_id, project_id } = req.body;

		if (!token || !award_id || !project_id) {
			connection.end();
			return res.status(400).json({ message: "token, award_id, and project_id are required" });
		}

		const getVoterQuery = `SELECT id FROM voters WHERE token = ?`;

		connection.query(getVoterQuery, [token], (err, results) => {
			if (err) {
				console.error("Query error:", err);
				connection.end();
				return res.status(500).json({ message: "Database query error" });
			}

			if (results.length === 0) {
				connection.end();
				return res.status(404).json({ message: "Invalid token" });
			}

			const voter_id = results[0].id;

			const insertVoteQuery = `
				INSERT INTO votes (voter_id, award_id, project_id)
				VALUES (?, ?, ?)
				ON DUPLICATE KEY UPDATE project_id = VALUES(project_id)
			`;

			connection.query(insertVoteQuery, [voter_id, award_id, project_id], (err) => {
				connection.end();

				if (err) {
					console.error("Insert vote error:", err);
					return res.status(500).json({ message: "Error casting vote" });
				}

				return res.status(200).json({ message: "Vote submitted successfully" });
			});
		});
	});
});

// Start server
app.listen(3000, () => {
	console.log("🚀 Server started on port 3000");
});
