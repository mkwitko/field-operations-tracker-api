import { google } from "googleapis";

export function getSheetsClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  const sheets = google.sheets({ version: "v4", auth: oauth2Client });
  return sheets;
}
