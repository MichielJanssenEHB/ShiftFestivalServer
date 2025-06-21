const express = require("express");
const app = express();
const mysql = require("mysql2");
require("dotenv").config();
const cors = require("cors");
const nodemailer = require("nodemailer");
const { Client } = require('ssh2');
const fs = require('fs');
const crypto = require("crypto");
const cookieParser = require('cookie-parser');

/*
	CORS URLs: Add every url here that needs to be allowed by CORS.
*/
const allowedOrigins = ['https://shiftfestival.be', 'http://localhost:5173' , 'https://multimedia.brussels'];

/*
	CORS implementation.
*/
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

/*
	Use of express json and cookieParses to read cookies
*/
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


/*
	Database configuration: You need a SSH tunnel to connect to the Combell database. Just make an .env in the root folder for testing and in combell under NodeJS you add these variables aswell for production.
*/
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
	/*
		Make key pair using PuttyGEN. Then save public key in combell under FTP & SSH -> SSH. 
		The private key you upload under NodeJS -> environment variables (just paste it as string, the regex will put it in the right format). 
		For testing have it somewhere secure (DONT PUSH IT TO GITHUB) and set your path in the .env file. 
		Now the first line here is for production. So uncomment this when trying to push for production.
		Uncomment second line and comment first if you just wanna test on localhost.
	*/
	privateKey: process.env.SSH_PK.replace(/\\n/g, '\n'),
	//privateKey: fs.readFileSync(process.env.SSH_PK_PATH)
};

const forwardConfig = {
	srcHost: '127.0.0.1',
	srcPort: 3306,
	dstHost: dbConfig.host,
	dstPort: dbConfig.port
};

/*
	SSH tunnel logic with prevention that the SSH connection doesn't get lost when idling.
*/
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

/*
	Email transporter to send automated mails
*/
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

/*
	Example of a mail
*/
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

