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

// app.use((req, res, next) => {
//   res.setHeader(
//     "Content-Security-Policy",
//     "default-src 'self'; font-src 'self' https://fonts.gstatic.com; style-src 'self' https://fonts.googleapis.com;"
//   );
//   next();
// });

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
			html: `<div style="font-family: 'Arial', sans-serif; background-color: #ffffff; color: #333; padding: 40px; max-width: 600px; margin: auto; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <img src="https://shiftfestival.be/Logo.svg" alt="Shift Logo" style="width: 120px; margin-bottom: 30px;">
 
            <h1 style="color: #E62474; font-size: 28px; margin-bottom: 10px;">Welkom bij Shift, ${name}!</h1>
           
            <p style="font-size: 16px; line-height: 1.6;">
              Hallo ${name},<br>
              Bedankt voor je inschrijving voor <strong style="color: #97EB4E;">Shift</strong>!
              We zijn enthousiast om je te verwelkomen op ons evenement.
            </p>
 
            <h2 style="color: #97EB4E; font-size: 20px; margin-top: 30px;">📍 Waar en wanneer:</h2>
            <p style="font-size: 16px; line-height: 1.6;">
              <strong>Vrijdag 20 juni 2025</strong> van 17:00 tot 21:00 uur <br>
              (doorlopend expo en workshops)<br>
              <strong>Award-uitreiking:</strong> 20:00 uur<br>
              <strong>Locatie:</strong> Erasmushogeschool Brussel,<br>
              Nijverheidskaai 170, 1070 Anderlecht
            </p>
 
            <p style="font-size: 16px; line-height: 1.6;">
              Alle info vind je op de <a href="https://shiftfestival.be" target="_blank" style="color: #E62474; text-decoration: none;">website</a>.
            </p>
 
            <p style="font-size: 16px; line-height: 1.6;">
              Vergeet zeker niet om je in te schrijven voor de barbecue!
            </p>
 
            <div style="margin: 30px 0; text-align: center;">
              <a href="https://shiftfestival.be" style="background-color: #97EB4E; color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                Bekijk Website
              </a>
            </div>
 
            <p style="font-size: 16px; line-height: 1.6;">
              Nogmaals bedankt voor je inschrijving. Tot op <strong style="color: #E62474;">Shift</strong>!
            </p>
 
            <p style="font-size: 14px; line-height: 1.6; color: #666;">
              Met vriendelijke groet,<br>
              Het Promotieteam van Shift<br>
              Studenten Multimedia en Creatieve Technologie,<br>
              Erasmushogeschool Brussel
            </p>
          </div>`
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
				<div style="font-family: 'Arial', sans-serif; background-color: #ffffff; color: #333; padding: 40px; max-width: 600px; margin: auto; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">

				<img src="https://shiftfestival.be/Logo.svg" alt="Shift Logo" style="width: 120px; margin-bottom: 30px;">

				<h1 style="color: #E62474; font-size: 28px; margin-bottom: 10px;">
					Bedankt voor je deelname aan Shift Festival, ${name}!
				</h1>

				<p style="font-size: 16px; line-height: 1.6;">
					Hallo ${name},<br>
					Wat fijn dat je erbij was op <strong style="color: #97EB4E;">Shift</strong>! 
					We hopen dat je genoten hebt van alle inspirerende projecten, workshops en de unieke sfeer.
				</p>

				<!-- Token Section -->
				<h2 style="color: #97EB4E; font-size: 20px; margin-top: 30px;">🔐 Jouw stem-token:</h2>
				<p style="font-size: 20px; font-weight: bold; background: #f1f1f1; padding: 14px; border-radius: 8px; display: inline-block; margin-top: 10px;">
					${token}
				</p>

				<p style="font-size: 16px; line-height: 1.6; margin-top: 20px;">
					Gebruik deze token om te stemmen via de <a href="https://shiftfestival.be/stem" target="_blank" style="color: #E62474; text-decoration: none;">stempagina</a> of op het event zelf.
				</p>

				<div style="margin: 30px 0; text-align: center;">
					<a href="https://shiftfestival.be/stem" style="background-color: #97EB4E; color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
					Breng je stem uit
					</a>
				</div>

				<p style="font-size: 16px; line-height: 1.6;">
					Nogmaals bedankt voor je komst. Tot ziens op een volgende editie van <strong style="color: #E62474;">Shift</strong>!
				</p>

				<p style="font-size: 14px; line-height: 1.6; color: #666;">
					Met vriendelijke groet,<br>
					Het Promotieteam van Shift<br>
					Studenten Multimedia en Creatieve Technologie,<br>
					Erasmushogeschool Brussel
				</p>
				</div>
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
		const emailRegex = /^[a-zA-Z0-9._%+-]+@ehb\.be$/;
		//const emailRegex = /^[a-zA-Z0-9._%+-]+@student\.ehb\.be$/;

		if (!email || !emailRegex.test(email)) {
			connection.end();
			return res.status(400).json({ message: "A valid @ehb.be email is required" });
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

// Publieks voting counter add
app.post("/api/publieksvotes", (req, res) => {
	createSshTunnelAndConnection((err, connection) => {
		if (err) {
			console.error("SSH/DB connection failed:", err);
			return res.status(500).json({ message: "Database connection error" });
		}

		const updateQuery = `UPDATE publieks_votes SET vote_count = vote_count + 1 WHERE project_id = 1`;
		const selectQuery = `SELECT vote_count FROM publieks_votes WHERE project_id = 1`;

		connection.query(updateQuery, (err) => {
			if (err) {
				connection.end();
				console.error("Vote increment error:", err);
				return res.status(500).json({ message: "Failed to increment vote count" });
			}

			connection.query(selectQuery, (err, results) => {
				connection.end();

				if (err) {
					console.error("Vote fetch error:", err);
					return res.status(500).json({ message: "Failed to fetch vote count" });
				}

					if (results.length === 0) {
						return res.status(404).json({ message: `No vote count found for project_id ${projectId}` });
					}

				return res.status(200).json({
					message: "Vote counted",
					vote_count: results[0].vote_count
				});
			});
		});
	});
});

// Get publieks votes
app.get("/api/publieksvotes/:project_id", (req, res) => {
	const projectId = req.params.project_id;

	createSshTunnelAndConnection((err, connection) => {
		if (err) {
			console.error("SSH/DB connection failed:", err);
			return res.status(500).json({ message: "Database connection error" });
		}

		const selectQuery = `SELECT vote_count FROM publieks_votes WHERE project_id = ?`;

		connection.query(selectQuery, [projectId], (err, results) => {
			connection.end();

			if (err) {
				console.error("Vote fetch error:", err);
				return res.status(500).json({ message: "Failed to fetch vote count" });
			}

			if (results.length === 0) {
				return res.status(404).json({ message: `No votes found for project_id ${projectId}` });
			}

			return res.status(200).json({
				project_id: projectId,
				vote_count: results[0].vote_count,
			});
		});
	});
});

app.get("/api/counter", (req, res) => {
	createSshTunnelAndConnection((err, connection) => {
		if (err) {
			console.error("SSH/DB connection failed:", err);
			return res.status(500).json({ message: "Database connection error" });
		}

		const countUsers = `SELECT SUM(num_attendees) AS total FROM event_registrations`;

		connection.query(countUsers, (err, results) => {
			connection.end();

			if (err) {
				console.error("Error querying database:", err);
				return res.status(500).json({ message: "Sorry something went wrong" });
			}

			res.json({ count: results[0].total || 0 });
		});
	});
});

// Start server
app.listen(3000, () => {
	console.log("🚀 Server started on port 3000");
});
