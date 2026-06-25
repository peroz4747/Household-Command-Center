import { google } from "googleapis";
import readline from "readline";

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "http://localhost:3000/oauth2callback"
);

const scopes = [
    "https://www.googleapis.com/auth/calendar"
];

const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
});

console.log(url);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question("Code: ", async (code) => {

    const { tokens } = await oauth2Client.getToken(code);

    console.log(tokens);

    rl.close();

});