/*
	Another example of a mail
*/
const sendEmailOneDay = async (to, name) => {
	try {
		const info = await transporter.sendMail({
			from: '"Shift Festival" <info@shiftfestival.be>',
			to,
			subject: `Welkom bij Shift Festival, ${name}!`,
			text: `Morgen is het zover, Shiftf Festival 2025!`,
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
        Hallo ${name},<br /><br />
        Morgen verwelkomen we je op <strong>Shift Festival 2025</strong>! Alles
        staat klaar voor een inspirerende avond vol creativiteit.<br /><br />
        Kom de eindprojecten van onze studenten ontdekken en maak kennis met hun
        innovatieve ideeën en toekomstplannen. We sluiten de avond feestelijk af met
        de prijsuitreiking en een spetterende <strong>VJ-Set</strong>.<br /><br />
        Alle informatie vind je op
        <a target="_blank" href="https://shiftfestival.be/"
            >https://shiftfestival.be/</a
        >.
    </p>
    <h2 style="color: #000; font-size: 20px; margin-top: 30px; font-weight: bold">
        Praktische info:
    </h2>
    <p style="font-size: 16px; line-height: 1.6; color: #000">
        <strong>Datum: Vrijdag 20 juni 2025</strong><br />
        <strong>Locatie:</strong>
        <a href="https://maps.app.goo.gl/tQqbCeLRXPSfydr18" target="_blank"
            ><strong>Campus Kaai – Nijverheidskaai 170, 1070 Anderlecht</strong></a
        ><br />
        <strong>Tijd: 17:00 - 21:00 uur</strong><br />
    </p>
 
    <p style="font-size: 16px; line-height: 1.6">
        We kijken ernaar uit je morgen te zien op <strong>Shift</strong>!
    </p>
    <p style="font-size: 14px; line-height: 1.6; color: #666">
        Met vriendelijke groeten,<br />
        Het Shift-team<br />
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

/*
	Mail send after an EHB user registers to vote.
*/
const sendEmailWithToken = async (to, token) => {
	try {
		const info = await transporter.sendMail({
			from: '"Shift Festival" <info@shiftfestival.be>',
			to,
			subject: "Je token om eindprojecten MCT te nomineren op shiftfestival.be",
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
						Hi,,<br />
						Fijn dat je je aangemeld hebt om je favoriete eindprojecten MTC te nomineren voor de Golden Mike awards.
					</p>
					<h2 style="color: rgb(0, 0, 0); font-size: 20px; margin-top: 30px">
						Hoe werkt het? Niet moeilijk! 
					</h2>
					<p
					>
					<li style="width: 100%; margin-bottom: 10px">Klik op onderstaande link ${token}</li>
                    <li style="width: 100%; margin-bottom: 10px">Je komt terecht op de pagina met alle projecten</li>
                    <li style="width: 100%; margin-bottom: 10px">Bekijk de pagina van het project dat je wilt nomineren en klik rechtsboven op de knop ‘Nomineer dit project’.</li>
                    <li style="width: 100%; margin-bottom: 10px">Er verschijnt een overlay waarin je kunt aangeven voor welke awards dit project in aanmerking komt (je kunt één of meerdere aanduiden).</li>
                    <li style="width: 100%; margin-bottom: 10px">Nomineer in totaal maximaal drie projecten per awardcategorie (minder mag ook).</li>
                    <li style="width: 100%; margin-bottom: 10px">In de navigatie vind je op elk moment een link naar je persoonlijke dashboard, waar je een overzicht hebt van al je genomineerde projecten per awardcategorie.</li>
                    <li style="width: 100%; margin-bottom: 10px">Je kunt tot en met <span style="font-weight: 700;">donderdag 19/06</span> 16u nog wijzigingen of aanvullingen doen in je nominaties.</li>
                    <li style="width: 100%; margin-bottom: 10px">Op <span style="font-weight: 700;">donderdag 19/06 om 16u</span> worden alle nominaties opgeteld en bekijkt een selecte jury wie de winnaars zijn per awardcategorie.</li>
					</p>
					<p style="font-size: 16px; line-height: 1.6; margin-top: 20px">
						Elke stem is belangrijk en waardevol voor de afstuderende MCT-studenten. Bedankt voor je deelname!
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

/*
	Route to test if you can talk with the backend
*/
app.get("/api", (req, res) => {
	res.json({ fruits: ["apple", "banana", "grape"] });
});

// ===========================================
/*
	Logic for the physical voting machine.
*/
let showVotingPage = false;

app.post('/api/toggleVotingPage', (req, res) => {
  showVotingPage = !showVotingPage;
  console.log('Boolean toggled. New value:', showVotingPage);
  res.json({ success: true, showVotingPage });
});

app.get('/api/showVotingPage', (req, res) => {
  res.json({ showVotingPage });
});
// ===========================================

/*
	'Inscchrijvingen' logic.
*/
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

/*
	A counter to check the number of attendees.
*/
app.get("/api/counter", (req, res) => {
	createSshTunnelAndConnection((err, connection) => {
		if (err) {
			console.error("SSH/DB connection failed:", err);
			return res.status(500).json({ message: "Database connection error" });
		}

		const countUsers = 'SELECT SUM(num_attendees) AS total FROM event_registrations';

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

/*
	Voting logic for the teachers.
*/
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


/*
	Teacher voting delete logic.
*/
app.delete("/api/vote", (req, res) => {
	createSshTunnelAndConnection((err, connection) => {
		if (err) {
			return res.status(500).json({ message: "Database connection error" });
		}

		const token = req.cookies.token;
		const { award_id, project_id } = req.body;

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

/*
	Fetch all the 3th years projects.
*/
app.get('/api/projects', (req, res) => {
  createSshTunnelAndConnection((err, connection) => {
    if (err) {
      console.error('SSH/DB connection failed:', err);
      return res.status(500).json({ message: 'Database connection error' });
    }

    const query = `
      SELECT
	  	id,
        name,
        creator_name,
        description,
        key_image_path,
        magazine_pdf_path,
        linkedin_link,
		linkedin_link_two,
        showreel_link,
        promotor_name,
        category,
        room
      FROM projects
      ORDER BY name;
    `;

    connection.query(query, (err, results) => {
      connection.end();

      if (err) {
        console.error('Error querying database:', err);
        return res.status(500).json({ message: 'Sorry something went wrong' });
      }

      res.json(results);
    });
  });
});

/*
	Get the project of 1 specific student
*/
app.get('/api/projects/:creator_name', (req, res) => {
	const rawCreator = req.params.creator_name.trim();

	if (!rawCreator) {
		return res.status(400).json({ message: "Missing creator name" });
	}

  	/*
  		This regex logic is here because the urls where not correctly set for QR codes. This code checks for - characters to split 2 people but 1 person had a - character in its firstname so to handle this I made this regex function.
	*/
	let primaryNamePart = rawCreator.split('&')[0].trim();


	let dashIndex = primaryNamePart.indexOf('-');
	if (dashIndex > 6) {
	primaryNamePart = 
		primaryNamePart.slice(0, dashIndex) + ' - ' + primaryNamePart.slice(dashIndex + 1);
	}

	console.log("Primary part " + primaryNamePart)

	const creatorFormatted = primaryNamePart
	.replace(/[_]/g, ' ')
	.replace(/([a-z])([A-Z])/g, '$1 $2')
	.replace(/\s+/g, ' ')
	.trim();

	console.log("Name " + creatorFormatted);
	/*
		Regex stops here
	*/

  createSshTunnelAndConnection((err, connection) => {
    if (err) {
      console.error('SSH/DB connection failed:', err);
      return res.status(500).json({ message: 'Database connection error' });
    }

    const query = `
      SELECT
	  	id,
        name,
        creator_name,
        description,
        key_image_path,
        magazine_pdf_path,
        linkedin_link,
		linkedin_link_two,
        showreel_link,
        promotor_name,
        category,
        room
      FROM projects
      WHERE creator_name = ?
      LIMIT 1;
    `;

    connection.query(query, [creatorFormatted], (err, results) => {
      connection.end();

      if (err) {
        console.error('Error querying database:', err);
        return res.status(500).json({ message: 'Sorry something went wrong' });
      }

      res.json(results);
    });
  });
});


/*
	Get projects per category and per voter
*/
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


/*
	Json list to see who wants update emails for the event (U use this to send automated mails in the future to these people). 
*/
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

/*
	List of all the companies that wants to sponsor (if there are make sure Mike knows).
*/
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

/*
	Add a vote to a certain project (used for public voting).
*/
app.post("/api/publieksvotes/:project_id", (req, res) => {
	const projectID = req.params.project_id;

	createSshTunnelAndConnection((err, connection) => {
		if (err) {
			console.error("SSH/DB connection failed:", err);
			return res.status(500).json({ message: "Database connection error" });
		}

		const selectQuery = `SELECT vote_count FROM publieks_votes WHERE project_id = ?`;
		const insertQuery = `INSERT INTO publieks_votes (project_id, vote_count) VALUES (?, 1)`;
		const updateQuery = `UPDATE publieks_votes SET vote_count = vote_count + 1 WHERE project_id = ?`;

		connection.query(selectQuery, [projectID], (err, results) => {
			if (err) {
				connection.end();
				console.error("Select error:", err);
				return res.status(500).json({ message: "Database error during select" });
			}

			if (results.length > 0) {
				connection.query(updateQuery, [projectID], (err) => {
					if (err) {
						connection.end();
						console.error("Update error:", err);
						return res.status(500).json({ message: "Failed to update vote count" });
					}

					connection.query(selectQuery, [projectID], (err, updatedResults) => {
						connection.end();

						if (err) {
							return res.status(500).json({ message: "Failed to fetch updated vote count" });
						}

						return res.status(200).json({
							message: "Vote counted",
							vote_count: updatedResults[0].vote_count
						});
					});
				});
			} else {
				connection.query(insertQuery, [projectID], (err) => {
					if (err) {
						connection.end();
						console.error("Insert error:", err);
						return res.status(500).json({ message: "Failed to insert vote" });
					}

					connection.end();
					return res.status(200).json({
						message: "Vote counted",
						vote_count: 1
					});
				});
			}
		});
	});
});

/*
	Get a list of the public votes (ranked most to least votes, handy for live show team).
*/
app.get("/api/publieksvotes", (req, res) => {
	createSshTunnelAndConnection((err, connection) => {
		if (err) {
			console.error("SSH/DB connection failed:", err);
			return res.status(500).json({ message: "Database connection error" });
		}

		const query = `
			SELECT p.id, p.name, COALESCE(v.vote_count, 0) AS vote_count
			FROM projects p
			LEFT JOIN publieks_votes v ON p.id = v.project_id
			ORDER BY vote_count DESC
		`;

		connection.query(query, (err, results) => {
			connection.end();

			if (err) {
				console.error("Query error:", err);
				return res.status(500).json({ message: "Failed to fetch vote counts" });
			}

			res.status(200).json(results);
		});
	});
});


/*
	Call if you wanna see how many public votes one project has.
*/
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

/*
	Logic to check if its an EHB user and sending them a mail with their unique token.
*/
app.post("/api/register-voter", (req, res) => {
	createSshTunnelAndConnection((err, connection) => {
		if (err) {
			console.error("SSH/DB connection failed:", err);
			return res.status(500).json({ message: "Database connection error" });
		}

		const { email } = req.body;
		const emailRegex = /^[a-zA-Z0-9._%+-]+@ehb\.be$/;

		if (!email || !emailRegex.test(email)) {
			connection.end();
			return res.status(400).json({ message: "A valid @ehb.be email is required" });
		}

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

/*
	Logic to set unique token as a cookie in the users device.
*/
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

/*
	Logic to check if the user has a valid token to vote.
*/
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

      return res.json({ verified: true, email: results[0].email });
    });
  });
});


/*
	Another mail example
*/
const generateLastEmail = (name) => `<div
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
        Hallo ${name},<br /><br />
        Vandaag verwelkomen we je op <strong>Shift Festival 2025</strong>! Vanaf
        17:00 uur staat alles klaar om jou te ontvangen.<br /><br />
        Tijdens het event krijg je de kans om de eindprojecten van onze studenten te
        ontdekken. Daarnaast sluiten we af met een feestelijke prijsuitreiking en
        VJ-Set.<br /><br />
        Alle informatie vind je op
        <a target="_blank" href="https://shiftfestival.be/"
            >https://shiftfestival.be/</a
        >.
    </p>
    <h2 style="color: #000; font-size: 20px; margin-top: 30px; font-weight: bold">
        Praktische info:
    </h2>
    <p style="font-size: 16px; line-height: 1.6; color: #000">
        <strong>Datum: Vrijdag 20 juni 2025</strong><br />
        <strong>Locatie:</strong>
        <a href="https://maps.app.goo.gl/tQqbCeLRXPSfydr18" target="_blank"
            ><strong>Campus Kaai – Nijverheidskaai 170, 1070 Anderlecht</strong></a
        ><br />
        <strong>Tijd: 17:00 - 21:00 uur</strong><br />
    </p>
    <p style="font-size: 16px; line-height: 1.6">
        Tot vanavond op <strong>Shift</strong>!
    </p>
    <p style="font-size: 14px; line-height: 1.6; color: #666">
        Met vriendelijke groeten,<br />
        Het Shift-team<br />
        Erasmushogeschool Brussel – Multimedia & Creatieve Technologie
    </p>
    <img
        src="https://shiftfestival.be/emailBanners/footerMail.png"
        alt="Shift Logo"
        style="width: 100%; margin-bottom: 30px"
    />
</div>
				`;


/*
	The mail above is called by this function (Important, even if you test this function in localhost it will send out emails so be carefull, you don't wanna spam mails to users!).
*/
app.post("/api/maillist/send-invite-emails", async (req, res) => {
	createSshTunnelAndConnection((err, connection) => {
		if (err) {
			console.error("SSH/DB connection failed:", err);
			return res.status(500).json({ message: "Database connection error" });
		}

		const selectQuery = `
		SELECT first_name, last_name, email 
		FROM event_registrations 
		WHERE wants_event_updates = 1
	`;


		connection.query(selectQuery, async (err, results) => {
			connection.end();

			if (err) {
				console.error("Error querying database:", err);
				return res.status(500).json({ message: "Sorry, something went wrong" });
			}

			for (const { first_name, email } of results) {
				const name = first_name || "Shift-bezoeker";

				const htmlMessage = generateLastEmail(name);

				try {
					await transporter.sendMail({
						from: '"Shift Festival" <info@shiftfestival.be>',
						to: email,
						subject: "Vandaag is het zover, Shift Festival 2025!",
						html: htmlMessage
					});
					console.log(`📧 Uitnodiging verstuurd naar: ${email}`);
				} catch (err) {
					console.error(`❌ Fout bij verzenden naar ${email}:`, err);
				}
			}

			res.status(200).json({ message: "Alle e-mails zijn verzonden." });
		});
	});
});


/*
	Start server
*/
app.listen(3000, () => {
	console.log("🚀 Server started on port 3000");
});