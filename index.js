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
const cookieParser = require('cookie-parser');

app.use(cors({
  origin: 'https://shiftfestival.be',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

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
			html: `<div
					style="
						font-family: 'Arial', sans-serif;
						background-color: #ffffff;
						color: #333;
						padding: 40px;
						max-width: 600px;
						margin: auto;
						border-radius: 12px;
						box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
					"
				>
					<img
						src="https://shiftfestival.be/emailBanners/bannerMail.png"
						alt="Shift Logo"
						style="width: 100%; margin-bottom: 30px"
					/>
					<p style="font-size: 16px; line-height: 1.6">
						Hallo ${name},<br />
						<br />
						Fijn dat je ingeschreven bent voor Shift! <br />
						<br />
						Tijdens dit event krijg je de kans om het werk van onze studenten te
						ontdekken in een <strong>interactieve expo</strong> . Elk project heeft een
						eigen stand waar je met de makers in gesprek kunt gaan over hun werk, hun
						aanpak, hun toekomstplannen, ...  <br />
						<br />
						Daarnaast worden er <strong>rondleidingen</strong> georganiseerd doorheen de
						expo en zal er een feestelijke prijsuitreiking zijn voor de beste
						eindprojecten. We sluiten de avond af met een coole
						<strong>VJ-Set</strong> en een lekkere <strong>barbecue</strong>. <br />
						<br />
						Alle informatie vind je op
						<a target="_blank" href="https://shiftfestival.be/"
							>https://shiftfestival.be/</a
						>
						 
					</p>
				
					<h2 style="color: #000; font-size: 20px; margin-top: 30px; font-weight: bold">
						Praktische info:
					</h2>
					<p style="font-size: 16px; line-height: 1.6; color: #000">
						<strong>Datum: Vrijdag 20 juni 2025</strong><br />
						<strong>Locatie:</strong>
						<a href="https://maps.app.goo.gl/tQqbCeLRXPSfydr18" target="_blank"
							><strong>Campus Kaai – Nijverheidskaai 170, 1070 Anderlecht  </strong></a
						>
						<strong>Tijd: 17:00 - 21:00 uur</strong><br />
					</p>
				
					<div style="margin: 30px 0; text-align: center">
						<!-- .ics Calendar Button -->
						<a
							target="_blank"
							href="https://shiftfestival.be/shift-festival-2025.ics"
							style="
								background-color: #ef4478;
								color: #fff;
								padding: 12px 24px;
								text-decoration: none;
								border-radius: 8px;
								margin: 5px;
								display: inline-block;
								font-weight: bold;
							"
						>
							Voeg toe aan agenda
						</a>
				
						<!-- Google Calendar Button -->
						<a
							target="_blank"
							href="https://calendar.google.com/calendar/u/0/r/eventedit?text=Shift+Festival+2025&dates=20250620T150000Z/20250621T190000Z&details=Shift+Festival+met+expo,+workshops+en+award-uitreiking&location=Erasmushogeschool+Brussel,+Nijverheidskaai+170,+1070+Anderlecht"
							style="
								background-color: #8fd11c;
								color: #fff;
								padding: 12px 24px;
								text-decoration: none;
								border-radius: 8px;
								margin: 5px;
								display: inline-block;
								font-weight: bold;
							"
						>
							Voeg toe aan Google Calendar
						</a>
					</div>
				
					<p style="font-size: 16px; line-height: 1.6">
						Nogmaals bedankt voor je inschrijving. Tot op
						<strong>Shift</strong>!
					</p>
				
					<p style="font-size: 14px; line-height: 1.6; color: #666">
						Met vriendelijke groeten, <br />
						Het Shift-team  <br />
						Erasmushogeschool Brussel – Multimedia & Creatieve Technologie
					</p>
				
					<img
						src="https://shiftfestival.be/emailBanners/footerMail.png"
						alt="Shift Logo"
						style="width: 100%; margin-bottom: 30px"
					/>
				</div>
				`
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
			text: `Bedankt voor je deelname! Gebruik deze unieke link om te stemmen: ${token}`,
			html: `
				<div
					style="
						font-family: 'Arial', sans-serif;
						background-color: #ffffff;
						color: #333;
						padding: 40px;
						max-width: 600px;
						margin: auto;
						border-radius: 12px;
						box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
					"
				>
					<img
						src="https://shiftfestival.be/emailBanners/bannerMail.png"
						alt="Shift Logo"
						style="width: 100%; margin-bottom: 30px"
					/>
					<p style="font-size: 16px; line-height: 1.6">
						Hallo,<br />
						Wat fijn dat je erbij was op <strong>Shift</strong>! We hopen dat je genoten
						hebt van alle inspirerende projecten, workshops en de unieke sfeer.
					</p>
					<!-- Token Section -->
					<h2 style="color: rgb(0, 0, 0); font-size: 20px; margin-top: 30px">
						Jouw stem-token:
					</h2>
					<p
						style="
							font-size: 20px;
							font-weight: bold;
							background: #f1f1f1;
							padding: 14px;
							border-radius: 8px;
							display: inline-block;
							margin-top: 10px;
						"
					>
						${token}
					</p>
					<p style="font-size: 16px; line-height: 1.6; margin-top: 20px">
						Gebruik deze token om te stemmen via de stempagina of op het event zelf.
					</p>
				
					<div style="margin: 30px 0; text-align: center">
						<a
							target="_blank"
							href="${token}"
							style="
								background-color: #e62474;
								color: #fff;
								padding: 14px 28px;
								text-decoration: none;
								border-radius: 8px;
								font-weight: bold;
							"
						>
							Breng je stem uit</a
						>
					</div>
				
					<p style="font-size: 16px; line-height: 1.6">
						Nogmaals bedankt voor je komst. Tot ziens op een volgende editie van
						<strong>Shift</strong>!
					</p>
					<p style="font-size: 14px; line-height: 1.6; color: #666">
						Met vriendelijke groeten, <br />
						Het Shift-team  <br />
						Erasmushogeschool Brussel – Multimedia & Creatieve Technologie
					</p>
				
					<img
						src="https://shiftfestival.be/emailBanners/footerMail.png"
						alt="Shift Logo"
						style="width: 100%; margin-bottom: 30px"
					/>
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

app.get("/api/counter", (req, res) => {
    createSshTunnelAndConnection((err, connection) => {
        if (err) {
            console.error("SSH/DB connection failed:", err);
            return res.status(500).json({ message: "Database connection error" });
        }

        const totalAttendeesQuery = `SELECT SUM(num_attendees) AS total FROM event_registrations`;
        const countByRoleQuery = `
            SELECT role, COUNT(*) AS registrations
            FROM event_registrations
            GROUP BY role
        `;

        connection.query(totalAttendeesQuery, (err, totalResults) => {
            if (err) {
                connection.end();
                console.error("Error querying total:", err);
                return res.status(500).json({ message: "Error fetching total" });
            }

            connection.query(countByRoleQuery, (err, roleResults) => {
                connection.end();

                if (err) {
                    console.error("Error querying roles:", err);
                    return res.status(500).json({ message: "Error fetching roles" });
                }

                res.json({
                    total: totalResults[0].total || 0,
                    byRole: roleResults // Example: [{ role: 'student', registrations: 15 }, ...]
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

		const token = req.cookies.token;
		const { award_ids, project_id } = req.body;

		if (!token || !Array.isArray(award_ids) || award_ids.length === 0 || !project_id) {
			return res.status(400).json({ message: "token, award_ids (array), and project_id are required" });
		}

		const getVoterQuery = `SELECT id FROM voters WHERE token = ?`;

		connection.query(getVoterQuery, [token], (err, results) => {
			if (err || results.length === 0) {
				connection.end();
				return res.status(404).json({ message: "Invalid token" });
			}

			const voter_id = results[0].id;

			const resultsSummary = {
				successful: [],
				alreadyVoted: [],
				limitReached: [],
				errors: []
			};

			let pending = award_ids.length;

			award_ids.forEach((award_id) => {
				// Check if already voted for this project in this award
				const checkVoteQuery = `
					SELECT id FROM votes
					WHERE voter_id = ? AND award_id = ? AND project_id = ?
				`;

				connection.query(checkVoteQuery, [voter_id, award_id, project_id], (err, voteExists) => {
					if (err) {
						resultsSummary.errors.push({ award_id, error: "DB error" });
						checkDone();
						return;
					}

					if (voteExists.length > 0) {
						resultsSummary.alreadyVoted.push(award_id);
						checkDone();
						return;
					}

					// Count how many votes user already cast for this award
					const countQuery = `
						SELECT COUNT(*) AS vote_count
						FROM votes
						WHERE voter_id = ? AND award_id = ?
					`;

					connection.query(countQuery, [voter_id, award_id], (err, results) => {
						if (err) {
							resultsSummary.errors.push({ award_id, error: "DB error" });
							checkDone();
							return;
						}

						const voteCount = results[0].vote_count;

						if (voteCount >= 3) {
							resultsSummary.limitReached.push(award_id);
							checkDone();
							return;
						}

						// Insert the vote
						const insertQuery = `
							INSERT INTO votes (voter_id, award_id, project_id)
							VALUES (?, ?, ?)
						`;

						connection.query(insertQuery, [voter_id, award_id, project_id], (err) => {
							if (err) {
								resultsSummary.errors.push({ award_id, error: "Insert error" });
							} else {
								resultsSummary.successful.push(award_id);
							}
							checkDone();
						});
					});
				});
			});

			function checkDone() {
				pending--;
				if (pending === 0) {
					connection.end();
					return res.status(200).json(resultsSummary);
				}
			}
		});
	});
});


// Vote
app.delete("/api/vote", (req, res) => {
	createSshTunnelAndConnection((err, connection) => {
		if (err) {
			return res.status(500).json({ message: "Database connection error" });
		}

		const { token, award_id, project_id } = req.body;

		if (!token || !award_id || !project_id) {
			connection.end();
			return res.status(400).json({ message: "token, award_id, and project_id are required" });
		}

		const getVoterQuery = `SELECT id FROM voters WHERE token = ?`;

		connection.query(getVoterQuery, [token], (err, results) => {
			if (err || results.length === 0) {
				connection.end();
				return res.status(404).json({ message: "Invalid token" });
			}

			const voter_id = results[0].id;

			const deleteQuery = `
				DELETE FROM votes
				WHERE voter_id = ? AND award_id = ? AND project_id = ?
			`;

			connection.query(deleteQuery, [voter_id, award_id, project_id], (err, result) => {
				connection.end();

				if (err) {
					return res.status(500).json({ message: "Error removing vote" });
				}

				return res.status(200).json({ message: "Vote removed successfully" });
			});
		});
	});
});

// Get projects per category per voter
app.get("/api/votes", (req, res) => {
	createSshTunnelAndConnection((err, connection) => {
		if (err) {
			console.error("SSH/DB connection failed:", err);
			return res.status(500).json({ message: "Database connection error" });
		}

		const token = req.cookies.token;

		if (!token) {
			return res.status(400).json({ message: "Token is required" });
		}

		const getVoterQuery = `SELECT id FROM voters WHERE token = ?`;

		connection.query(getVoterQuery, [token], (err, results) => {
			if (err || results.length === 0) {
				connection.end();
				return res.status(404).json({ message: "Invalid token" });
			}

			const voter_id = results[0].id;

			const votesQuery = `
				SELECT awards.name AS award_name, projects.id AS project_id, projects.name AS project_name
				FROM votes
				JOIN projects ON votes.project_id = projects.id
				JOIN awards ON votes.award_id = awards.id
				WHERE votes.voter_id = ?
			`;

			connection.query(votesQuery, [voter_id], (err, voteResults) => {
				connection.end();

				if (err) {
					console.error("Error fetching votes:", err);
					return res.status(500).json({ message: "Failed to fetch votes" });
				}

				const groupedVotes = {};

				voteResults.forEach(({ award_name, project_id, project_name }) => {
					if (!groupedVotes[award_name]) {
						groupedVotes[award_name] = [];
					}
					groupedVotes[award_name].push({ project_id, project_name });
				});

				return res.status(200).json({ votes: groupedVotes });
			});
		});
	});
});

app.get("/api/maillist/wants-updates", (req, res) => {
	createSshTunnelAndConnection((err, connection) => {
		if (err) {
			console.error("SSH/DB connection failed:", err);
			return res.status(500).json({ message: "Database connection error" });
		}

		const selectQuery = `SELECT first_name, last_name, email FROM event_registrations WHERE wants_event_updates = 1`;

		connection.query(selectQuery, (err, results) => {
			connection.end();

			if (err) {
				console.error("Error querying database:", err);
				return res.status(500).json({ message: "Sorry something went wrong" });
			}

			const users = results.map(({ first_name, last_name, email }) => ({ first_name, last_name, email }));

			res.json({ users });
		});
	});
});

app.get("/api/maillist/sponsorships", (req, res) => {
	createSshTunnelAndConnection((err, connection) => {
		if (err) {
			console.error("SSH/DB connection failed:", err);
			return res.status(500).json({ message: "Database connection error" });
		}

		const selectQuery = `SELECT first_name, last_name, email, company_name FROM event_registrations WHERE wants_sponsorship = 1`;

		connection.query(selectQuery, (err, results) => {
			connection.end();

			if (err) {
				console.error("Error querying database:", err);
				return res.status(500).json({ message: "Sorry something went wrong" });
			}

			const users = results.map(({ first_name, last_name, email, company_name }) => ({ first_name, last_name, email, company_name }));

			res.json({ users });
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

// Register voter
app.post("/api/register-voter", (req, res) => {
	createSshTunnelAndConnection((err, connection) => {
		if (err) {
			console.error("SSH/DB connection failed:", err);
			return res.status(500).json({ message: "Database connection error" });
		}

		const { email } = req.body;
		//const emailRegex = /^[a-zA-Z0-9._%+-]+@ehb\.be$/;
		// const emailRegex = /^[a-zA-Z0-9._%+-]+@student\.ehb\.be$/;

		// if (!email || !emailRegex.test(email)) {
		// 	connection.end();
		// 	return res.status(400).json({ message: "A valid @ehb.be email is required" });
		// }

		const checkQuery = 'SELECT token FROM voters WHERE email = ?';

		connection.query(checkQuery, [email], (err, results) => {
			if (err) {
				console.error("Query error:", err);
				connection.end();
				return res.status(500).json({ message: "Database query error" });
			}

			if (results.length > 0) {
				connection.end();
				sendEmailWithToken(email, 'https://shiftfestival.be/?token=' + results[0].token);
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

				const tokenLink = 'https://shiftfestival.be/?token=' + token;

				await sendEmailWithToken(email, tokenLink);

				return res.status(201).json({
					message: "Voter registered and token sent",
					token
				});
			});
		});
	});
});

app.get('/api/verify-token', (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ success: false, message: 'Token is required' });
  }

  createSshTunnelAndConnection((err, connection) => {
    if (err) {
      console.error('SSH/DB connection failed:', err);
      return res.status(500).json({ success: false, message: 'Database connection error' });
    }

    const query = 'SELECT email FROM voters WHERE token = ? LIMIT 1';

    connection.query(query, [token], (err, results) => {
      connection.end();

      if (err) {
        console.error('Query error:', err);
        return res.status(500).json({ success: false, message: 'Database query error' });
      }

      if (results.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid token' });
      }

      res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        domain: '.shiftfestival.be',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      return res.json({ success: true });
    });
  });
});


// Validate token OLD
app.post("/api/validate-token", (req, res) => {
	const { token } = req.body;

	if (!token) {
		return res.status(400).json({ message: "❌ Token ontbreekt." });
	}

	createSshTunnelAndConnection((err, connection) => {
		if (err) {
			console.error("SSH/DB connection failed:", err);
			return res.status(500).json({ message: "❌ Fout bij databaseverbinding." });
		}

		const sql = `SELECT email FROM voters WHERE token = ? LIMIT 1`;

		connection.query(sql, [token], (err, results) => {
			connection.end();

			if (err || results.length === 0) {
				console.error("❌ Ongeldige token.");
				return res.status(401).json({ message: "❌ Ongeldige of onbekende token." });
			}

			const email = results[0].email;
			return res.status(200).json({ message: "✅ Token geldig.", email });
		});
	});
});

app.get('/api/user-status', (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.json({ verified: false });
  }

  createSshTunnelAndConnection((err, connection) => {
    if (err) {
      console.error("SSH/DB connection failed:", err);
      return res.status(500).json({ verified: false, message: "Database connection error" });
    }

    const sql = `SELECT email FROM voters WHERE token = ? LIMIT 1`;

    connection.query(sql, [token], (err, results) => {
      connection.end();

      if (err || results.length === 0) {
        console.error("Invalid token.");
        return res.json({ verified: false });
      }

      // Token is valid
      return res.json({ verified: true, email: results[0].email });
    });
  });
});

// Start server
app.listen(3000, () => {
	console.log("🚀 Server started on port 3000");
});
